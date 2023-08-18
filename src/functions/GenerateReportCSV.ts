/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { AthenaClient, GetQueryExecutionCommand, GetQueryExecutionCommandOutput, GetQueryResultsCommand, QueryExecutionState, StartQueryExecutionCommand, StartQueryExecutionCommandInput } from '@aws-sdk/client-athena';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const logger = new Logger({
  serviceName: 'GenerateReportCSV',
});
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const athenaClient = new AthenaClient({});
const s3Client = new S3Client({});
export const onEvent = async (
  event?: any,
  //@ts-ignore
  context: Context,
  //@ts-ignore
  callback: Callback,
): Promise<boolean> => {
  logger.info(`Event: ${JSON.stringify(event)}`);


  await dropTable(athenaClient);
  const loadPartitionsResponse = await loadPartitions(athenaClient);
  if (loadPartitionsResponse != undefined && loadPartitionsResponse.QueryExecution?.Status?.State == QueryExecutionState.SUCCEEDED) {
    const dateString = await getMaxDateString(athenaClient);
    const createTableResponse = await createTable(athenaClient, dateString);
    if (createTableResponse != undefined && QueryExecutionState.SUCCEEDED == createTableResponse.QueryExecution?.Status?.State) {
      logger.info(`Create table succeeded: ${JSON.stringify(createTableResponse)}`);
      const manifestUri = new URL(createTableResponse.QueryExecution.Statistics?.DataManifestLocation!);
      const manifestBucket = manifestUri.hostname;
      const manifestKey = manifestUri.pathname.substring(1);

      logger.info(`Retrieving manifest from : ${manifestBucket}/${manifestKey}`);
      const getObjectResponse = await s3Client.send(new GetObjectCommand({
        Bucket: manifestBucket,
        Key: manifestKey,
      }));
      const dataFileLocation = await getObjectResponse.Body?.transformToString();
      if (dataFileLocation != undefined && dataFileLocation!='') {
        logger.info(`Data file located at: '${dataFileLocation}'`);
        const dataFileUri = new URL(dataFileLocation);
        const dataFileBucket = dataFileUri.hostname;
        const dataFileKey = dataFileUri.pathname.substring(1);
        await s3Client.send(new CopyObjectCommand({
          CopySource: `${dataFileBucket}/${dataFileKey}`,
          Key: `tag-inventory-${dateString}.csv.gz`,
          Bucket: process.env.REPORT_BUCKET,
        }));
        await s3Client.send(new DeleteObjectCommand({
          Bucket: dataFileBucket,
          Key: dataFileKey,
        }));
      } else {
        throw new Error(`Could not determine data file location: '${dataFileLocation}'`);
      }
      const dropTableResponse = await dropTable(athenaClient);
      if (dropTableResponse != undefined && QueryExecutionState.SUCCEEDED == dropTableResponse.QueryExecution?.Status?.State) {
        logger.info(`Deleting tables from ${manifestBucket}`);
        await s3Client.send(new DeleteObjectCommand({
          Bucket: manifestBucket,
          Key: 'tables',
        }));
      } else {
        throw new Error('Could not drop table');
      }

    } else {
      throw new Error('Could not create table');
    }
  } else {
    throw new Error('Could not load partitions');

  }

  return true;


};

async function dropTable(client: AthenaClient) {
  logger.info('Dropping table');
  return executeCommand(client, `DROP TABLE IF EXISTS \`${process.env.DATABASE}.tag_inventory_csv\`;`);
}

async function loadPartitions(client: AthenaClient): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info('Loading partitions');
  const loadPartitionsStatement = `MSCK REPAIR TABLE \`${process.env.DATABASE}.${process.env.TAG_INVENTORY_TABLE}\`;`;
  return executeCommand(client, loadPartitionsStatement);
}

async function createTable(client: AthenaClient, dateString: string): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info('Creating table');
  const createTableStatement = `CREATE TABLE \"${process.env.DATABASE}\".\"tag_inventory_csv\"\n` +
		'WITH (\n' +
		"      format = 'TEXTFILE',\n" +
		"      field_delimiter = ',',\n" +
		`      external_location = 's3://${process.env.REPORT_BUCKET}/${dateString}',\n` +
		"      bucketed_by = ARRAY['d'],\n" +
		'      bucket_count = 1)\n' +
		`AS (\n SELECT d,tagname,tagvalue,r.owningAccountId,r.region,r.service,r.resourceType,r.arn FROM \"${process.env.DATABASE}\".\"${process.env.TAG_INVENTORY_TABLE}\", unnest(\"resources\") as t (\"r\") where d=(select max(d) from \"${process.env.DATABASE}\".\"${process.env.TAG_INVENTORY_TABLE}\")\n);`;

  return executeCommand(client, createTableStatement);
}

async function getMaxDateString(client: AthenaClient): Promise<string> {
  logger.info('Getting max date');
  let dateString = new Date().toISOString().substring(0, 10);
  const maxDate = `SELECT max(d) from \"${process.env.DATABASE}\".\"${process.env.TAG_INVENTORY_TABLE}\";`;
  const response = await executeCommand(client, maxDate);
  if (response != undefined && response.QueryExecution?.Status?.State == QueryExecutionState.SUCCEEDED) {
    const queryResultsResponse= await client.send(new GetQueryResultsCommand({
      QueryExecutionId: response.QueryExecution.QueryExecutionId,
    }));
    //get the result from queryResultsResponse
    if (queryResultsResponse.ResultSet!=undefined && queryResultsResponse.ResultSet.Rows!=undefined &&
      queryResultsResponse.ResultSet.Rows[1].Data!=undefined && queryResultsResponse.ResultSet.Rows[1].Data[0].VarCharValue!=undefined) {
      dateString = queryResultsResponse.ResultSet.Rows[1].Data[0].VarCharValue;
    }

  }
  logger.info(`Date string: ${dateString}`);
  return dateString;
}

async function executeCommand(client: AthenaClient, command: string): Promise<GetQueryExecutionCommandOutput | undefined> {
  const input: StartQueryExecutionCommandInput = { // StartQueryExecutionInput
    QueryString: command, // required
    WorkGroup: process.env.WORKGROUP,
  };
  let response: GetQueryExecutionCommandOutput | undefined = undefined;
  const startQueryExecutionResponse = await client.send(new StartQueryExecutionCommand(input));
  let sleepLoopCount = 0;
  while (response == undefined || ['RUNNING', 'QUEUED'].includes(response.QueryExecution?.Status?.State!)) {
    // @ts-ignore
    response = await client.send(new GetQueryExecutionCommand({
      QueryExecutionId: startQueryExecutionResponse?.QueryExecutionId,
    }));
    if (QueryExecutionState.FAILED == response.QueryExecution?.Status?.State) {
      logger.error(`${JSON.stringify(response.QueryExecution?.Status?.AthenaError)}`);
    } else {
      logger.info(`Response: ${JSON.stringify(response)}`);
    }
    await sleep(3000);
    if (sleepLoopCount++ > 5) {
      throw new Error('Create table query took too long');
    }
  }
  return response;
}
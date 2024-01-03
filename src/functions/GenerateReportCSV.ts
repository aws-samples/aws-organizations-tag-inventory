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

import { Logger } from "@aws-lambda-powertools/logger";
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryExecutionCommandOutput,
  GetQueryResultsCommand,
  QueryExecutionState,
  StartQueryExecutionCommand,
  StartQueryExecutionCommandInput,
} from "@aws-sdk/client-athena";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const logger = new Logger({
  serviceName: "GenerateReportCSV",
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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

  await dropTagInventoryLatestCsvTable(athenaClient);

  if (await run(athenaClient, loadPartitions)) {
    const dateString = await getMaxDateString(athenaClient);
    if (
      (await run(athenaClient, createTagInventoryExternalTable)) &&
      (await run(athenaClient, updateTagInventoryExternalTable))
    ) {
      if (await run(athenaClient, createTagInventoryLatestView)) {
        if (await run(athenaClient, createTagInventoryLatestTopTenView)) {
          if (
            await run(
              athenaClient,
              createTagInventoryLatestTaggedVsUntaggedView,
            )
          ) {
            const createTagInventoryLatestCsvTableResponse =
              await createTagInventoryLatestCsvTable(athenaClient, dateString);
            if (
              createTagInventoryLatestCsvTableResponse != undefined &&
              QueryExecutionState.SUCCEEDED ==
                createTagInventoryLatestCsvTableResponse.QueryExecution?.Status
                  ?.State
            ) {
              logger.info(
                `Create table succeeded: ${JSON.stringify(
                  createTagInventoryLatestCsvTableResponse,
                )}`,
              );
              const manifestUri = new URL(
                createTagInventoryLatestCsvTableResponse.QueryExecution
                  .Statistics?.DataManifestLocation!,
              );
              const manifestBucket = manifestUri.hostname;
              const manifestKey = manifestUri.pathname.substring(1);
              logger.info(
                `Retrieving manifest from : ${manifestBucket}/${manifestKey}`,
              );
              const getObjectResponse = await s3Client.send(
                new GetObjectCommand({
                  Bucket: manifestBucket,
                  Key: manifestKey,
                }),
              );
              const dataFileLocation =
                await getObjectResponse.Body?.transformToString();
              if (dataFileLocation != undefined && dataFileLocation != "") {
                logger.info(`Data file located at: '${dataFileLocation}'`);
                const dataFileUri = new URL(dataFileLocation);
                const dataFileBucket = dataFileUri.hostname;
                const dataFileKey = dataFileUri.pathname.substring(1);
                await s3Client.send(
                  new CopyObjectCommand({
                    CopySource: `${dataFileBucket}/${dataFileKey}`,
                    Key: `tag-inventory-${dateString}.csv.gz`,
                    Bucket: process.env.REPORT_BUCKET,
                  }),
                );
                await s3Client.send(
                  new DeleteObjectCommand({
                    Bucket: dataFileBucket,
                    Key: dataFileKey,
                  }),
                );
              } else {
                throw new Error(
                  `Could not determine data file location: '${dataFileLocation}'`,
                );
              }
              const dropTableResponse =
                await dropTagInventoryLatestCsvTable(athenaClient);
              if (
                dropTableResponse != undefined &&
                QueryExecutionState.SUCCEEDED ==
                  dropTableResponse.QueryExecution?.Status?.State
              ) {
                logger.info(`Deleting tables from ${manifestBucket}`);
                await s3Client.send(
                  new DeleteObjectCommand({
                    Bucket: manifestBucket,
                    Key: "tables",
                  }),
                );
              } else {
                throw new Error("Could not drop table");
              }
            } else {
              throw new Error(
                "Could not create external table: tag-inventory-latest-csv",
              );
            }
          } else {
            throw new Error(
              "Could not create view: tag-inventory-view-latest-tagged-vs-untagged",
            );
          }
        } else {
          throw new Error(
            "Could not create view: tag-inventory-latest-top-ten",
          );
        }
      } else {
        throw new Error("Could not create view: tag-inventory-latest");
      }
    } else {
      throw new Error("Could not create external table: tag-inventory");
    }
  } else {
    throw new Error("Could not load partitions");
  }

  return true;
};

async function run(
  client: AthenaClient,
  fn: (
    client: AthenaClient,
  ) => Promise<GetQueryExecutionCommandOutput | undefined>,
): Promise<boolean> {
  const response = await fn(client);
  if (
    response != undefined &&
    QueryExecutionState.SUCCEEDED == response.QueryExecution?.Status?.State
  ) {
    return true;
  } else {
    return false;
  }
}

async function dropTagInventoryLatestCsvTable(client: AthenaClient) {
  logger.info("Dropping table: tag-inventory-latest-csv");
  return executeCommand(
    client,
    `DROP TABLE IF EXISTS \`${process.env.DATABASE}.tag-inventory-latest-csv\`;`,
  );
}

async function loadPartitions(
  client: AthenaClient,
): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info("Loading partitions");
  const loadPartitionsStatement = `MSCK REPAIR TABLE \`${process.env.DATABASE}.${process.env.TAG_INVENTORY_TABLE}\`;`;
  return executeCommand(client, loadPartitionsStatement);
}

async function createTagInventoryExternalTable(
  client: AthenaClient,
): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info("Creating external table: tag-inventory");
  const statement =
    `CREATE TABLE IF NOT EXISTS \"${process.env.DATABASE}\".\"tag-inventory\"` +
    "WITH (" +
    "			table_type='HIVE'," +
    "					format = 'PARQUET'," +
    "					parquet_compression = 'SNAPPY'," +
    `					external_location = 's3://${process.env.ATHENA_BUCKET}/tables/tag-inventory/',` +
    "         partitioned_by=array['d']" +
    ")" +
    `AS
    SELECT 
     tagname
    , tagvalue
    , r.owningAccountId
    , r.region
    , r.service
    , r.resourceType
    , r.arn
    , d
    FROM
      \"${process.env.DATABASE}\".\"${process.env.TAG_INVENTORY_TABLE}\"
    , UNNEST("resources") t ("r")
     WITH NO DATA
   	 
    `;
  return executeCommand(client, statement);
}

async function updateTagInventoryExternalTable(
  client: AthenaClient,
): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info("Creating external table: tag-inventory");
  const statement =
    `insert into \"${process.env.DATABASE}\".\"tag-inventory\"  ` +
    `SELECT tagname
    ,tagvalue
    ,r.owningAccountId as owningAccountId
    ,r.region as region
    ,r.service as service
    ,r.resourceType as resourceType
    ,r.arn as arn
    ,d
    FROM
      \"${process.env.DATABASE}\".\"${process.env.TAG_INVENTORY_TABLE}\"
    , UNNEST("resources") t ("r")
    `;
  return executeCommand(client, statement);
}

async function createTagInventoryLatestView(
  client: AthenaClient,
): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info("Creating view: tag-inventory-view-latest");
  const createViewStatement = `CREATE OR REPLACE VIEW \"${process.env.DATABASE}\".\"tag-inventory-view-latest\" AS
    SELECT
      d
    , tagname
    , tagvalue
    , owningAccountId
    , region
    , service
    , resourceType
    , arn
    FROM
      \"${process.env.DATABASE}\"."tag-inventory"
   
    where d = (select max(d) from \"${process.env.DATABASE}\"."tag-inventory")
    ORDER BY d DESC, tagname DESC, tagvalue DESC
    `;
  return executeCommand(client, createViewStatement);
}

async function createTagInventoryLatestTaggedVsUntaggedView(
  client: AthenaClient,
): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info("Creating view: tag-inventory-view-latest-tagged-vs-untagged");
  const createViewStatement = `CREATE OR REPLACE VIEW \"${process.env.DATABASE}\".\"tag-inventory-view-latest-tagged-vs-untagged\" AS
		select kv1 [ 'tagged' ] as tagged,
	kv1 [ 'untagged' ] as untagged
from (
		select map_agg(k, v) kv1
		from (
				select 'untagged' as k,
					count(distinct arn) v
				from \"${process.env.DATABASE}\"."tag-inventory-view-latest"
				where tagname = 'NoTag'
				union all
				select 'tagged' as k,
					count(distinct arn) v
				from \"${process.env.DATABASE}\"."tag-inventory-view-latest"
				where tagname != 'NoTag'
			)
	)`;
  return executeCommand(client, createViewStatement);
}

async function createTagInventoryLatestTopTenView(
  client: AthenaClient,
): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info("Creating view: tag-inventory-view-latest-top-ten");
  const createViewStatement = `CREATE OR REPLACE VIEW \"${process.env.DATABASE}\".\"tag-inventory-view-latest-top-ten\" AS
			 SELECT
				tagname,
				tagvalue,
				count(distinct arn) as resource_count
		FROM \"${process.env.DATABASE}\"."tag-inventory-view-latest"
		group by 
				tagname, tagvalue
		ORDER BY 
				resource_count DESC,
				tagname DESC,
				tagvalue DESC
				limit 10`;
  return executeCommand(client, createViewStatement);
}

async function createTagInventoryLatestCsvTable(
  client: AthenaClient,
  dateString: string,
): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info("Creating table: tag-inventory-latest-csv");
  const createTableStatement =
    `CREATE TABLE \"${process.env.DATABASE}\".\"tag-inventory-latest-csv\"` +
    "WITH (" +
    "      format = 'TEXTFILE'," +
    "      field_delimiter = ','," +
    `      external_location = 's3://${process.env.REPORT_BUCKET}/${dateString}',` +
    "      bucketed_by = ARRAY['d']," +
    "      bucket_count = 1)" +
    `AS (
			select * from ( 
					select 'date' as d,'tagname' as tagname,'tagvalue'as tagvalue,'owningaccountid' as owningaccountid,'region' as region,'service' as service,'resourcetype' as resourcetype,'arn' as arn 
					union all 
					SELECT d,tagname,tagvalue,owningaccountid, region,service,resourcetype, arn FROM \"${process.env.DATABASE}\".\"tag-inventory-view-latest\") 
					
		) order by d desc, tagname asc;`;

  return executeCommand(client, createTableStatement);
}

async function getMaxDateString(client: AthenaClient): Promise<string> {
  logger.info("Getting max date");
  let dateString = new Date().toISOString().substring(0, 10);
  const maxDate = `SELECT max(d) from \"${process.env.DATABASE}\".\"${process.env.TAG_INVENTORY_TABLE}\";`;
  const response = await executeCommand(client, maxDate);
  if (
    response != undefined &&
    response.QueryExecution?.Status?.State == QueryExecutionState.SUCCEEDED
  ) {
    const queryResultsResponse = await client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: response.QueryExecution.QueryExecutionId,
      }),
    );
    //get the result from queryResultsResponse
    if (
      queryResultsResponse.ResultSet != undefined &&
      queryResultsResponse.ResultSet.Rows != undefined &&
      queryResultsResponse.ResultSet.Rows[1].Data != undefined &&
      queryResultsResponse.ResultSet.Rows[1].Data[0].VarCharValue != undefined
    ) {
      dateString = queryResultsResponse.ResultSet.Rows[1].Data[0].VarCharValue;
    }
  }
  logger.info(`Date string: ${dateString}`);
  return dateString;
}

async function executeCommand(
  client: AthenaClient,
  command: string,
): Promise<GetQueryExecutionCommandOutput | undefined> {
  logger.info(`Execute statement: ${command}`);
  const input: StartQueryExecutionCommandInput = {
    // StartQueryExecutionInput
    QueryString: command, // required
    WorkGroup: process.env.WORKGROUP,
  };
  let response: GetQueryExecutionCommandOutput | undefined = undefined;
  const startQueryExecutionResponse = await client.send(
    new StartQueryExecutionCommand(input),
  );
  let sleepLoopCount = 0;
  while (
    response == undefined ||
    ["RUNNING", "QUEUED"].includes(response.QueryExecution?.Status?.State!)
  ) {
    // @ts-ignore
    response = await client.send(
      new GetQueryExecutionCommand({
        QueryExecutionId: startQueryExecutionResponse?.QueryExecutionId,
      }),
    );
    if (QueryExecutionState.FAILED == response.QueryExecution?.Status?.State) {
      logger.error(
        `${JSON.stringify(response.QueryExecution?.Status?.AthenaError)}`,
      );
    } else {
      logger.info(`Response: ${JSON.stringify(response)}`);
    }
    await sleep(3000);
    if (sleepLoopCount++ > 5) {
      throw new Error(
        `Execution of the following statement took too long: ${command} `,
      );
    }
  }
  return response;
}

# aws-organizations-tag-inventory

This cdk project is an example of how a customer can generate a report on what tags exist and the resources they are applied to across their entire AWS organization.


## Architecture

![](./images/architecture.drawio.png)

The solution consists of one central account and one to many spoke accounts. 

1. Spoke accounts have an [Amazon EventBridge Scheduler](https://docs.aws.amazon.com/eventbridge/latest/userguide/scheduler.html) 
which periodically triggers an [AWS Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html) state machine, SpokeAccountStateMachine. 
2. This state machine queries all resources across all regions within the account using [AWS Resource Explorer](https://aws.amazon.com/resourceexplorer/). 
3. The state machine processes and transforms the results and writes them to an [S3 bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide//Welcome.html) in the central account.
4. Within the central account there is a Glue Crawler that will periodically crawl the S3 bucket where the results land and generate a table in the Glue data catalog.
5. There is another Amazon EventBridge Scheduler in the central account which periodically triggers the [GenerateCsvReportFunction](./src/functions/GenerateReportCSV.ts) [AWS Lambda](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html) function. 
6. Using Athena, this function executes the following statement.

```sql 
CREATE TABLE "<DATABASE>"."tag_inventory_csv"
		WITH (
		      format = 'TEXTFILE',
		      field_delimiter = ',',
		      external_location = 's3://<REPORT_BUCKET>/<YESTERDAYS_DATE>',
		      bucketed_by = ARRAY['d'],
		      bucket_count = 1)
		AS ( SELECT d,tagname,tagvalue,r.owningAccountId,r.region,r.service,r.resourceType,r.arn FROM "<DATABASE>"."<TAG_INVENTORY_TABLE>", unnest("resources") as t ("r") where d='<YESTERDAYS_DATE>');
```  
7. Athena creates the table in the Glue data catalog which generates a file in the reporting bucket in S3
8. Once complete the GenerateCsvReportFunction will rename the report file and delete the table from the Glue data catalog.


## Spoke Account State Machine
Below is the state machine diagram that is run in each spoke account to gather and process tag inventory 

![](./images/SpokeAccountStateMachine.png)

## Deploy

### Prerequsites

* `npm install`
* `npm run build`

### Deploy central stack
1. Put credentials on the terminal for the central account you want to send the tag inventory to and generate reports in.
2. `npm run deploy -- -c stack=central -c organizationId=<YOUR_AWS_ORGANIZATION_ID>`
3. Copy the output values for  "**CentralStackPutTagInventoryRoleOutput**" and "**OrganizationsTagInventoryBucketNameOutput**"


### Deploy spoke stack
For each account you want to gather tag inventory from do the following

1. Put credentials on the terminal for the spoke account.
2. `npm run deploy -- -c stack=spoke -c bucketName=<VALUE_FROM_OrganizationsTagInventoryBucketNameOutput> -c centralRoleArn=<VALUE_FROM_CentralStackPutTagInventoryRoleOutput>`

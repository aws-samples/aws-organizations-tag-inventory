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

import path from 'path';
import {Aws, CfnOutput, Duration, RemovalPolicy, Fn, CfnCondition} from 'aws-cdk-lib';
import {CfnWorkGroup} from 'aws-cdk-lib/aws-athena';
import {CfnCrawler, CfnDatabase, CfnSecurityConfiguration, CfnTable} from 'aws-cdk-lib/aws-glue';
import {AccountPrincipal, Effect, ManagedPolicy, OrganizationPrincipal, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from 'aws-cdk-lib/aws-iam';
import {Key} from 'aws-cdk-lib/aws-kms';
import {Architecture, LayerVersion, Runtime} from 'aws-cdk-lib/aws-lambda';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import {BlockPublicAccess, Bucket, BucketEncryption, CfnBucket, IBucket} from 'aws-cdk-lib/aws-s3';
import {SqsDestination} from 'aws-cdk-lib/aws-s3-notifications';
import {CfnSchedule} from 'aws-cdk-lib/aws-scheduler';
import {Queue, QueueEncryption} from 'aws-cdk-lib/aws-sqs';
import {Construct} from 'constructs';
import {ScheduleExpression} from "./ScheduleExpression";
import {ICfnRuleConditionExpression} from "aws-cdk-lib/core/lib/cfn-condition";

export interface CentralConfig {
	organizationId: string;
	organizationPayerAccountId: string;
	schedule: string
}

export class Central extends Construct {
	readonly reportingBucket: IBucket;
	readonly tagInventoryBucket: IBucket;
	readonly athenaWorkGroupBucket: IBucket;
	readonly workGroup: CfnWorkGroup;
	readonly table: CfnTable;
	readonly database: CfnDatabase;
	readonly serverAccessLogBucket: IBucket;

	constructor(scope: Construct, id: string, config: CentralConfig) {
		super(scope, id);

		const powerToolsLayer = LayerVersion.fromLayerVersionArn(this, 'powertools', `arn:aws:lambda:${Aws.REGION}:094274105915:layer:AWSLambdaPowertoolsTypeScript:11`);
		this.serverAccessLogBucket = new Bucket(this, 'S3ServerAccessLogBucket', {
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			removalPolicy: RemovalPolicy.DESTROY,
			enforceSSL: true,
			autoDeleteObjects: true,
		});
		this.reportingBucket = new Bucket(this, 'ReportBucket', {
			bucketName: `tag-inventory-reports-${config.organizationId}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,

			eventBridgeEnabled: true,
			removalPolicy: RemovalPolicy.DESTROY,
			serverAccessLogsBucket: this.serverAccessLogBucket,
			enforceSSL: true,
			autoDeleteObjects: true,

		});


		this.tagInventoryBucket = new Bucket(this, 'TagBucket', {
			bucketName: `tag-inventory-${config.organizationId}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			eventBridgeEnabled: true,
			removalPolicy: RemovalPolicy.DESTROY,
			serverAccessLogsBucket: this.serverAccessLogBucket,
			enforceSSL: true,
			autoDeleteObjects: true,
		});

		this.athenaWorkGroupBucket = new Bucket(this, 'AthenaWorkGroupBucket', {
			bucketName: `tag-inventory-athena-wg-${config.organizationId}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			eventBridgeEnabled: true,
			removalPolicy: RemovalPolicy.DESTROY,
			serverAccessLogsBucket: this.serverAccessLogBucket,
			enforceSSL: true,
			autoDeleteObjects: true,
			encryption: BucketEncryption.S3_MANAGED,
		});


		const athenaRole = new Role(this, 'CentralStackTagInventoryAthenaRole', {

			assumedBy: new ServicePrincipal('glue.amazonaws.com'),
			managedPolicies: [
				ManagedPolicy.fromManagedPolicyArn(this, 'AmazonS3FullAccess', 'arn:aws:iam::aws:policy/AmazonS3FullAccess'),
				ManagedPolicy.fromManagedPolicyArn(this, 'AWSGlueServiceRole', 'arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole'),
				ManagedPolicy.fromManagedPolicyArn(this, 'AmazonKinesisFullAccess', 'arn:aws:iam::aws:policy/AmazonKinesisFullAccess'),
				ManagedPolicy.fromManagedPolicyArn(this, 'AmazonSNSFullAccess', 'arn:aws:iam::aws:policy/AmazonSNSFullAccess'),
				ManagedPolicy.fromManagedPolicyArn(this, 'AmazonSQSFullAccess', 'arn:aws:iam::aws:policy/AmazonSQSFullAccess'),
			],
			inlinePolicies: {
				CloudWatchAccess: new PolicyDocument({
					statements: [new PolicyStatement({
						effect: Effect.ALLOW,
						actions: ['logs:AssociateKmsKey'],
						resources: ['*'],
					})],
				}),
			},
		});
		const tagInventoryEventDLQ = new Queue(this, 'TagInventoryEventDLQ', {
			removalPolicy: RemovalPolicy.DESTROY,
			enforceSSL: true,
			encryption: QueueEncryption.SQS_MANAGED,
		});
		const tagInventoryEventQueue = new Queue(this, 'TagInventoryEventQueue', {
			removalPolicy: RemovalPolicy.DESTROY,
			enforceSSL: true,
			deadLetterQueue: {
				queue: tagInventoryEventDLQ,
				maxReceiveCount: 3,
			},
			encryption: QueueEncryption.SQS_MANAGED,
		});
		tagInventoryEventQueue.grantConsumeMessages(athenaRole);

		tagInventoryEventQueue.addToResourcePolicy(new PolicyStatement({
			effect: Effect.ALLOW,
			principals: [new ServicePrincipal('s3.amazonaws.com')],
			actions: ['SQS:SendMessage'],
		}));
		this.tagInventoryBucket.addObjectCreatedNotification(new SqsDestination(tagInventoryEventQueue));

		this.database = new CfnDatabase(this, 'OrganizationalTagInventoryDatabase', {
			catalogId: Aws.ACCOUNT_ID,
			databaseInput: {
				name: `${config.organizationId}-tag-inventory-database`,
				description: 'Organizational tag inventory database',

			},

		});
		this.table = new CfnTable(this, 'TagInventoryTable', {
			catalogId: Aws.ACCOUNT_ID,
			databaseName: this.database.ref,
			tableInput: {
				name: `${config.organizationId}-tag-inventory-table`,
				storageDescriptor: {
					location: this.tagInventoryBucket.s3UrlForObject('/'),
					inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
					outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
					compressed: false,
					numberOfBuckets: -1,
					serdeInfo: {
						serializationLibrary: 'org.openx.data.jsonserde.JsonSerDe',
						parameters: {
							paths: 'Resources,TagName,TagValue',
						},
					},
					bucketColumns: [],
					sortColumns: [],
					storedAsSubDirectories: false,
					columns: [
						{
							name: 'tagname',
							type: 'string',
						},
						{
							name: 'resources',
							type: 'array<struct<OwningAccountId:string,Region:string,Service:string,ResourceType:string,Arn:string>>',
						},
						{
							name: 'tagvalue',
							type: 'string',
						},

					],

				},
				parameters: {
					'partition_filtering.enabled': 'true',
					'compressionType': 'none',
					'classification': 'json',
					'typeOfData': 'file',
				},
				partitionKeys: [{
					name: 'd',
					type: 'string',
				}],
				tableType: 'EXTERNAL_TABLE',
			},

		});
		const cloudWatchKmsKey = new Key(this, 'CloudwatchEncryptionKey', {
			description: 'Encrypts cloudwatch logs for tag-inventory solution',
			removalPolicy: RemovalPolicy.DESTROY,
			enableKeyRotation: true,
			policy: new PolicyDocument({
				statements: [new PolicyStatement({

					effect: Effect.ALLOW,
					principals: [new AccountPrincipal(Aws.ACCOUNT_ID)],
					actions: ['kms:*'],
					resources: ['*'],

				}), new PolicyStatement({
					effect: Effect.ALLOW,
					actions: ['kms:Encrypt*',
						'kms:Decrypt*',
						'kms:ReEncrypt*',
						'kms:GenerateDataKey*',
						'kms:Describe*'],
					principals: [new ServicePrincipal(`logs.${Aws.REGION}.amazonaws.com`)],
					resources: ['*'],


				})],
			}),
		});
		cloudWatchKmsKey.grantEncryptDecrypt(athenaRole);
		const securityConfiguration = new CfnSecurityConfiguration(this, 'SecurityConfiguration', {
			name: 'TagInventorySecurityConfiguration',
			encryptionConfiguration: {
				s3Encryptions: [{
					s3EncryptionMode: 'SSE-S3',
				}],
				cloudWatchEncryption: {
					cloudWatchEncryptionMode: 'SSE-KMS',
					kmsKeyArn: cloudWatchKmsKey.keyArn,
				},
			},
		});
		const tableArn = `arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:table/${this.table.databaseName}`;
		const databaseArn = `arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:database/${this.database.ref}`;
		const catalogArn = `arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:catalog/${this.table.catalogId}`;
		new CfnCrawler(this, 'OrganizationalTagInventoryCrawler', {
			name: `${config.organizationId}-tag-inventory-crawler`,
			description: 'Organizational tag inventory crawler',
			databaseName: this.database.ref,
			role: athenaRole.roleArn,
			configuration: '{"Version":1,"CrawlerOutput":{"Partitions":{"AddOrUpdateBehavior":"InheritFromTable"},"Tables":{"AddOrUpdateBehavior":"MergeNewColumns"}},"Grouping":{"TableGroupingPolicy":"CombineCompatibleSchemas"},"CreatePartitionIndex":false}',
			targets: {
				catalogTargets: [{
					databaseName: this.database.ref,
					tables: [
						this.table.ref,
					],
					eventQueueArn: tagInventoryEventQueue.queueArn,
				}],
			},
			crawlerSecurityConfiguration: securityConfiguration.name,
			schemaChangePolicy: {
				deleteBehavior: 'LOG',
				updateBehavior: 'UPDATE_IN_DATABASE',
			},
			recrawlPolicy: {
				recrawlBehavior: 'CRAWL_EVENT_MODE',
			},
			schedule: {
				scheduleExpression: this.crawlerScheduleCron(config.schedule).toString(),
			},
		});
		const centralStackRole = new Role(this, 'CentralStackPutTagInventoryRole', {
			assumedBy: new OrganizationPrincipal(config.organizationId),
			description: "Role with access to write to the central stack's OrganizationsTagInventory bucket",
		});
		this.tagInventoryBucket.grantPut(centralStackRole);
		this.reportingBucket.grantPut(centralStackRole);
		const workgroupName = 'TagInventoryAthenaWorkGroup';
		const generateCsvReportFunction = new NodejsFunction(this, 'GenerateCsvReportFunction', {
			architecture: Architecture.ARM_64,
			runtime: Runtime.NODEJS_18_X,
			entry: path.join(__dirname, '..', 'functions', 'GenerateReportCSV.ts'),
			handler: 'index.onEvent',
			timeout: Duration.seconds(120),
			layers: [powerToolsLayer],
			initialPolicy: [new PolicyStatement({
				effect: Effect.ALLOW,
				actions: ['athena:StartQueryExecution', 'athena:GetQueryExecution', 'athena:GetQueryResults'],
				resources: [`arn:aws:athena:${Aws.REGION}:${Aws.ACCOUNT_ID}:workgroup/${workgroupName}`],
			}), new PolicyStatement({
				effect: Effect.ALLOW,
				actions: ['glue:GetTable', 'glue:CreateTable', 'glue:UpdateTable', 'glue:GetPartitions', 'glue:GetPartition', 'glue:CreatePartition', 'glue:BatchCreatePartition', 'glue:GetDatabase', 'glue:CreateDatabase', 'glue:DeleteTable'],
				resources: [`arn:aws:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:catalog`, `${tableArn}/*`, `${catalogArn}/*`, databaseArn, `${databaseArn}/*`, `arn:aws:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:*/default`, `arn:aws:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:*/default/*`],
			})],
			environment: {
				LOG_LEVEL: 'DEBUG',
				// @ts-ignore
				DATABASE: this.table.databaseName,
				CATALOG: this.table.catalogId,
				REPORT_BUCKET: this.reportingBucket.bucketName,
				TAG_INVENTORY_TABLE: this.table.ref,
				ATHENA_BUCKET: this.athenaWorkGroupBucket.bucketName,
				WORKGROUP: workgroupName,
			},
		});
		const role = new Role(this, 'ReportSchedulerRole', {assumedBy: new ServicePrincipal('scheduler.amazonaws.com')});
		generateCsvReportFunction.grantInvoke(role);
		this.reportingBucket.grantReadWrite(generateCsvReportFunction);
		this.athenaWorkGroupBucket.grantReadWrite(generateCsvReportFunction);
		this.tagInventoryBucket.grantRead(generateCsvReportFunction);
		this.workGroup = new CfnWorkGroup(this, 'AthenaWorkGroup', {
			name: workgroupName,
			workGroupConfiguration: {
				resultConfiguration: {
					outputLocation: this.athenaWorkGroupBucket.s3UrlForObject(''),
					encryptionConfiguration: {
						encryptionOption: 'SSE_S3',
					},
				},
				enforceWorkGroupConfiguration: false,
			},
		});
		this.workGroup.addDependency(this.athenaWorkGroupBucket.node.defaultChild as CfnBucket);
		generateCsvReportFunction.addEnvironment('WORKGROUP', this.workGroup.name);
		new CfnSchedule(this, 'Scheduler', {
			name: 'ReportGenerateSchedule',
			flexibleTimeWindow: {
				mode: 'OFF',
			},
			state: 'ENABLED',
			scheduleExpression: this.reportGenerateScheduleCron(config.schedule).toString(),
			target: {
				arn: generateCsvReportFunction.functionArn,
				roleArn: role.roleArn,
			},
			scheduleExpressionTimezone: 'America/New_York',
		});
		new CfnOutput(
			this, 'OrganizationsTagInventoryBucketNameOutput',
			{
				description: 'Name of the bucket where the Organizations Tag inventory is stored',
				value: this.tagInventoryBucket.bucketName,
				exportName: 'OrganizationsTagInventoryBucketName',
			},
		);
		new CfnOutput(
			this, 'CentralStackPutTagInventoryRoleOutput',
			{
				description: 'Role with access to write to the central stack\'s OrganizationsTagInventory bucket',
				value: centralStackRole.roleArn,
				exportName: 'CentralStackPutTagInventoryRoleO',
			},
		);

	}

	reportGenerateScheduleCron(schedule: string): ICfnRuleConditionExpression {
		const reportGenerateDailyCondition=new CfnCondition(this, "ReportGenerateDailyCondition", {
			expression: Fn.conditionEquals(schedule, ScheduleExpression.DAILY)
		})
		const reportGenerateWeeklyCondition=new CfnCondition(this, "ReportGenerateWeeklyCondition", {
			expression: Fn.conditionEquals(schedule, ScheduleExpression.WEEKLY)
		})
		const reportGenerateMonthlyCondition=new CfnCondition(this, "ReportGenerateMonthlyCondition", {
			expression: Fn.conditionEquals(schedule, ScheduleExpression.MONTHLY)
		})
		return Fn.conditionIf(reportGenerateDailyCondition.logicalId, 'cron(0 6 ? * * *)', Fn.conditionIf(reportGenerateWeeklyCondition.logicalId, 'cron(0 6 ? * SAT *)', Fn.conditionIf(reportGenerateMonthlyCondition.logicalId, "cron(0 6 ? 1/1 SAT#4 *)", 'cron(0 6 ? * SAT *)')))


	}

	crawlerScheduleCron(schedule: string): ICfnRuleConditionExpression {
		const crawlerDailyCondition = new CfnCondition(this, "CrawlerDailyCondition", {
			expression: Fn.conditionEquals(schedule, ScheduleExpression.DAILY)
		})
		const crawlerWeeklyCondition = new CfnCondition(this, "CrawlerWeeklyCondition", {
			expression: Fn.conditionEquals(schedule, ScheduleExpression.WEEKLY)
		})
		const crawlerMonthlyCondition = new CfnCondition(this, "CrawlerMonthlyCondition", {
			expression: Fn.conditionEquals(schedule, ScheduleExpression.MONTHLY)
		})
		return Fn.conditionIf(crawlerDailyCondition.logicalId, 'cron(0 2 ? * * *)', Fn.conditionIf(crawlerWeeklyCondition.logicalId, 'cron(0 2 ? * SAT *)', Fn.conditionIf(crawlerMonthlyCondition.logicalId, "cron(0 2 ? 1/1 SAT#4 *)", 'cron(0 2 ? * SAT *)')))


	}
}
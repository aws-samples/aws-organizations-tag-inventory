import {Aws, CfnOutput, Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {BlockPublicAccess, Bucket, HttpMethods} from "aws-cdk-lib/aws-s3";
import {Effect, ManagedPolicy, OrganizationPrincipal, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {CfnCrawler, CfnDatabase, CfnTable} from "aws-cdk-lib/aws-glue";
import {Queue} from "aws-cdk-lib/aws-sqs";
import {SqsDestination} from "aws-cdk-lib/aws-s3-notifications";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Architecture,LayerVersion, Runtime} from "aws-cdk-lib/aws-lambda";
import path from "path";
import {CfnSchedule} from "aws-cdk-lib/aws-scheduler";

export interface CentralStackProps extends StackProps {
	organizationId: string | undefined
}

export class CentralStack extends Stack {

	constructor(scope: Construct, id: string, props: CentralStackProps) {
		super(scope, id, props);
		if (!props.organizationId) {
			throw new Error("Organization Id is required")
		}
		const powerToolsLayer = LayerVersion.fromLayerVersionArn(this, 'powertools', `arn:aws:lambda:${Aws.REGION}:094274105915:layer:AWSLambdaPowertoolsTypeScript:11`);
		const serverAccessLogBucket = new Bucket(this, 'S3ServerAccessLogBucket', {
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			removalPolicy: RemovalPolicy.DESTROY,
			enforceSSL: true,
			autoDeleteObjects: true,
		});
		const athenaTagsBucket = new Bucket(this, 'ReportBucket', {
			bucketName: `tag-inventory-athena-${props.organizationId}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			cors: [
				{
					allowedHeaders: ['*'],
					allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.POST, HttpMethods.HEAD],
					allowedOrigins: ['*'],
					exposedHeaders: ['ETag'],
				},
			],
			eventBridgeEnabled: true,
			removalPolicy: RemovalPolicy.DESTROY,
			serverAccessLogsBucket: serverAccessLogBucket,
			enforceSSL: true,
			autoDeleteObjects: true,
		});

		const bucket = new Bucket(this, 'TagBucket', {
			bucketName: `tag-inventory-${props.organizationId}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			cors: [
				{
					allowedHeaders: ['*'],
					allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.POST, HttpMethods.HEAD],
					allowedOrigins: ['*'],
					exposedHeaders: ['ETag'],
				},
			],
			eventBridgeEnabled: true,
			removalPolicy: RemovalPolicy.DESTROY,
			serverAccessLogsBucket: serverAccessLogBucket,
			enforceSSL: true,
			autoDeleteObjects: true,
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
				'passRole-glue': new PolicyDocument({
					statements: [
						new PolicyStatement({
							effect: Effect.ALLOW,
							actions: ['iam:PassRole'],
							resources: ['*'],
						}),
					],
				}),
			},
		});
		const tagInventoryEventQueue = new Queue(this, 'TagInventoryEventQueue', {
			removalPolicy: RemovalPolicy.DESTROY,
			enforceSSL: true
		});
		tagInventoryEventQueue.grantConsumeMessages(athenaRole);

		tagInventoryEventQueue.addToResourcePolicy(new PolicyStatement({
			effect: Effect.ALLOW,
			principals: [new ServicePrincipal('s3.amazonaws.com')],
			actions: ['SQS:SendMessage'],
		}));
		bucket.addObjectCreatedNotification(new SqsDestination(tagInventoryEventQueue));
		athenaTagsBucket.addObjectCreatedNotification(new SqsDestination(tagInventoryEventQueue))
		const database = new CfnDatabase(this, 'OrganizationalTagInventoryDatabase', {
			catalogId: Aws.ACCOUNT_ID,
			databaseInput: {
				name: `${props.organizationId}-tag-inventory-database`,
				description: 'Organizational tag inventory database',

			},

		});
		const table=new CfnTable(this,"TagInventoryTable", {
			catalogId: Aws.ACCOUNT_ID,
			databaseName: database.ref,
			tableInput: {
				name:`${props.organizationId}-tag-inventory-table`,
				storageDescriptor: {
					location: bucket.s3UrlForObject("/"),
					inputFormat: "org.apache.hadoop.mapred.TextInputFormat",
					outputFormat: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
					compressed: false,
					numberOfBuckets: -1,
					serdeInfo: {
						serializationLibrary: "org.openx.data.jsonserde.JsonSerDe",
						parameters: {
							"paths": "Resources,TagName,TagValue"
						}
					},
					bucketColumns:[],
					sortColumns:[],
					parameters: {
						"partition_filtering.enabled": "true",
						"compressionType": "none",
						"classification": "json",
						"typeOfData": "file"
					},
					storedAsSubDirectories: false,

					columns: [
						{
							name: "tagname",
							type: "string"
						},
						{
							name: "resources",
							type: "array<struct<OwningAccountId:string,Region:string,Service:string,ResourceType:string,Arn:string>>"
						},
						{
							name: "tagvalue",
							type: "string"
						}

					]
				},
				partitionKeys:[{
					name:"d",
					type:"string"
				}],
				tableType:"EXTERNAL_TABLE",
			}

		})
		new CfnCrawler(this, "OrganizationalTagInventoryCrawler", {
			name: `${props.organizationId}-tag-inventory-crawler`,
			description: 'Organizational tag inventory crawler',
			databaseName: database.ref,
			role: athenaRole.roleArn,
			configuration: "{\"Version\":1,\"CrawlerOutput\":{\"Partitions\":{\"AddOrUpdateBehavior\":\"InheritFromTable\"},\"Tables\":{\"AddOrUpdateBehavior\":\"MergeNewColumns\"}},\"Grouping\":{\"TableGroupingPolicy\":\"CombineCompatibleSchemas\"},\"CreatePartitionIndex\":false}",
			targets: {
				catalogTargets: [{
					databaseName: database.ref,
					tables:[
						table.ref
					],
					eventQueueArn: tagInventoryEventQueue.queueArn
				}]
			},
			recrawlPolicy: {
				recrawlBehavior: "CRAWL_EVENT_MODE"

			},
			schedule: {
				scheduleExpression: "cron(0 0/1 * * ? *)"
			},

		})
		const centralStackRole = new Role(this, "CentralStackPutTagInventoryRole", {
			assumedBy: new OrganizationPrincipal(props.organizationId),
			description: "Role with access to write to the central stack's OrganizationsTagInventory bucket"
		})
		bucket.grantPut(centralStackRole)
		athenaTagsBucket.grantPut(centralStackRole)
					const timedEventFunction = new NodejsFunction(this, 'Timed-Event-fn', {
						architecture: Architecture.ARM_64,
						runtime: Runtime.NODEJS_18_X,
						entry: path.join(__dirname, '..', 'functions', 'GenerateCSV.ts'),
						handler: 'index.onEvent',
						timeout: Duration.seconds(60),
						layers: [powerToolsLayer],
						initialPolicy: [],
						environment: {
							LOG_LEVEL: 'DEBUG',
						},
					});
					const role=new Role(this,"ReportSchedulerRole",{assumedBy: new ServicePrincipal("scheduler.amazonaws.com")})
					timedEventFunction.grantInvoke(role)

					new CfnSchedule(this,"Scheduler",{
						name:"ReportGenerateSchedule",
						flexibleTimeWindow:{
							mode: "OFF"
						},
						state:"ENABLED",
						scheduleExpression: "rate(1 minute)",
						target: {
							arn: timedEventFunction.functionArn,
							roleArn:role.roleArn
						},
						scheduleExpressionTimezone:"America/New_York"
					})
		new CfnOutput(
			this, 'OrganizationsTagInventoryBucketNameOutput',
			{
				description: 'Name of the bucket where the Organizations Tag inventory is stored',
				value: bucket.bucketName,
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
}
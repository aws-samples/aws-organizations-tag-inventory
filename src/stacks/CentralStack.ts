import {Aws, CfnOutput, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {BlockPublicAccess, Bucket, HttpMethods} from "aws-cdk-lib/aws-s3";
import {Effect, ManagedPolicy, OrganizationPrincipal, PolicyDocument, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {CfnCrawler, CfnDatabase} from "aws-cdk-lib/aws-glue";
import {Queue} from "aws-cdk-lib/aws-sqs";
import {SqsDestination} from "aws-cdk-lib/aws-s3-notifications";

export interface CentralStackProps extends StackProps {
	organizationId: string | undefined
}

export class CentralStack extends Stack {

	constructor(scope: Construct, id: string, props: CentralStackProps) {
		super(scope, id, props);
		if (!props.organizationId) {
			throw new Error("Organization Id is required")
		}
		const serverAccessLogBucket = new Bucket(this, 'S3ServerAccessLogBucket', {
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			removalPolicy: RemovalPolicy.DESTROY,
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
		const database = new CfnDatabase(this, 'OrganizationalTagInventoryDatabase', {
			catalogId: Aws.ACCOUNT_ID,
			databaseInput: {
				name: `${props.organizationId}-tag-inventory-database`,
				description: 'Organizational tag inventory database',

			},

		});

		new CfnCrawler(this, "OrganizationalTagInventoryCrawler", {
			name: `${props.organizationId}-tag-inventory-crawler`,
			description: 'Organizational tag inventory crawler',
			databaseName: database.ref,
			role: athenaRole.roleArn,
			configuration: "{\"Version\":1,\"CreatePartitionIndex\":true,\"CrawlerOutput\":{\"Partitions\":{\"AddOrUpdateBehavior\":\"InheritFromTable\"},\"Tables\":{\"AddOrUpdateBehavior\":\"MergeNewColumns\",\"TableThreshold\":1}},\"Grouping\":{\"TableLevelConfiguration\":1}}",
			targets: {
				s3Targets: [{
					path: bucket.s3UrlForObject(""),
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
		new CfnOutput(
			this, 'OrganizationsTagInventoryBucketNameOutput',
			{
				description: 'Name of the bucket where the Organizations Tag Inventory is stored',
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
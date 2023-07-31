import path from 'path';
import { Aws, CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { CfnWorkGroup } from 'aws-cdk-lib/aws-athena';
import { CfnCrawler, CfnDatabase, CfnTable } from 'aws-cdk-lib/aws-glue';
import { Effect, ManagedPolicy, OrganizationPrincipal, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { BlockPublicAccess, Bucket, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';


export interface CentralStackProps extends StackProps {
  organizationId: string | undefined;
}

export class CentralStack extends Stack {

  constructor(scope: Construct, id: string, props: CentralStackProps) {
    super(scope, id, props);
    if (!props.organizationId) {
      throw new Error('Organization Id is required');
    }
    const powerToolsLayer = LayerVersion.fromLayerVersionArn(this, 'powertools', `arn:aws:lambda:${Aws.REGION}:094274105915:layer:AWSLambdaPowertoolsTypeScript:11`);
    const serverAccessLogBucket = new Bucket(this, 'S3ServerAccessLogBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      enforceSSL: true,
      autoDeleteObjects: true,
    });
    const reportingBucket = new Bucket(this, 'ReportBucket', {
      bucketName: `tag-inventory-reports-${props.organizationId}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
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

    const tagInventoryBucket = new Bucket(this, 'TagBucket', {
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

    const athenaWorkGroupBucket = new Bucket(this, 'AthenaWorkGroupBucket', {
      bucketName: `tag-inventory-athena-wg-${props.organizationId}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
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
      enforceSSL: true,
    });
    tagInventoryEventQueue.grantConsumeMessages(athenaRole);

    tagInventoryEventQueue.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [new ServicePrincipal('s3.amazonaws.com')],
      actions: ['SQS:SendMessage'],
    }));
    tagInventoryBucket.addObjectCreatedNotification(new SqsDestination(tagInventoryEventQueue));

    const database = new CfnDatabase(this, 'OrganizationalTagInventoryDatabase', {
      catalogId: Aws.ACCOUNT_ID,
      databaseInput: {
        name: `${props.organizationId}-tag-inventory-database`,
        description: 'Organizational tag inventory database',

      },

    });
    const table = new CfnTable(this, 'TagInventoryTable', {
      catalogId: Aws.ACCOUNT_ID,
      databaseName: database.ref,
      tableInput: {
        name: `${props.organizationId}-tag-inventory-table`,
        storageDescriptor: {
          location: tagInventoryBucket.s3UrlForObject('/'),
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
          parameters: {
            'partition_filtering.enabled': 'true',
            'compressionType': 'none',
            'classification': 'json',
            'typeOfData': 'file',
          },
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
        partitionKeys: [{
          name: 'd',
          type: 'string',
        }],
        tableType: 'EXTERNAL_TABLE',
      },

    });
    new CfnCrawler(this, 'OrganizationalTagInventoryCrawler', {
      name: `${props.organizationId}-tag-inventory-crawler`,
      description: 'Organizational tag inventory crawler',
      databaseName: database.ref,
      role: athenaRole.roleArn,
      configuration: '{"Version":1,"CrawlerOutput":{"Partitions":{"AddOrUpdateBehavior":"InheritFromTable"},"Tables":{"AddOrUpdateBehavior":"MergeNewColumns"}},"Grouping":{"TableGroupingPolicy":"CombineCompatibleSchemas"},"CreatePartitionIndex":false}',
      targets: {
        catalogTargets: [{
          databaseName: database.ref,
          tables: [
            table.ref,
          ],
          eventQueueArn: tagInventoryEventQueue.queueArn,
        }],
      },
      recrawlPolicy: {
        recrawlBehavior: 'CRAWL_EVENT_MODE',
      },
      schedule: {
        scheduleExpression: 'cron(5 0/1 * * ? *)',
      },
    });
    const centralStackRole = new Role(this, 'CentralStackPutTagInventoryRole', {
      assumedBy: new OrganizationPrincipal(props.organizationId),
      description: "Role with access to write to the central stack's OrganizationsTagInventory bucket",
    });
    tagInventoryBucket.grantPut(centralStackRole);
    reportingBucket.grantPut(centralStackRole);

    const generateCsvReportFunction = new NodejsFunction(this, 'GenerateCsvReportFunction', {
      architecture: Architecture.ARM_64,
      runtime: Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'functions', 'GenerateReportCSV.ts'),
      handler: 'index.onEvent',
      timeout: Duration.seconds(60),
      layers: [powerToolsLayer],
      initialPolicy: [new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['athena:*', 'glue:*', 's3:*'],
        resources: ['*'],
      })],
      environment: {
        LOG_LEVEL: 'DEBUG',
        // @ts-ignore
        DATABASE: table.databaseName,
        CATALOG: table.catalogId,
        REPORT_BUCKET: reportingBucket.bucketName,
        TAG_INVENTORY_TABLE: table.ref,
        ATHENA_BUCKET: athenaWorkGroupBucket.bucketName,
      },
    });
    const role = new Role(this, 'ReportSchedulerRole', { assumedBy: new ServicePrincipal('scheduler.amazonaws.com') });
    generateCsvReportFunction.grantInvoke(role);
    reportingBucket.grantReadWrite(generateCsvReportFunction);
    athenaWorkGroupBucket.grantReadWrite(generateCsvReportFunction);
    const workGroup = new CfnWorkGroup(this, 'AthenaWorkGroup', {
      name: 'TagInventoryAthenaWorkGroup',
      workGroupConfiguration: {
        executionRole: generateCsvReportFunction.role?.roleArn,
        resultConfiguration: {
          outputLocation: athenaWorkGroupBucket.s3UrlForObject(''),

        },
        enforceWorkGroupConfiguration: false,
      },
    });
    generateCsvReportFunction.addEnvironment('WORKGROUP', workGroup.name);
    new CfnSchedule(this, 'Scheduler', {
      name: 'ReportGenerateSchedule',
      flexibleTimeWindow: {
        mode: 'OFF',
      },
      state: 'ENABLED',
      scheduleExpression: 'rate(1 day)',
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
        value: tagInventoryBucket.bucketName,
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
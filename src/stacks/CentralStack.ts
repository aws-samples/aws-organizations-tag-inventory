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
import { Aws, CfnOutput, CfnParameter, Duration, RemovalPolicy, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { CfnWorkGroup } from 'aws-cdk-lib/aws-athena';
import { CfnCrawler, CfnDatabase, CfnSecurityConfiguration, CfnTable } from 'aws-cdk-lib/aws-glue';
import { AccountPrincipal, Effect, ManagedPolicy, OrganizationPrincipal, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Architecture, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { NagSuppressions } from 'cdk-nag';
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
    const organizationIdParameter = new CfnParameter(this, 'OrganizationIdParameter', {
      default: props.organizationId,
      type: 'String',
      description: 'The AWS organization ID',
    });
    const powerToolsLayer = LayerVersion.fromLayerVersionArn(this, 'powertools', `arn:aws:lambda:${Aws.REGION}:094274105915:layer:AWSLambdaPowertoolsTypeScript:11`);
    const serverAccessLogBucket = new Bucket(this, 'S3ServerAccessLogBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      enforceSSL: true,
      autoDeleteObjects: true,
    });
    const reportingBucket = new Bucket(this, 'ReportBucket', {
      bucketName: `tag-inventory-reports-${organizationIdParameter.valueAsString}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,

      eventBridgeEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
      serverAccessLogsBucket: serverAccessLogBucket,
      enforceSSL: true,
      autoDeleteObjects: true,
    });

    const tagInventoryBucket = new Bucket(this, 'TagBucket', {
      bucketName: `tag-inventory-${organizationIdParameter.valueAsString}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
      serverAccessLogsBucket: serverAccessLogBucket,
      enforceSSL: true,
      autoDeleteObjects: true,
    });

    const athenaWorkGroupBucket = new Bucket(this, 'AthenaWorkGroupBucket', {
      bucketName: `tag-inventory-athena-wg-${organizationIdParameter.valueAsString}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
      serverAccessLogsBucket: serverAccessLogBucket,
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
    tagInventoryBucket.addObjectCreatedNotification(new SqsDestination(tagInventoryEventQueue));

    const database = new CfnDatabase(this, 'OrganizationalTagInventoryDatabase', {
      catalogId: Aws.ACCOUNT_ID,
      databaseInput: {
        name: `${organizationIdParameter.valueAsString}-tag-inventory-database`,
        description: 'Organizational tag inventory database',

      },

    });
    const table = new CfnTable(this, 'TagInventoryTable', {
      catalogId: Aws.ACCOUNT_ID,
      databaseName: database.ref,
      tableInput: {
        name: `${organizationIdParameter.valueAsString}-tag-inventory-table`,
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
    const tableArn = `arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:table/${table.databaseName}`;
    const databaseArn = `arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:database/${database.ref}`;
    const catalogArn = `arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:catalog/${table.catalogId}`;
    new CfnCrawler(this, 'OrganizationalTagInventoryCrawler', {
      name: `${organizationIdParameter.valueAsString}-tag-inventory-crawler`,
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
      crawlerSecurityConfiguration: securityConfiguration.name,
      schemaChangePolicy: {
        deleteBehavior: 'LOG',
        updateBehavior: 'UPDATE_IN_DATABASE',
      },
      recrawlPolicy: {
        recrawlBehavior: 'CRAWL_EVENT_MODE',
      },
      schedule: {
        scheduleExpression: 'cron(0 2 * * ? *)',
      },
    });
    const centralStackRole = new Role(this, 'CentralStackPutTagInventoryRole', {
      assumedBy: new OrganizationPrincipal(organizationIdParameter.valueAsString),
      description: "Role with access to write to the central stack's OrganizationsTagInventory bucket",
    });
    tagInventoryBucket.grantPut(centralStackRole);
    reportingBucket.grantPut(centralStackRole);
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
        actions: ['glue:GetTable', 'glue:CreateTable', 'glue:GetPartitions', 'glue:GetPartition', 'glue:CreatePartition', 'glue:GetDatabase', 'glue:CreateDatabase', 'glue:DeleteTable'],
        resources: [`arn:aws:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:catalog`, `${tableArn}/*`, `${catalogArn}/*`, databaseArn, `${databaseArn}/*`, `arn:aws:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:*/default`, `arn:aws:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:*/default/*`],
      })],
      environment: {
        LOG_LEVEL: 'DEBUG',
        // @ts-ignore
        DATABASE: table.databaseName,
        CATALOG: table.catalogId,
        REPORT_BUCKET: reportingBucket.bucketName,
        TAG_INVENTORY_TABLE: table.ref,
        ATHENA_BUCKET: athenaWorkGroupBucket.bucketName,
        WORKGROUP: workgroupName,
      },
    });
    const role = new Role(this, 'ReportSchedulerRole', { assumedBy: new ServicePrincipal('scheduler.amazonaws.com') });
    generateCsvReportFunction.grantInvoke(role);
    reportingBucket.grantReadWrite(generateCsvReportFunction);
    athenaWorkGroupBucket.grantReadWrite(generateCsvReportFunction);
    tagInventoryBucket.grantRead(generateCsvReportFunction);
    const workGroup = new CfnWorkGroup(this, 'AthenaWorkGroup', {
      name: workgroupName,
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: athenaWorkGroupBucket.s3UrlForObject(''),
          encryptionConfiguration: {
            encryptionOption: 'SSE_S3',
          },
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
      scheduleExpression: 'cron(0 6 ? * * *)',
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
    this.cdkNagSuppressions();
    Tags.of(this).add('Solution', 'aws-organizations-tag-inventory');
    Tags.of(this).add('Url', 'https://github.com/aws-samples/aws-organizations-tag-inventory');
  }

  private cdkNagSuppressions() {
    // NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/S3ServerAccessLogBucket/Resource`, [
    //   {
    //     id: 'AwsSolutions-S1',
    //     reason: 'This is the S3 server access log bucket',
    //   },
    // ]);
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS managed policies acceptable for sample',
      }, {
        id: 'AwsSolutions-ATH1',
        reason: 'Because the lambda is writing to an external table it needs to use client configuration',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Wildcard permissions have been scoped down',
      },
      {
        id: 'AwsSolutions-GL1',
        reason: 'No sensitive data stored in cloudwatch logs',
      },
    ]);
  }
}
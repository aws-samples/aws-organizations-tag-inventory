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


import { CfnParameter, RemovalPolicy, Stack, StackProps, Tags, Fn } from 'aws-cdk-lib';

import { ArnPrincipal, Effect, OrganizationPrincipal, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';


export interface OrganizationAssetBucketStackProps extends StackProps {
  bucketName?: string;
  organizationId?: string;
}

export class OrganizationAssetBucketStack extends Stack {
  readonly assetsBucket: IBucket;

  constructor(scope: Construct, id: string, props: OrganizationAssetBucketStackProps) {
    super(scope, id, props);
    //we have to make sure all the stacks have the same parameters even though they're not used
    new CfnParameter(this, 'BucketNameParameter', {
      default: 'NOT USED',
      type: 'String',
      description: 'Name of the central account bucket where tag inventory data is stored',
    });
    new CfnParameter(this, 'TopicArnParameter', {
      default: 'NOT USED',
      type: 'String',
      description: "ARN of the central account's notification topic",
    });
    new CfnParameter(this, 'CentralRoleArnParameter', {
      default: 'NOT USED',
      type: 'String',
      description: "ARN of the central account's cross account role with permissions to write to the centralized bucket where tag inventory data is stored",
    });
    new CfnParameter(this, 'EnabledRegionsParameter', {

      default: 'NOT USED',
      type: 'CommaDelimitedList',
      description: 'Regions to enable Resource Explorer Indexing',
    });
    new CfnParameter(this, 'AggregatorRegionParameter', {
      default: 'NOT USED',
      type: 'String',
      description: 'The region that contains teh Resource Explorer aggregator',
    });
    new CfnParameter(this, 'OrganizationalUnitIdsParameter', {

      default: 'NOT USED',
      type: 'CommaDelimitedList',
      description: 'Organizational units to deploy the spoke stack to',
    });
    new CfnParameter(this, 'OrganizationPayerAccountIdParameter', {
      default: 'NOT USED',
      type: 'String',
      description: 'The id of the AWS organization payer account',
    });
    new CfnParameter(this, 'ScheduleParameter', {
      default: 'NOT USED',
      type: 'String',

      description: 'The frequency jobs are run',
    });
    const organizationIdParameter = new CfnParameter(this, 'OrganizationIdParameter', {
      default: props.organizationId,
      type: 'String',
      description: 'The AWS organization ID',
    });
    const assetBucketNameParameter = new CfnParameter(this, 'AssetBucketNameParameter', {
      default: props.bucketName,
      type: 'String',
      description: 'Name of the bucket where tag inventory cdk assets will be stored for spoke accounts to access during deployment',
    });
    const accessLogBucket = new Bucket(this, 'AccessLogBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      enforceSSL: true,
      autoDeleteObjects: true,
    });
    this.assetsBucket = new Bucket(this, 'Bucket', {
      bucketName: assetBucketNameParameter.valueAsString,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
      serverAccessLogsBucket: accessLogBucket,
      enforceSSL: true,
      autoDeleteObjects: true,

    });
    this.assetsBucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:Get*', 's3:List*'],
      principals: [new OrganizationPrincipal(organizationIdParameter.valueAsString)],
      resources: [this.assetsBucket.bucketArn, `${this.assetsBucket.bucketArn}/*`],


    }));
    this.assetsBucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:Get*', 's3:List*'],
      principals: [new ServicePrincipal('member.org.stacksets.cloudformation.amazonaws.com')],
      resources: [this.assetsBucket.bucketArn, `${this.assetsBucket.bucketArn}/*`],


    }));
    this.assetsBucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:Get*', 's3:List*', 's3:Put*'],
      //@ts-ignore
      principals: [new ArnPrincipal(Fn.sub(this.synthesizer.fileAssetPublishingRoleArn))],
      resources: [this.assetsBucket.bucketArn, `${this.assetsBucket.bucketArn}/*`],
    }));

    this.cdkNagSuppressions();
    Tags.of(this).add('Solution', 'aws-organizations-tag-inventory');
    Tags.of(this).add('Url', 'https://github.com/aws-samples/aws-organizations-tag-inventory');
  }

  private cdkNagSuppressions() {

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS managed policies acceptable for sample',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Wildcard permissions have been scoped down',
      }, {
        id: 'AwsSolutions-L1',
        reason: 'Manually managing versions',
      },
    ]);
  }
}
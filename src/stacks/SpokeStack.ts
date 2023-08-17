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
import { Aws, CfnParameter, Duration, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import { RegionInfo } from 'aws-cdk-lib/region-info';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { Layers } from '../constructs/Layers';
import { ResourceExplorerIndex } from '../constructs/ResourceExplorerIndex';
import { StateMachineFromFile } from '../constructs/StateMachineFromFile';


export interface SpokeStackProps extends StackProps {
  enabledRegions?: string;
  aggregatorRegion?: string;
  bucketName?: string | undefined;
  centralRoleArn?: string | undefined;

}

export class SpokeStack extends Stack {

  constructor(scope: Construct, id: string, props: SpokeStackProps) {
    super(scope, id, props);

    const bucketNameParameter=new CfnParameter(this, 'BucketNameParameter', {
      default: props.bucketName,
      type: 'String',
      description: 'Name of the central account bucket where tag inventory data is stored',
    });
    const centralRoleArnParameter=new CfnParameter(this, 'centralRoleArnParameter', {
      default: props.centralRoleArn,
      type: 'String',
      description: "ARN of the central account's cross account role with permissions to write to the centralized bucket where tag inventory data is stored",
    });
    const enabledRegionsParameter=new CfnParameter(this, 'EnabledRegionsParameter', {

      default: props.enabledRegions,
      type: 'CommaDelimitedList',
      description: 'Regions to enable Resource Explorer Indexing',
    });
    const aggregatorRegionParameter=new CfnParameter(this, 'AggregatorRegionParameter', {
      allowedValues: RegionInfo.regions.map(value => {
        return value.name;
      }),
      default: props.aggregatorRegion,
      type: 'String',
      description: 'The region that contains teh Resource Explorer aggregator',
    });
    const powerToolsLayer = LayerVersion.fromLayerVersionArn(this, 'powertools', `arn:aws:lambda:${Aws.REGION}:094274105915:layer:AWSLambdaPowertoolsTypeScript:11`);

    const layers = new Layers(this, 'layers');
    //put resources here
    const resourceExplorerIndex = new ResourceExplorerIndex(this, 'MyIndex', {
      layers: layers,
      enabledRegions: enabledRegionsParameter.valueAsList,
      aggregatorRegion: aggregatorRegionParameter.valueAsString,

    });


    const searchFunction = new NodejsFunction(this, 'Search-fn', {
      architecture: Architecture.ARM_64,
      runtime: Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'functions', 'Search.ts'),
      handler: 'index.onEvent',
      timeout: Duration.seconds(60),
      layers: [layers.layer, powerToolsLayer],
      initialPolicy: [new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['resource-explorer-2:Search'],
        resources: ['*'],
      })],
      environment: {
        VIEW_ARN: resourceExplorerIndex.viewArn,
        LOG_LEVEL: 'DEBUG',
      },
    });
    const mergeFunction = new NodejsFunction(this, 'MergeResults-fn', {
      architecture: Architecture.ARM_64,
      runtime: Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '..', 'functions', 'MergeResults.ts'),
      handler: 'index.onEvent',
      timeout: Duration.seconds(60),
      layers: [powerToolsLayer],
      initialPolicy: [],
      environment: {
        LOG_LEVEL: 'DEBUG',
      },
    });

    const stateMachine = new StateMachineFromFile(this, 'SpokeAccountStateMachine',
      { name: 'SpokeAccountStateMachine', file: path.join(__dirname, '..', 'stateMachines', 'SpokeAccountStateMachine.json'), searchFunction: searchFunction, mergeFunction: mergeFunction, putObjectRoleArn: centralRoleArnParameter.valueAsString, bucketName: bucketNameParameter.valueAsString });

    stateMachine.stateMachine.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:PutObject', 's3:PutObjectAcl'],
      resources: [`arn:aws:s3:::${bucketNameParameter.valueAsString}`, `arn:aws:s3:::${bucketNameParameter.valueAsString}/*`],
    }));
    stateMachine.stateMachine.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sts:AssumeRole'],
      resources: [centralRoleArnParameter.valueAsString],
    }));
    mergeFunction.grantInvoke(stateMachine.stateMachine);
    searchFunction.grantInvoke(stateMachine.stateMachine);
    const role=new Role(this, 'SchedulerRole', { assumedBy: new ServicePrincipal('scheduler.amazonaws.com') });
    stateMachine.stateMachine.grantStartExecution(role);
    new CfnSchedule(this, 'Scheduler', {
      name: 'TagInventorySchedule',
      flexibleTimeWindow: {
        maximumWindowInMinutes: 60,
        mode: 'FLEXIBLE',
      },
      state: 'ENABLED',
      scheduleExpression: 'cron(0 6 ? * * *)',
      target: {
        arn: stateMachine.stateMachine.stateMachineArn,
        roleArn: role.roleArn,
      },
      scheduleExpressionTimezone: 'America/New_York',
    });
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
      },
    ]);
  }
}
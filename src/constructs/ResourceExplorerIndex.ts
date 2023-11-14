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
import { CfnOutput, CustomResource, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { Layers } from './Layers';

export interface ResourceExplorerIndexConfig {
  layers: Layers;
  enabledRegions: string[];
  aggregatorRegion: string;

}

export class ResourceExplorerIndex extends Construct {
  readonly viewArn:string;
  constructor(scope: Construct, id: string, config: ResourceExplorerIndexConfig) {
    super(scope, id);

    const resource = new CustomResource(this, 'resource-explorer-index-custom-resource', {
      serviceToken: ResourceExplorerIndexProvider.getOrCreate(this, config.layers),
      resourceType: 'Custom::ResourceExplorerIndex',
      properties: {
        ENABLED_REGIONS: config.enabledRegions,
        AGGREGATOR_INDEX_REGION: config.aggregatorRegion,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    new CfnOutput(this, 'tag-inventory-all-resources-arn-output', {
      value: resource.getAtt('ViewArn').toString(),
      description: 'Arn of tag-inventory-all-resources view',

    });
    this.viewArn = resource.getAtt('ViewArn').toString();
  }
}

class ResourceExplorerIndexProvider extends Construct {
  public static getOrCreate(scope: Construct, layers: Layers) {
    const stack = Stack.of(scope);
    const id = 'com.amazonaws.cdk.custom-resources.resource-explorer-index-provider';
    const x = stack.node.tryFindChild(id) as ResourceExplorerIndexProvider || new ResourceExplorerIndexProvider(stack, id, layers);
    return x.provider.serviceToken;
  }

  private readonly provider: Provider;

  constructor(scope: Construct, id: string, layers: Layers) {
    super(scope, id);

    this.provider = new Provider(this, 'resource-explorer-index-provider', {
      onEventHandler: new NodejsFunction(this, 'resource-explorer-index-fn', {
        architecture: Architecture.ARM_64,
        runtime: Runtime.NODEJS_20_X,
        entry: path.join(__dirname, '..', 'functions', 'ResourceExploreIndexHandler.ts'),
        handler: 'index.onEvent',
        timeout: Duration.seconds(60),
        layers: [layers.layer],
        initialPolicy: [new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['resource-explorer-2:CreateView',
            'resource-explorer-2:ListViews',
            'resource-explorer-2:GetView',
            'resource-explorer-2:GetIndex',
            'resource-explorer-2:CreateIndex',
            'resource-explorer-2:UpdateIndexType',
            'resource-explorer-2:GetDefaultView',
            'resource-explorer-2:AssociateDefaultView'],
          resources: ['*'],
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['iam:CreateServiceLinkedRole'],
          resources: ['arn:aws:iam::*:role/aws-service-role/resource-explorer-2.amazonaws.com/AWSServiceRoleForResourceExplorer'],
        })],
      }),
    });
  }
}
import path from 'path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { Layers } from './Layers';

export interface ResourceExplorerIndexConfig {
  layers: Layers;
  enabledRegions:string[]
  aggregatorRegion:string

}

export class ResourceExplorerIndex extends Construct {

  constructor(scope: Construct, id: string, config: ResourceExplorerIndexConfig) {
    super(scope, id);

    const resource = new CustomResource(this, 'resource-explorer-index-custom-resource', {
      serviceToken: ResourceExplorerIndexProvider.getOrCreate(this, config.layers),
      resourceType: 'Custom::ResourceExplorerIndex',
      properties: {
        ENABLED_REGIONS: config.enabledRegions,
        AGGREGATOR_INDEX_REGION: config.aggregatorRegion,
      },
    });
    resource.getAtt('Arn');

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
        runtime: Runtime.NODEJS_18_X,
        entry: path.join(__dirname, '..', 'functions', 'ResourceExploreIndexHandler.ts'),
        handler: 'index.onEvent',
        timeout: Duration.seconds(60),
        layers: [layers.layer],
        initialPolicy: [new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['resource-explorer-2:CreateView', 'resource-explorer-2:ListViews', 'resource-explorer-2:GetView', 'resource-explorer-2:GetIndex', 'resource-explorer-2:CreateIndex', 'resource-explorer-2:UpdateIndexType'],
          resources: ['*'],
        })],
      }),
    });
  }
}
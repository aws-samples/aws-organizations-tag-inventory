import path from 'path';
import {Aws, Duration, Stack, StackProps} from 'aws-cdk-lib';
import {Effect, PolicyStatement} from 'aws-cdk-lib/aws-iam';
import {Architecture, LayerVersion, Runtime} from 'aws-cdk-lib/aws-lambda';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import {Construct} from 'constructs';
import {Layers} from '../constructs/Layers';
import {ResourceExplorerIndex} from '../constructs/ResourceExplorerIndex';
import {StateMachineFromFile} from '../constructs/StateMachineFromFile';

export interface SpokeStackProps extends StackProps {
  enabledRegions: string[];
  aggregatorRegion: string;
}

export class SpokeStack extends Stack {

  constructor(scope: Construct, id: string, props: SpokeStackProps) {
    super(scope, id, props);
    const layers = new Layers(this, 'layers');
    //put resources here
    const resourceExplorerIndex = new ResourceExplorerIndex(this, 'MyIndex', {
      layers: layers,
      enabledRegions: props.enabledRegions,
      aggregatorRegion: props.aggregatorRegion,

    });
    const powerToolsLayer = LayerVersion.fromLayerVersionArn(this, 'powertools', `arn:aws:lambda:${Aws.REGION}:094274105915:layer:AWSLambdaPowertoolsTypeScript:11`);


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
      { name: 'SpokeAccountStateMachine', file: path.join(__dirname, '..', 'stateMachines', 'SpokeAccountStateMachine.json'), searchFunction: searchFunction, mergeFunction: mergeFunction });
    stateMachine.stateMachine.addToRolePolicy(new PolicyStatement({
      effect:Effect.ALLOW,
      actions: ["dynamodb:PutItem","dynamodb:BatchWriteItem","dynamodb:UpdateItem"],
      resources: ["*"]


    }))
    mergeFunction.grantInvoke(stateMachine.stateMachine);
    searchFunction.grantInvoke(stateMachine.stateMachine);

  }
}
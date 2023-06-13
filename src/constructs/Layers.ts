import * as path from 'path';
import { Aws, RemovalPolicy } from 'aws-cdk-lib';
import { Architecture, Code, ILayerVersion, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export class Layers extends Construct {
  readonly layer: ILayerVersion;
  readonly powerToolsLayer: ILayerVersion;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.layer = new LayerVersion(this, 'layer', {
      removalPolicy: RemovalPolicy.DESTROY,
      code: Code.fromAsset(path.join(__dirname, '..', '..', 'dist', 'aws-organizations-tag-inventory-layer.zip')),
      compatibleArchitectures: [Architecture.ARM_64, Architecture.X86_64],
    });


    this.powerToolsLayer = LayerVersion.fromLayerVersionArn(this, 'powertools', `arn:aws:lambda:${Aws.REGION}:094274105915:layer:AWSLambdaPowertoolsTypeScript:11`);
  }

}
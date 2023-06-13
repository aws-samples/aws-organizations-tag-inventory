import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Layers } from '../constructs/Layers';
import { ResourceExplorerIndex } from '../constructs/ResourceExplorerIndex';

export class SpokeStack extends Stack {

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const layers=new Layers(this, 'layers');
    //put resources here
    new ResourceExplorerIndex(this, 'MyIndex', {
      layers: layers,
    });


  }
}
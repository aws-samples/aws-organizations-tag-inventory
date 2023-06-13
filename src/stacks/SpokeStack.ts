import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Layers } from '../constructs/Layers';
import { ResourceExplorerIndex } from '../constructs/ResourceExplorerIndex';

export interface SpokeStackProps extends StackProps{
  enabledRegions:string[]
  aggregatorRegion:string
}
export class SpokeStack extends Stack {

  constructor(scope: Construct, id: string, props: SpokeStackProps) {
    super(scope, id, props);
    const layers=new Layers(this, 'layers');
    //put resources here
    new ResourceExplorerIndex(this, 'MyIndex', {
      layers: layers,
      enabledRegions: props.enabledRegions,
      aggregatorRegion: props.aggregatorRegion

    });


  }
}
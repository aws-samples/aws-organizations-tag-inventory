import {Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import { aws_resourceexplorer2 as resourceexplorer2 } from 'aws-cdk-lib';

export class SpokeStack extends Stack {

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);
        //put resources here
        new resourceexplorer2.CfnIndex(this, 'MyCfnIndex', {
            type: 'AGGREGATOR',

        });
    }
}
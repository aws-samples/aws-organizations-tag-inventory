import {Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {ResourceExplorerIndex} from "../constructs/ResourceExplorerIndex";

export class SpokeStack extends Stack {

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);
        //put resources here
        new ResourceExplorerIndex(this, "MyIndex")


    }
}
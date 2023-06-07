import {Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";

export class CentralStack extends Stack {

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);
        //put resources here
    }
}
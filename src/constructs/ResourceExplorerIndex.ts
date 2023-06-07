import {Construct} from "constructs";
import {Provider} from "aws-cdk-lib/custom-resources";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Architecture,  Runtime} from "aws-cdk-lib/aws-lambda";
import path from "path";
import {CustomResource, Duration} from "aws-cdk-lib";
import {RetentionDays} from "aws-cdk-lib/aws-logs";
export class ResourceExplorerIndex extends Construct {

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const fn=new NodejsFunction(this, 'resource-explorer-index-fn', {
            architecture: Architecture.ARM_64,
            runtime: Runtime.NODEJS_18_X,
            entry: path.join(__dirname, '..', 'functions', 'ResourceExploreIndexHandler.ts'),
            handler: 'index.onEvent',
            timeout: Duration.seconds(60),

        });
       const provider= new Provider(this, 'MyProvider', {
            onEventHandler: fn,
            logRetention: RetentionDays.ONE_DAY,
            providerFunctionName: 'resource-explorer-index-provider'

        });
        new CustomResource(this,"resource-explorer-index-custom-resource",{
            serviceToken: provider.serviceToken,
            resourceType: 'Custom::ResourceExplorerIndex',
        })

    }
}
import {App} from 'aws-cdk-lib';
import {SpokeStack} from './stacks/SpokeStack';


// for development, use account/region from cdk cli
const devEnv = {
	account: process.env.CDK_DEFAULT_ACCOUNT,
	region: process.env.CDK_DEFAULT_REGION,

};

const app = new App();

new SpokeStack(app, 'aws-organizations-tag-inventory-spokestack', {
	env: devEnv,
	enabledRegions: ['us-east-1', 'use-east-2', 'us-west-1', 'us-west-2'],
	aggregatorRegion: "us-east-2"
});
// new MyStack(app, 'aws-organizations-tag-inventory-prod', { env: prodEnv });

app.synth();
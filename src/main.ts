import { App } from 'aws-cdk-lib';
import { SpokeStack } from './stacks/SpokeStack';


// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,

};

const app = new App();

new SpokeStack(app, 'aws-organizations-tag-inventory-spokestack', { env: devEnv });
// new MyStack(app, 'aws-organizations-tag-inventory-prod', { env: prodEnv });

app.synth();
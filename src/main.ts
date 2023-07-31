import { App } from 'aws-cdk-lib';
import { CentralStack } from './stacks/CentralStack';
import { SpokeStack } from './stacks/SpokeStack';


// for development, use account/region from cdk cli
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',

};

const app = new App();
const stackToDeploy = app.node.tryGetContext('stack') as String | undefined;
if (stackToDeploy == undefined || stackToDeploy == 'central') {
  new CentralStack(app, 'aws-organizations-tag-inventory-central-stack', {
    env: env,
    organizationId: app.node.tryGetContext('organizationId'),
  });
}
if (stackToDeploy == undefined || stackToDeploy == 'spoke') {
  new SpokeStack(app, 'aws-organizations-tag-inventory-spoke-stack', {
    env: env,
    enabledRegions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
    aggregatorRegion: 'us-east-2',
    bucketName: app.node.tryGetContext('bucketName'),
    centralRoleArn: app.node.tryGetContext('centralRoleArn'),
  });
}
app.synth();
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {App, Aspects, DefaultStackSynthesizer} from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
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
    synthesizer:new DefaultStackSynthesizer({
      generateBootstrapVersionRule: false
    })
  });
}
if (stackToDeploy == undefined || stackToDeploy == 'spoke') {
  new SpokeStack(app, 'aws-organizations-tag-inventory-spoke-stack', {
    env: env,
    enabledRegions:  app.node.tryGetContext('enabledRegions'),
    aggregatorRegion:  app.node.tryGetContext('aggregatorRegion'),
    bucketName: app.node.tryGetContext('bucketName'),
    centralRoleArn: app.node.tryGetContext('centralRoleArn'),
    synthesizer:new DefaultStackSynthesizer({
      generateBootstrapVersionRule: false
    })
  });
}
Aspects.of(app).add(new AwsSolutionsChecks({}));

app.synth();
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

import { App, Aspects, DefaultStackSynthesizer } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { CentralStack } from './stacks/CentralStack';
import { OrganizationAssetBucketStack } from './stacks/OrganizationAssetBucketStack';
import { OrganizationStack } from './stacks/OrganizationStack';
import { SpokeStack } from './stacks/SpokeStack';


const main = async (): Promise<App> => {

  // for development, use account/region from cdk cli

  const app = new App();
  const env = {
    account: app.node.tryGetContext('account') ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: app.node.tryGetContext('region') ?? process.env.CDK_DEFAULT_REGION,

  };

  Aspects.of(app).add(new AwsSolutionsChecks({}));
  const stackToDeploy = app.node.tryGetContext('stack') as String | undefined;
  if (stackToDeploy == 'central') {
    new CentralStack(app, 'aws-organizations-tag-inventory-central-stack', {
      env: env,
      organizationId: app.node.tryGetContext('organizationId'),
      organizationPayerAccountId: app.node.tryGetContext('organizationPayerAccountId'),
      deployQuickSight: JSON.parse(app.node.tryGetContext('deployQuickSight') ?? false),
      quickSightGroupArns: app.node.tryGetContext('quickSightGroupArns'),
      quickSightUserArns: app.node.tryGetContext('quickSightUserArns'),
      synthesizer: new DefaultStackSynthesizer({
        generateBootstrapVersionRule: false,

      }),
    });
  } else if (stackToDeploy == 'spoke') {
    new SpokeStack(app, 'aws-organizations-tag-inventory-spoke-stack', {
      env: env,
      enabledRegions: app.node.tryGetContext('enabledRegions'),
      aggregatorRegion: app.node.tryGetContext('aggregatorRegion'),
      bucketName: app.node.tryGetContext('bucketName'),
      centralRoleArn: app.node.tryGetContext('centralRoleArn'),
      synthesizer: new DefaultStackSynthesizer({
        generateBootstrapVersionRule: false,
      }),
      organizationPayerAccountId: app.node.tryGetContext('organizationPayerAccountId'),
    });
  } else if (stackToDeploy == 'organization') {
    const organizationId = app.node.tryGetContext('organizationId');
    const bucketName = `awsorgtaginvcdkassetbucket-${env.account}-${env.region}`;
    const assetBucketStack = new OrganizationAssetBucketStack(app, 'aws-organizations-tag-inventory-asset-bucket-stack', {
      env: env,
      bucketName: bucketName,
      organizationId: organizationId,
    });
    const synthesizer = new DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
      fileAssetsBucketName: bucketName,
    });
    const spokeStack = new SpokeStack(app, 'aws-organizations-tag-inventory-spoke-stack', {
      env: env,
      enabledRegions: app.node.tryGetContext('enabledRegions'),
      aggregatorRegion: app.node.tryGetContext('aggregatorRegion'),
      bucketName: app.node.tryGetContext('bucketName'),
      centralRoleArn: app.node.tryGetContext('centralRoleArn'),
      synthesizer: synthesizer,
      organizationPayerAccountId: app.node.tryGetContext('organizationPayerAccountId'),
    });
    spokeStack.addDependency(assetBucketStack);
    spokeStack.synthesizer.synthesize({
      outdir: app.outdir,
      assembly: app._assemblyBuilder,
      validateOnSynth: true,
    });
    const organizationStack = new OrganizationStack(app, 'aws-organizations-tag-inventory-spoke-stacks', {
      env: env,
      enabledRegions: app.node.tryGetContext('enabledRegions'),
      aggregatorRegion: app.node.tryGetContext('aggregatorRegion'),
      bucketName: app.node.tryGetContext('bucketName'),
      centralRoleArn: app.node.tryGetContext('centralRoleArn'),
      synthesizer: synthesizer,
      organizationalUnitIds: app.node.tryGetContext('organizationalUnitIds').split(','),
      spokeStackTemplateFile: spokeStack.templateFile,
      organizationPayerAccountId: app.node.tryGetContext('organizationPayerAccountId'),
    });
    organizationStack.addDependency(spokeStack);


  }

  return app;
};

main().then(app => {
  if (app.node.children.length == 0) {
    console.error('Unable to find any stacks to deploy');
  } else {
    app.synth();
  }
}).catch(reason => {
  console.error(reason);
}).finally(() => {

});
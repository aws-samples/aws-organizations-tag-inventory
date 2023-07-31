import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SpokeStack } from '../src/stacks/SpokeStack';

test('Snapshot', () => {
  const app = new App();
  const stack = new SpokeStack(app, 'test', {
    enabledRegions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
    aggregatorRegion: 'us-east-2',
    bucketName: 'test-bucket',
    centralRoleArn: 'test-role',
  });

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
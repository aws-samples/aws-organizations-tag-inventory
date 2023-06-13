import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SpokeStack } from '../src/stacks/SpokeStack';

test('Snapshot', () => {
  const app = new App();
  const stack = new SpokeStack(app, 'test', {});

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
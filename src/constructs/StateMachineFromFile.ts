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


import { RemovalPolicy } from 'aws-cdk-lib';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DefinitionBody, LogLevel, StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface StateMachineFromFileConfig {
  name: string;
  file: string;
  searchFunction: IFunction;
  mergeFunction: IFunction;
  putObjectRoleArn: string;
  bucketName: string;
  topicArn:string;
}

export class StateMachineFromFile extends Construct {

  readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, config: StateMachineFromFileConfig) {
    super(scope, id);
    const logGroup = new LogGroup(this, `${config.name}LogGroup`, {
      logGroupName: `/aws/statemachine/${config.name}`,
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_MONTH,
    });
    this.stateMachine = new StateMachine(this, config.name, {
      definitionBody: DefinitionBody.fromFile(config.file),
      definitionSubstitutions: {
        SEARCH_FUNCTION: config.searchFunction.functionArn,
        MERGE_FUNCTION: config.mergeFunction.functionArn,
        CENTRAL_ROLE_ARN: config.putObjectRoleArn,
        CENTRAL_BUCKET_NAME: config.bucketName,
        TOPIC_ARN: config.topicArn,
      },
      logs: {
        level: LogLevel.ALL,
        destination: logGroup,

      },
      tracingEnabled: true,
    });
    logGroup.grantWrite(this.stateMachine)
    logGroup.grantRead(this.stateMachine)
  }

}
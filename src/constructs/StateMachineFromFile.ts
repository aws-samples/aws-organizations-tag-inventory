import * as fs from 'fs';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { CfnStateMachine, Pass, StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface StateMachineFromFileConfig {
  name: string;
  file: string;
  searchFunction: IFunction;
  mergeFunction: IFunction;
  putObjectRoleArn: string;
  bucketName:string
}

export class StateMachineFromFile extends Construct {

  readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, config: StateMachineFromFileConfig) {
    super(scope, id);
    this.stateMachine = new StateMachine(this, config.name, {
      definition: new Pass(this, 'StartState'),
    });

    const cfnStatemachine = this.stateMachine.node.defaultChild as CfnStateMachine;
    const buffer = fs.readFileSync(config.file.toString());
    cfnStatemachine.definitionString = buffer.toString();
    cfnStatemachine.definitionSubstitutions = { SEARCH_FUNCTION: config.searchFunction.functionArn, MERGE_FUNCTION: config.mergeFunction.functionArn, CENTRAL_ROLE_ARN: config.putObjectRoleArn,CENTRAL_BUCKET_NAME:config.bucketName};
  }

}
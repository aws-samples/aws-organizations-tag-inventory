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


import {CfnParameter, Stack, StackProps, Tags} from 'aws-cdk-lib';

import {NagSuppressions} from 'cdk-nag';
import {Construct} from 'constructs';
import {Central} from "../constructs/Central";
import {QuicksightDashboard} from "../constructs/QuicksightDashboard";


export interface CentralStackProps extends StackProps {
	organizationId?: string
	organizationPayerAccountId?: string
	deployQuickSightDashboard: boolean,
	quickSightUserArns?: string
	quickSightGroupArns?: string
}

export class CentralStack extends Stack {

	constructor(scope: Construct, id: string, props: CentralStackProps) {
		super(scope, id, props);
		const organizationIdParameter = new CfnParameter(this, 'OrganizationIdParameter', {
			default: props.organizationId,
			type: 'String',
			description: 'The AWS organization ID',
		});
		const organizationPayerAccountIdParameter = new CfnParameter(this, 'OrganizationPayerAccountIdParameter', {
			default: props.organizationPayerAccountId,
			type: 'String',
			description: 'The id of the AWS organization payer account',
		});

		const central = new Central(this, "central", {
			organizationId: organizationIdParameter.valueAsString,
			organizationPayerAccountId: organizationPayerAccountIdParameter.valueAsString
		})
		//right now this option is only available through cdk generation
		if (props.deployQuickSightDashboard) {

			new QuicksightDashboard(this, "QuickSight", {
				central: central,
				quickSightUserArns: props.quickSightUserArns?.split(","),
				quickSightGroupArns: props.quickSightGroupArns?.split(","),
				organizationId: organizationIdParameter.valueAsString
			})
		}
		this.cdkNagSuppressions();
		Tags.of(this).add('Solution', 'aws-organizations-tag-inventory');
		Tags.of(this).add('Url', 'https://github.com/aws-samples/aws-organizations-tag-inventory');
	}

	private cdkNagSuppressions() {

		NagSuppressions.addStackSuppressions(this, [
			{
				id: 'AwsSolutions-IAM4',
				reason: 'AWS managed policies acceptable for sample',
			}, {
				id: 'AwsSolutions-ATH1',
				reason: 'Because the lambda is writing to an external table it needs to use client configuration',
			},
			{
				id: 'AwsSolutions-IAM5',
				reason: 'Wildcard permissions have been scoped down',
			},
			{
				id: 'AwsSolutions-GL1',
				reason: 'No sensitive data stored in cloudwatch logs',
			},
		]);
	}
}
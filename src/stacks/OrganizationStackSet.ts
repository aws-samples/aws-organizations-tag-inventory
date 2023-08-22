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


import {CfnStackSet, Stack, StackProps, Tags} from 'aws-cdk-lib';

import {NagSuppressions} from 'cdk-nag';
import {Construct} from 'constructs';
import * as cdk from "aws-cdk-lib/core/lib";



export interface OrganizationStackSetProps extends StackProps {
	templateUrl:string,
	stackInstancesGroup:Array<cdk.IResolvable | CfnStackSet.StackInstancesProperty> | cdk.IResolvable
}

export class OrganizationStackSet extends Stack {

	constructor(scope: Construct, id: string, props: OrganizationStackSetProps) {
		super(scope, id, props);
		new CfnStackSet(this,"aws-organizations-tag-inventory-spoke-account-stack-set",{
			description: "StackSet for deploy the aws-organizations-tag-inventory-spoke-stack to account across the organization",
			stackSetName: "aws-organizations-tag-inventory-spoke-account-stack-set",
			permissionModel: "SERVICE_MANAGED",
			capabilities:["CAPABILITY_IAM"],
			autoDeployment: {
				enabled: false,
				retainStacksOnAccountRemoval:false
			},
			templateUrl: props.templateUrl,
			stackInstancesGroup: props.stackInstancesGroup
		})
		this.cdkNagSuppressions();
		Tags.of(this).add('Solution', 'aws-organizations-tag-inventory');
		Tags.of(this).add('Url', 'https://github.com/aws-samples/aws-organizations-tag-inventory');
	}

	private cdkNagSuppressions() {

		NagSuppressions.addStackSuppressions(this, []);
	}
}
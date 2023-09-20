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


import * as path from 'path';
import {CfnParameter, CfnStackSet, Stack, Tags, Fn} from 'aws-cdk-lib';

import {Asset} from 'aws-cdk-lib/aws-s3-assets';
import {RegionInfo} from 'aws-cdk-lib/region-info';
import {NagSuppressions} from 'cdk-nag';
import {Construct} from 'constructs';
import {SpokeStackProps} from './SpokeStack';
import {ScheduleExpression} from '../constructs/ScheduleExpression';

export interface OrganizationStackSetProps extends SpokeStackProps {
	organizationalUnitIds?: string[];
	spokeStackTemplateFile: string;
	organizationPayerAccountId?: string;
	schedule?: string;
}

export class OrganizationStack extends Stack {

	constructor(scope: Construct, id: string, props: OrganizationStackSetProps) {
		super(scope, id, props);
		const bucketNameParameter = new CfnParameter(this, 'BucketNameParameter', {
			default: props.bucketName,
			type: 'String',
			description: 'Name of the central account bucket where tag inventory data is stored',
		});
		const centralTopicArnParameter = new CfnParameter(this, 'TopicArnParameter', {
			default: props.topicArn,
			type: 'String',
			description: "ARN of the central account's notification topic",
		});
		const centralRoleArnParameter = new CfnParameter(this, 'CentralRoleArnParameter', {
			default: props.centralRoleArn,
			type: 'String',
			description: "ARN of the central account's cross account role with permissions to write to the centralized bucket where tag inventory data is stored",
		});
		const enabledRegionsParameter = new CfnParameter(this, 'EnabledRegionsParameter', {

			default: props.enabledRegions,
			type: 'CommaDelimitedList',
			description: 'Regions to enable Resource Explorer Indexing',
		});
		const aggregatorRegionParameter = new CfnParameter(this, 'AggregatorRegionParameter', {
			allowedValues: RegionInfo.regions.map(value => {
				return value.name;
			}),
			default: props.aggregatorRegion,
			type: 'String',
			description: 'The region that contains teh Resource Explorer aggregator',
		});
		const organizationalUnitIdsParameter = new CfnParameter(this, 'OrganizationalUnitIdsParameter', {

			default: props.organizationalUnitIds?.join(','),
			type: 'CommaDelimitedList',
			description: 'Organizational units to deploy the spoke stack to',
		});
		const organizationPayerAccountIdParameter = new CfnParameter(this, 'OrganizationPayerAccountIdParameter', {
			default: props.organizationPayerAccountId,
			type: 'String',
			description: 'The id of the AWS organization payer account',
		});
		const scheduleParameter = new CfnParameter(this, 'ScheduleParameter', {
			default: props.schedule,
			type: 'String',
			allowedValues: [ScheduleExpression.DAILY, ScheduleExpression.WEEKLY, ScheduleExpression.MONTHLY],
			description: 'The frequency jobs are run',
		});
		const asset = new Asset(this, 'SpokeStackTemplate', {
			path: path.join(__dirname, '..', '..', 'cdk.out', props.spokeStackTemplateFile),
		});
		new CfnStackSet(this, 'aws-organizations-tag-inventory-spoke-account-stack-set', {
			description: 'StackSet for deploy the aws-organizations-tag-inventory-spoke-stack to account across the organization',
			stackSetName: 'aws-organizations-tag-inventory-spoke-account-stack-set',
			permissionModel: 'SERVICE_MANAGED',
			capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
			autoDeployment: {
				enabled: true,
				retainStacksOnAccountRemoval: true,
			},
			templateUrl: asset.httpUrl,
			parameters: [{
				parameterKey: 'BucketNameParameter',
				parameterValue: bucketNameParameter.valueAsString,
			}, {
				parameterKey: "TopicArnParameter",
				parameterValue: centralTopicArnParameter.valueAsString
			}, {
				parameterKey: 'CentralRoleArnParameter',
				parameterValue: centralRoleArnParameter.valueAsString,
			}, {
				parameterKey: 'EnabledRegionsParameter',
				parameterValue: Fn.join(',', enabledRegionsParameter.valueAsList),
			}, {
				parameterKey: 'AggregatorRegionParameter',
				parameterValue: aggregatorRegionParameter.valueAsString,
			}, {
				parameterKey: 'OrganizationPayerAccountIdParameter',
				parameterValue: organizationPayerAccountIdParameter.valueAsString,
			}, {
				parameterKey: 'ScheduleParameter',
				parameterValue: scheduleParameter.valueAsString,
			}, {
				parameterKey: 'OrganizationalUnitIdsParameter',
				parameterValue: Fn.join(',', organizationalUnitIdsParameter.valueAsList),
			}],
			stackInstancesGroup: [{
				regions: [this.region],
				deploymentTargets: {
					organizationalUnitIds: organizationalUnitIdsParameter.valueAsList,
				},
			}],
			operationPreferences: {
				failureToleranceCount: 999,
				regionConcurrencyType: 'PARALLEL',
				maxConcurrentCount: 10,
			},

		});
		this.cdkNagSuppressions();
		Tags.of(this).add('Solution', 'aws-organizations-tag-inventory');
		Tags.of(this).add('Url', 'https://github.com/aws-samples/aws-organizations-tag-inventory');
	}

	private cdkNagSuppressions() {

		NagSuppressions.addStackSuppressions(this, []);
	}
}
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


import {CfnParameter, RemovalPolicy, Stack, StackProps, Tags, Fn} from 'aws-cdk-lib';

import {NagSuppressions} from 'cdk-nag';
import {Construct} from 'constructs';

import {BlockPublicAccess, Bucket, IBucket} from "aws-cdk-lib/aws-s3";
import {ArnPrincipal, Effect, OrganizationPrincipal, PolicyStatement, ServicePrincipal} from "aws-cdk-lib/aws-iam";


export interface OrganizationAssetBucketStackProps extends StackProps {
	bucketName?: string
	organizationId?: string
}

export class OrganizationAssetBucketStack extends Stack {
	readonly assetsBucket: IBucket

	constructor(scope: Construct, id: string, props: OrganizationAssetBucketStackProps) {
		super(scope, id, props);
		const organizationIdParameter = new CfnParameter(this, 'OrganizationIdParameter', {
			default: props.organizationId,
			type: 'String',
			description: 'The AWS organization ID',
		});
		const assetBucketNameParameter = new CfnParameter(this, 'AssetBucketNameParameter', {
			default: props.bucketName,
			type: 'String',
			description: 'Name of the bucket where tag inventory cdk assets will be stored for spoke accounts to access during deployment',
		});
		const accessLogBucket = new Bucket(this, 'AccessLogBucket', {
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			removalPolicy: RemovalPolicy.DESTROY,
			enforceSSL: true,
			autoDeleteObjects: true,
		});
		this.assetsBucket = new Bucket(this, 'Bucket', {
			bucketName: assetBucketNameParameter.valueAsString,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			eventBridgeEnabled: true,
			removalPolicy: RemovalPolicy.DESTROY,
			serverAccessLogsBucket: accessLogBucket,
			enforceSSL: true,
			autoDeleteObjects: true,

		});
		this.assetsBucket.addToResourcePolicy(new PolicyStatement({
			effect: Effect.ALLOW,
			actions: ["s3:Get*", "s3:List*"],
			principals: [new OrganizationPrincipal(organizationIdParameter.valueAsString)],
			resources: [this.assetsBucket.bucketArn, `${this.assetsBucket.bucketArn}/*`]


		}))
		this.assetsBucket.addToResourcePolicy(new PolicyStatement({
			effect: Effect.ALLOW,
			actions: ["s3:Get*", "s3:List*"],
			principals: [new ServicePrincipal("member.org.stacksets.cloudformation.amazonaws.com")],
			resources: [this.assetsBucket.bucketArn, `${this.assetsBucket.bucketArn}/*`]


		}))
		this.assetsBucket.addToResourcePolicy(new PolicyStatement({
			effect: Effect.ALLOW,
			actions: ["s3:Get*", "s3:List*", "s3:Put*"],
			//@ts-ignore
			principals: [new ArnPrincipal(Fn.sub(this.synthesizer.fileAssetPublishingRoleArn))],
			resources: [this.assetsBucket.bucketArn, `${this.assetsBucket.bucketArn}/*`]
		}))

		this.cdkNagSuppressions();
		Tags.of(this).add('Solution', 'aws-organizations-tag-inventory');
		Tags.of(this).add('Url', 'https://github.com/aws-samples/aws-organizations-tag-inventory');
	}

	private cdkNagSuppressions() {

		NagSuppressions.addStackSuppressions(this, [
			{
				id: 'AwsSolutions-IAM4',
				reason: 'AWS managed policies acceptable for sample',
			},
			{
				id: 'AwsSolutions-IAM5',
				reason: 'Wildcard permissions have been scoped down',
			}
		]);
	}
}
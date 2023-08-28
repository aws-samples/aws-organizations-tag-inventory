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

import {Construct} from "constructs";
import {CfnManagedPolicy, ManagedPolicy,  Role} from "aws-cdk-lib/aws-iam";
import {Central} from "./Central";
import {BlockPublicAccess, Bucket, BucketEncryption, IBucket} from "aws-cdk-lib/aws-s3";
import {CfnDataSet, CfnDataSource} from "aws-cdk-lib/aws-quicksight";
import {CfnWorkGroup} from "aws-cdk-lib/aws-athena";
import {Aws, RemovalPolicy} from "aws-cdk-lib";

export interface QuicksightDashboardConfig {
	organizationId: string
	central: Central,
	quickSightUserArns?: string[]
	quickSightGroupArns?: string[]
}

export class QuicksightDashboard extends Construct {

	constructor(scope: Construct, id: string, config: QuicksightDashboardConfig) {
		super(scope, id);
		if ((config.quickSightUserArns == undefined || config.quickSightUserArns.length == 0) && (config.quickSightGroupArns == undefined || config.quickSightGroupArns.length == 0)) {
			throw new Error("You must specify at least one QuickSight user or group")
		}
		const qsServiceRoleNames = [
			"aws-quicksight-service-role-v0"
		];

		const tagInventoryBucket: IBucket = config.central.tagInventoryBucket
		const athenaWorkGroupBucket: IBucket = config.central.athenaWorkGroupBucket
		const workGroup: CfnWorkGroup = config.central.workGroup
		const qsBucket = new Bucket(this, 'OutputBucket', {
			bucketName: `tag-inventory-qs-${config.organizationId}-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			eventBridgeEnabled: true,
			removalPolicy: RemovalPolicy.DESTROY,
			serverAccessLogsBucket: config.central.serverAccessLogBucket,
			enforceSSL: true,
			autoDeleteObjects: true,
			encryption: BucketEncryption.S3_MANAGED,
		});
		const qsServiceRole=Role.fromRoleName(this,"aws-quicksight-service-role-v0","aws-quicksight-service-role-v0")
		qsServiceRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AWSQuicksightAthenaAccess"))
		const qsManagedPolicy = new CfnManagedPolicy(this, 'QuickSightPolicy', {
			managedPolicyName: 'QuickSightAthenaS3Policy',
			policyDocument: {
				Statement: [
					{
						Action: ["s3:ListAllMyBuckets"],
						Effect: "Allow",
						Resource: ["arn:aws:s3:::*"],
					},
					{
						Action: ["s3:ListBucket"],
						Effect: "Allow",
						Resource: [
							athenaWorkGroupBucket.bucketArn,
							tagInventoryBucket.bucketArn,
							qsBucket.bucketArn
						],
					},
					{
						Action: [
							"s3:GetBucketLocation",
							"s3:GetObject",
							"s3:List*",

						],
						Effect: "Allow",
						Resource: [
							`arn:aws:s3:::${tagInventoryBucket.bucketName}/*`,
							`arn:aws:s3:::${athenaWorkGroupBucket.bucketName}/tables/*`,
							`arn:aws:s3:::${qsBucket.bucketName}/*`,
						],
					},
					{
						Action: [
							"s3:GetBucketLocation",
							"s3:GetObject",
							"s3:List*",
							"s3:AbortMultipartUpload",
							"s3:PutObject",
							"s3:CreateBucket",
						],
						Effect: "Allow",
						Resource: [
							`arn:aws:s3:::${athenaWorkGroupBucket.bucketName}/*`,
							`arn:aws:s3:::${qsBucket.bucketName}/*`,
						],
					},
				],
				Version: "2012-10-17",
			},
			roles: qsServiceRoleNames,
		});
		const principalArns = [...config.quickSightGroupArns ?? [], ...config.quickSightUserArns ?? []]
		const qsDataSourcePermissions: CfnDataSource.ResourcePermissionProperty[] = principalArns.map(arn => {
			return {
				principal: arn,
				actions: [
					"quicksight:DescribeDataSource",
					"quicksight:DescribeDataSourcePermissions",
					"quicksight:PassDataSource",
				],
			}
		})

		const qsDatasetPermissions: CfnDataSet.ResourcePermissionProperty[] = principalArns.map(arn => {
			return {
				principal: arn,
				actions: [
					"quicksight:DescribeDataSet",
					"quicksight:DescribeDataSetPermissions",
					"quicksight:PassDataSet",
					"quicksight:DescribeIngestion",
					"quicksight:ListIngestions",
				],
			}
		})


		const dataSource = new CfnDataSource(this, 'TagInventoryDataSource', {
			name: 'tag-inventory-data-source',
			dataSourceId: 'tag-inventory-data-source',
			type: 'ATHENA',
			dataSourceParameters: {
				athenaParameters: {
					workGroup: workGroup.name
				}
			},
			awsAccountId: Aws.ACCOUNT_ID,
			permissions: qsDataSourcePermissions,
		});
		dataSource.addDependency(qsManagedPolicy)

		new CfnDataSet(this, 'TagInventoryDataSet', {
			name: 'tag-inventory-data-set',
			dataSetId: 'tag-inventory-data-set',
			awsAccountId: Aws.ACCOUNT_ID,
			permissions: qsDatasetPermissions,
			importMode: "DIRECT_QUERY",
			physicalTableMap: {
				"tag-inventory-table": {
					relationalTable: {
						dataSourceArn: dataSource.attrArn,
						name: "tag-inventory-view",
						catalog: "AwsDataCatalog",
						schema: config.central.database.ref,
						inputColumns: [
							{
								name: "d",
								type: "STRING"
							}, {
								name: "tagname",
								type: "STRING"
							}, {
								name: "tagvalue",
								type: "STRING"
							}, {
								name: "owningaccountid",
								type: "STRING"
							}, {
								name: "region",
								type: "STRING"
							}, {
								name: "service",
								type: "STRING"
							}, {
								name: "resourcetype",
								type: "STRING"
							}, {
								name: "arn",
								type: "STRING"
							}
						]
					}
				}
			}
		});
	}
}

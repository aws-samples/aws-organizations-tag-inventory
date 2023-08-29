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
import {CfnManagedPolicy, ManagedPolicy, Role} from "aws-cdk-lib/aws-iam";
import {Central} from "./Central";
import {BlockPublicAccess, Bucket, BucketEncryption, IBucket} from "aws-cdk-lib/aws-s3";
import {CfnAnalysis, CfnDataSet, CfnDataSource} from "aws-cdk-lib/aws-quicksight";
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
		const qsServiceRole = Role.fromRoleName(this, "aws-quicksight-service-role-v0", "aws-quicksight-service-role-v0")
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

		new CfnDataSet(this, 'TagInventoryAllDataSet', {
			name: 'tag-inventory-all-data-set',
			dataSetId: 'tag-inventory-all-data-set',
			awsAccountId: Aws.ACCOUNT_ID,
			permissions: qsDatasetPermissions,
			importMode: "DIRECT_QUERY",
			physicalTableMap: {
				"tag-inventory": {
					relationalTable: {
						dataSourceArn: dataSource.attrArn,
						name: "tag-inventory",
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
				},
			}
		});
		const tagInventoryLatestViewDataSet = new CfnDataSet(this, 'TagInventoryLatestDataSet', {
			name: 'tag-inventory-latest-data-set',
			dataSetId: 'tag-inventory-latest-data-set',
			awsAccountId: Aws.ACCOUNT_ID,
			permissions: qsDatasetPermissions,
			importMode: "DIRECT_QUERY",
			physicalTableMap: {
				"tag-inventory-view-latest": {
					relationalTable: {
						dataSourceArn: dataSource.attrArn,
						name: "tag-inventory-view-latest",
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
				},
			}
		});

		const tagInventoryLatestTopTenViewDataSet = new CfnDataSet(this, 'TagInventoryLatestTopTenViewDataSet', {
			name: 'tag-inventory-latest-top-ten-data-set',
			dataSetId: 'tag-inventory-latest-top-ten-data-set',
			awsAccountId: Aws.ACCOUNT_ID,
			permissions: qsDatasetPermissions,
			importMode: "DIRECT_QUERY",
			physicalTableMap: {
				"tag-inventory-view-latest-top-ten": {
					relationalTable: {
						dataSourceArn: dataSource.attrArn,
						name: "tag-inventory-view-latest-top-ten",
						catalog: "AwsDataCatalog",
						schema: config.central.database.ref,
						inputColumns: [
						 {
								name: "tagname",
								type: "STRING"
							}, {
								name: "tagvalue",
								type: "STRING"
							}, {
								name: "resource_count",
								type: "INTEGER"
							}
						]
					}
				},
			}
		});

		new CfnAnalysis(this, "Analysis", {
			name: "Tag Inventory",
			awsAccountId: Aws.ACCOUNT_ID,
			analysisId: "tag-inventory-analysis",
			permissions: principalArns.map(value => {
				return {
					principal: value,
					actions: ["quicksight:RestoreAnalysis",
						"quicksight:UpdateAnalysisPermissions",
						"quicksight:DeleteAnalysis",
						"quicksight:DescribeAnalysisPermissions",
						"quicksight:QueryAnalysis",
						"quicksight:DescribeAnalysis",
						"quicksight:UpdateAnalysis"
					]

				}
			}),
			definition: {
				dataSetIdentifierDeclarations: [{
					dataSetArn: tagInventoryLatestViewDataSet.attrArn,
					identifier: tagInventoryLatestViewDataSet.dataSetId!
				},{
					dataSetArn: tagInventoryLatestTopTenViewDataSet.attrArn,
					identifier: tagInventoryLatestTopTenViewDataSet.dataSetId!
				}],
				filterGroups: [
					{
						filterGroupId: "tag-name-filter-group",
						filters: [
							{
								categoryFilter: {
									filterId: "tag-name-filter",
									column: {
										dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
										columnName: "tagname"
									},
									configuration: {
										filterListConfiguration: {
											matchOperator: "CONTAINS",
											selectAllOptions: "FILTER_ALL_VALUES"
										}
									}
								}
							}
						],
						scopeConfiguration: {
							selectedSheets: {
								sheetVisualScopingConfigurations: [
									{
										sheetId: "tag-inventory-analysis-latest-sheet",
										scope: "SELECTED_VISUALS",
										visualIds: [
											"distinct-tag-names-by-service"
										]
									}
								]
							}
						},
						status: "ENABLED",
						crossDataset: "SINGLE_DATASET"
					}
				],
				sheets: [{
					name: "Latest",
					sheetId: "tag-inventory-analysis-latest-sheet",

					filterControls: [
						{
							dropdown: {
								filterControlId: "latest-tag-name-filter",
								sourceFilterId: "tag-name-filter",
								title: "Tag name",
								displayOptions: {
									selectAllOptions: {
										visibility: "VISIBLE"
									},
									titleOptions: {
										visibility: "VISIBLE",
										fontConfiguration: {
											fontSize: {
												relative: "MEDIUM"
											}
										},

									}


								},
								type: "MULTI_SELECT"
							}
						}
					],
					visuals: [{
						pieChartVisual: {
							visualId: "distinct-tag-names-by-service",
							title: {
								formatText: {
									plainText: "Distinct Tag Names by Service",
								}
							},
							chartConfiguration: {
								fieldWells: {
									pieChartAggregatedFieldWells: {
										category: [{
											categoricalDimensionField: {
												fieldId: "service",
												column: {
													dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
													columnName: "service",
												}
											}
										}],
										values: [{
											categoricalMeasureField: {
												fieldId: "tagname",

												column: {
													dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
													columnName: "tagname",
												},
												aggregationFunction: "DISTINCT_COUNT"
											}
										}],

									}

								}
							}

						}
					},{
						tableVisual: {
							visualId: "tag-inventory-view-latest-top-ten",
							title: {
								visibility: "VISIBLE",
								formatText: {
									richText: "<visual-title>Top 10 Tag Names and Values</visual-title>"
								}
							},
							subtitle: {
								visibility: "VISIBLE"
							},
							chartConfiguration: {
								fieldWells: {
									tableAggregatedFieldWells: {
										groupBy: [
											{
												categoricalDimensionField: {
													fieldId: "tag-inventory-view-latest-top-ten.tagname.1.1693345312669",
													column: {
														dataSetIdentifier: "tag-inventory-latest-top-ten-data-set",
														columnName: "tagname"
													}
												}
											},
											{
												categoricalDimensionField: {
													fieldId: "tag-inventory-view-latest-top-ten.tagvalue.0.1693345288988",
													column: {
														dataSetIdentifier: "tag-inventory-latest-top-ten-data-set",
														columnName: "tagvalue"
													}
												}
											}
										],
										values: [
											{
												numericalMeasureField: {
													fieldId: "tag-inventory-view-latest-top-ten.resource_count.2.1693345358630",
													column: {
														dataSetIdentifier: "tag-inventory-latest-top-ten-data-set",
														columnName: "resource_count"
													},
													aggregationFunction: {
														simpleNumericalAggregation: "SUM"
													},
													formatConfiguration: {
														formatConfiguration: {
															numberDisplayFormatConfiguration: {
																separatorConfiguration: {
																	thousandsSeparator: {
																		visibility: "HIDDEN"
																	}
																},
																decimalPlacesConfiguration: {
																	decimalPlaces: 0
																}
															}
														}
													}
												}
											}
										]
									}
								},
								sortConfiguration: {
									rowSort: [
										{
											fieldSort: {
												fieldId: "tag-inventory-view-latest-top-ten.resource_count.2.1693345358630",
												direction: "DESC"
											}
										}
									]
								},
								tableOptions: {
									headerStyle: {
										textWrap: "WRAP",
										height: 25
									},
									rowAlternateColorOptions: {
										status: "DISABLED"
									}
								},
								fieldOptions: {
									selectedFieldOptions: [
										{
											fieldId: "tag-inventory-view-latest-top-ten.tagname.1.1693345312669",
											width: "188px",
											customLabel: "Tag Name"
										},
										{
											fieldId: "tag-inventory-view-latest-top-ten.tagvalue.0.1693345288988",
											width: "261px",
											customLabel: "Tag Value"
										},
										{
											fieldId: "tag-inventory-view-latest-top-ten.resource_count.2.1693345358630",
											width: "130px",
											customLabel: "Resources"
										}
									],
									order: [
										"tag-inventory-view-latest-top-ten.resource_count.2.1693345358630",
										"tag-inventory-view-latest-top-ten.tagname.1.1693345312669",
										"tag-inventory-view-latest-top-ten.tagvalue.0.1693345288988"
									]
								}
							},
							actions: []
						}
					}],
					layouts: [
						{
							configuration: {
								gridLayout: {
									elements: [
										{
											elementId: "distinct-tag-names-by-service",
											elementType: "VISUAL",
											columnIndex: 0,
											columnSpan: 18,
											rowIndex: 2,
											rowSpan: 12
										},
										{
											elementId: "tag-inventory-view-latest-top-ten",
											elementType: "VISUAL",
											columnSpan: 18,
											rowSpan: 12
										}
									]
								}
							}
						},

					],
					sheetControlLayouts: [
						{
							configuration: {
								gridLayout: {
									elements: [
										{
											elementId: "latest-tag-name-filter",
											elementType: "FILTER_CONTROL",
											columnSpan: 2,
											rowSpan: 1
										}
									]
								}
							}
						}
					],
					contentType: "INTERACTIVE"
				}]
			}

		})

	}
}

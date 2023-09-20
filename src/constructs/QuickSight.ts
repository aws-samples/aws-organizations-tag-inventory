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

import { Aws, RemovalPolicy } from 'aws-cdk-lib';
import { CfnWorkGroup } from 'aws-cdk-lib/aws-athena';
import { CfnManagedPolicy, ManagedPolicy, Role } from 'aws-cdk-lib/aws-iam';
import { CfnAnalysis, CfnDataSet, CfnDataSource } from 'aws-cdk-lib/aws-quicksight';
import { BlockPublicAccess, Bucket, BucketEncryption, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { Central } from './Central';

export interface QuickSightConfig {
  organizationId: string;
  central: Central;
  quickSightUserArns?: string[];
  quickSightGroupArns?: string[];
}

export class QuickSight extends Construct {

  constructor(scope: Construct, id: string, config: QuickSightConfig) {
    super(scope, id);
    if ((config.quickSightUserArns == undefined || config.quickSightUserArns.length == 0)
			&& (config.quickSightGroupArns == undefined || config.quickSightGroupArns.length == 0)) {
      throw new Error('You must specify at least one QuickSight user or group');
    }
    const qsServiceRoleNames = [
      'aws-quicksight-service-role-v0',
    ];

    const tagInventoryBucket: IBucket = config.central.tagInventoryBucket;
    const athenaWorkGroupBucket: IBucket = config.central.athenaWorkGroupBucket;
    const workGroup: CfnWorkGroup = config.central.workGroup;
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
    const qsServiceRole = Role.fromRoleName(this, 'aws-quicksight-service-role-v0', 'aws-quicksight-service-role-v0');
    qsServiceRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AWSQuicksightAthenaAccess'));
    const qsManagedPolicy = new CfnManagedPolicy(this, 'QuickSightPolicy', {
      managedPolicyName: 'QuickSightAthenaS3Policy',
      policyDocument: {
        Statement: [
          {
            Action: ['s3:ListAllMyBuckets'],
            Effect: 'Allow',
            Resource: ['arn:aws:s3:::*'],
          },
          {
            Action: ['s3:ListBucket'],
            Effect: 'Allow',
            Resource: [
              athenaWorkGroupBucket.bucketArn,
              tagInventoryBucket.bucketArn,
              qsBucket.bucketArn,
            ],
          },
          {
            Action: [
              's3:GetBucketLocation',
              's3:GetObject',
              's3:List*',

            ],
            Effect: 'Allow',
            Resource: [
              `arn:aws:s3:::${tagInventoryBucket.bucketName}/*`,
              `arn:aws:s3:::${athenaWorkGroupBucket.bucketName}/tables/*`,
              `arn:aws:s3:::${qsBucket.bucketName}/*`,
            ],
          },
          {
            Action: [
              's3:GetBucketLocation',
              's3:GetObject',
              's3:List*',
              's3:AbortMultipartUpload',
              's3:PutObject',
              's3:CreateBucket',
            ],
            Effect: 'Allow',
            Resource: [
              `arn:aws:s3:::${athenaWorkGroupBucket.bucketName}/*`,
              `arn:aws:s3:::${qsBucket.bucketName}/*`,
            ],
          },
        ],
        Version: '2012-10-17',
      },
      roles: qsServiceRoleNames,
    });
    const principalArns = [...config.quickSightGroupArns ?? [], ...config.quickSightUserArns ?? []];
    const qsDataSourcePermissions: CfnDataSource.ResourcePermissionProperty[] = principalArns.map(arn => {
      return {
        principal: arn,
        actions: [
          'quicksight:DescribeDataSource',
          'quicksight:DescribeDataSourcePermissions',
          'quicksight:PassDataSource',
        ],
      };
    });

    const qsDatasetPermissions: CfnDataSet.ResourcePermissionProperty[] = principalArns.map(arn => {
      return {
        principal: arn,
        actions: [
          'quicksight:DescribeDataSet',
          'quicksight:DescribeDataSetPermissions',
          'quicksight:PassDataSet',
          'quicksight:DescribeIngestion',
          'quicksight:ListIngestions',
        ],
      };
    });


    const dataSource = new CfnDataSource(this, 'TagInventoryDataSource', {
      name: 'tag-inventory-data-source',
      dataSourceId: 'tag-inventory-data-source',
      type: 'ATHENA',
      dataSourceParameters: {
        athenaParameters: {
          workGroup: workGroup.name,
        },
      },
      awsAccountId: Aws.ACCOUNT_ID,
      permissions: qsDataSourcePermissions,
    });
    dataSource.addDependency(qsManagedPolicy);

    new CfnDataSet(this, 'TagInventoryAllDataSet', {
      name: 'tag-inventory-all-data-set',
      dataSetId: 'tag-inventory-all-data-set',
      awsAccountId: Aws.ACCOUNT_ID,
      permissions: qsDatasetPermissions,
      importMode: 'DIRECT_QUERY',
      physicalTableMap: {
        'tag-inventory': {
          relationalTable: {
            dataSourceArn: dataSource.attrArn,
            name: 'tag-inventory',
            catalog: 'AwsDataCatalog',
            schema: config.central.database.ref,
            inputColumns: [
              {
                name: 'd',
                type: 'STRING',
              }, {
                name: 'tagname',
                type: 'STRING',
              }, {
                name: 'tagvalue',
                type: 'STRING',
              }, {
                name: 'owningaccountid',
                type: 'STRING',
              }, {
                name: 'region',
                type: 'STRING',
              }, {
                name: 'service',
                type: 'STRING',
              }, {
                name: 'resourcetype',
                type: 'STRING',
              }, {
                name: 'arn',
                type: 'STRING',
              },
            ],
          },
        },
      },
    });
    const tagInventoryLatestViewDataSet = new CfnDataSet(this, 'TagInventoryLatestDataSet', {
      name: 'tag-inventory-latest-data-set',
      dataSetId: 'tag-inventory-latest-data-set',
      awsAccountId: Aws.ACCOUNT_ID,
      permissions: qsDatasetPermissions,
      importMode: 'DIRECT_QUERY',
      physicalTableMap: {
        'tag-inventory-view-latest': {
          relationalTable: {
            dataSourceArn: dataSource.attrArn,
            name: 'tag-inventory-view-latest',
            catalog: 'AwsDataCatalog',
            schema: config.central.database.ref,
            inputColumns: [
              {
                name: 'd',
                type: 'STRING',
              }, {
                name: 'tagname',
                type: 'STRING',
              }, {
                name: 'tagvalue',
                type: 'STRING',
              }, {
                name: 'owningaccountid',
                type: 'STRING',
              }, {
                name: 'region',
                type: 'STRING',
              }, {
                name: 'service',
                type: 'STRING',
              }, {
                name: 'resourcetype',
                type: 'STRING',
              }, {
                name: 'arn',
                type: 'STRING',
              },
            ],
          },
        },
      },
    });

    const tagInventoryLatestTopTenViewDataSet = new CfnDataSet(this, 'TagInventoryLatestTopTenViewDataSet', {
      name: 'tag-inventory-latest-top-ten-data-set',
      dataSetId: 'tag-inventory-latest-top-ten-data-set',
      awsAccountId: Aws.ACCOUNT_ID,
      permissions: qsDatasetPermissions,
      importMode: 'DIRECT_QUERY',
      physicalTableMap: {
        'tag-inventory-view-latest-top-ten': {
          relationalTable: {
            dataSourceArn: dataSource.attrArn,
            name: 'tag-inventory-view-latest-top-ten',
            catalog: 'AwsDataCatalog',
            schema: config.central.database.ref,
            inputColumns: [
              {
                name: 'tagname',
                type: 'STRING',
              }, {
                name: 'tagvalue',
                type: 'STRING',
              }, {
                name: 'resource_count',
                type: 'INTEGER',
              },
            ],
          },
        },
      },
    });
    const tagInventoryLatestTaggedVsUntagggedViewDataSet = new CfnDataSet(this, 'tagInventoryLatestTaggedVsUntagggedViewDataSet', {
      name: 'tag-inventory-latest-tagged-vs-untagged-data-set',
      dataSetId: 'tag-inventory-latest-tagged-vs-untagged-data-set',
      awsAccountId: Aws.ACCOUNT_ID,
      permissions: qsDatasetPermissions,
      importMode: 'DIRECT_QUERY',
      physicalTableMap: {
        'tag-inventory-view-latest-tagged-vs-untagged': {
          relationalTable: {
            dataSourceArn: dataSource.attrArn,
            name: 'tag-inventory-view-latest-tagged-vs-untagged',
            catalog: 'AwsDataCatalog',
            schema: config.central.database.ref,
            inputColumns: [
              {
                name: 'tagged',
                type: 'INTEGER',
              }, {
                name: 'untagged',
                type: 'INTEGER',
              },
            ],
          },
        },
      },
    });

    new CfnAnalysis(this, 'TagInventoryAnalysis', {
      name: 'Tag Inventory',
      awsAccountId: Aws.ACCOUNT_ID,
      analysisId: 'tag-inventory-analysis',
      permissions: principalArns.map(value => {
        return {
          principal: value,
          actions: [
            'quicksight:RestoreAnalysis',
            'quicksight:UpdateAnalysisPermissions',
            'quicksight:DeleteAnalysis',
            'quicksight:DescribeAnalysisPermissions',
            'quicksight:QueryAnalysis',
            'quicksight:DescribeAnalysis',
            'quicksight:UpdateAnalysis',
          ],

        };
      }),
      definition: {
        dataSetIdentifierDeclarations: [
          {
            identifier: tagInventoryLatestViewDataSet.dataSetId!,
            dataSetArn: tagInventoryLatestViewDataSet.attrArn,
          },
          {
            identifier: tagInventoryLatestTopTenViewDataSet.dataSetId!,
            dataSetArn: tagInventoryLatestTopTenViewDataSet.attrArn,
          },
          {
            identifier: tagInventoryLatestTaggedVsUntagggedViewDataSet.dataSetId!,
            dataSetArn: tagInventoryLatestTaggedVsUntagggedViewDataSet.attrArn,
          },
        ],
        sheets: [
          {
            sheetId: 'tag-inventory-analysis-latest-sheet',
            name: 'Latest',
            filterControls: [
              {
                dropdown: {
                  filterControlId: 'latest-tag-name-filter',
                  title: 'Tag name',
                  sourceFilterId: 'tag-name-filter',
                  displayOptions: {
                    selectAllOptions: {
                      visibility: 'VISIBLE',
                    },
                    titleOptions: {
                      visibility: 'VISIBLE',
                      fontConfiguration: {
                        fontSize: {
                          relative: 'MEDIUM',
                        },
                      },
                    },
                  },
                  type: 'MULTI_SELECT',
                },
              },
            ],
            visuals: [
              {
                pieChartVisual: {
                  visualId: 'distinct-tag-names-by-service',
                  title: {
                    visibility: 'VISIBLE',
                    formatText: {
                      plainText: 'Distinct Tag Names by Service',
                    },
                  },
                  subtitle: {
                    visibility: 'VISIBLE',
                  },
                  chartConfiguration: {
                    fieldWells: {
                      pieChartAggregatedFieldWells: {
                        category: [
                          {
                            categoricalDimensionField: {
                              fieldId: 'service',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'service',
                              },
                            },
                          },
                        ],
                        values: [
                          {
                            categoricalMeasureField: {
                              fieldId: 'tagname',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'tagname',
                              },
                              aggregationFunction: 'DISTINCT_COUNT',
                            },
                          },
                        ],
                      },
                    },
                    sortConfiguration: {},
                    donutOptions: {
                      arcOptions: {
                        arcThickness: 'WHOLE',
                      },
                    },
                  },
                  actions: [],
                  columnHierarchies: [],
                },
              },
              {
                tableVisual: {
                  visualId: 'tag-inventory-view-latest-top-ten',
                  title: {
                    visibility: 'VISIBLE',
                    formatText: {
                      richText: '<visual-title>Top 10 Tag Names and Values</visual-title>',
                    },
                  },
                  subtitle: {
                    visibility: 'VISIBLE',
                    formatText: {
                      richText: '<visual-subtitle>Note that a single distinct resource can have multiple tag name/value combinations applied</visual-subtitle>',
                    },
                  },
                  chartConfiguration: {
                    fieldWells: {
                      tableAggregatedFieldWells: {
                        groupBy: [
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest-top-ten.tagname.1.1693345312669',
                              column: {
                                dataSetIdentifier: tagInventoryLatestTopTenViewDataSet.dataSetId!,
                                columnName: 'tagname',
                              },
                            },
                          },
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest-top-ten.tagvalue.0.1693345288988',
                              column: {
                                dataSetIdentifier: tagInventoryLatestTopTenViewDataSet.dataSetId!,
                                columnName: 'tagvalue',
                              },
                            },
                          },
                        ],
                        values: [
                          {
                            numericalMeasureField: {
                              fieldId: 'tag-inventory-view-latest-top-ten.resource_count.2.1693345358630',
                              column: {
                                dataSetIdentifier: tagInventoryLatestTopTenViewDataSet.dataSetId!,
                                columnName: 'resource_count',
                              },
                              aggregationFunction: {
                                simpleNumericalAggregation: 'SUM',
                              },
                              formatConfiguration: {
                                formatConfiguration: {
                                  numberDisplayFormatConfiguration: {
                                    separatorConfiguration: {
                                      thousandsSeparator: {
                                        visibility: 'HIDDEN',
                                      },
                                    },
                                    decimalPlacesConfiguration: {
                                      decimalPlaces: 0,
                                    },
                                  },
                                },
                              },
                            },
                          },
                        ],
                      },
                    },
                    sortConfiguration: {
                      rowSort: [
                        {
                          fieldSort: {
                            fieldId: 'tag-inventory-view-latest-top-ten.resource_count.2.1693345358630',
                            direction: 'DESC',
                          },
                        },
                      ],
                    },
                    tableOptions: {
                      headerStyle: {
                        textWrap: 'WRAP',
                        height: 25,
                      },
                      rowAlternateColorOptions: {
                        status: 'DISABLED',
                      },
                    },
                    totalOptions: {
                      totalsVisibility: 'HIDDEN',
                      placement: 'END',
                    },
                    fieldOptions: {
                      selectedFieldOptions: [
                        {
                          fieldId: 'tag-inventory-view-latest-top-ten.tagname.1.1693345312669',
                          width: '188px',
                          customLabel: 'Tag Name',
                        },
                        {
                          fieldId: 'tag-inventory-view-latest-top-ten.tagvalue.0.1693345288988',
                          width: '261px',
                          customLabel: 'Tag Value',
                        },
                        {
                          fieldId: 'tag-inventory-view-latest-top-ten.resource_count.2.1693345358630',
                          width: '130px',
                          customLabel: 'Resources',
                        },
                      ],
                      order: [
                        'tag-inventory-view-latest-top-ten.resource_count.2.1693345358630',
                        'tag-inventory-view-latest-top-ten.tagname.1.1693345312669',
                        'tag-inventory-view-latest-top-ten.tagvalue.0.1693345288988',
                      ],
                    },
                  },
                  actions: [],
                },
              },
              {
                kpiVisual: {
                  visualId: 'kpi-distinct-tag-names',
                  title: {
                    visibility: 'VISIBLE',
                  },
                  subtitle: {
                    visibility: 'VISIBLE',
                  },
                  chartConfiguration: {
                    fieldWells: {
                      values: [
                        {
                          numericalMeasureField: {
                            fieldId: '4d414709-4ce8-4538-a591-4a25473665f3.0.1693410402613',
                            column: {
                              dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                              columnName: 'Distinct Tag Names',
                            },
                          },
                        },
                      ],
                      targetValues: [],
                      trendGroups: [],
                    },
                    sortConfiguration: {},
                    kpiOptions: {
                      primaryValueFontConfiguration: {
                        fontSize: {
                          relative: 'MEDIUM',
                        },
                      },
                    },
                  },
                  actions: [],
                  columnHierarchies: [],
                },
              },
              {
                kpiVisual: {
                  visualId: 'kpi-distinct-arns',
                  title: {
                    visibility: 'VISIBLE',
                  },
                  subtitle: {
                    visibility: 'VISIBLE',
                  },
                  chartConfiguration: {
                    fieldWells: {
                      values: [
                        {
                          numericalMeasureField: {
                            fieldId: '9b215e51-b204-4cfb-b312-3683a34f5aab.0.1693410613538',
                            column: {
                              dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                              columnName: 'Distinct Arns',
                            },
                          },
                        },
                      ],
                      targetValues: [],
                      trendGroups: [],
                    },
                    sortConfiguration: {},
                    kpiOptions: {
                      primaryValueFontConfiguration: {
                        fontSize: {
                          relative: 'MEDIUM',
                        },
                      },
                    },
                  },
                  actions: [],
                  columnHierarchies: [],
                },
              },
              {
                gaugeChartVisual: {
                  visualId: '312edc0a-7458-44cb-af2c-04a07a3f7113',
                  title: {
                    visibility: 'VISIBLE',
                    formatText: {
                      richText: '<visual-title>Tagged Resource Percentage</visual-title>',
                    },
                  },
                  subtitle: {
                    visibility: 'VISIBLE',
                  },
                  chartConfiguration: {
                    fieldWells: {
                      values: [
                        {
                          numericalMeasureField: {
                            fieldId: 'tag-inventory-view-latest-tagged-vs-untagged.tagged.1.1693423160921',
                            column: {
                              dataSetIdentifier: tagInventoryLatestTaggedVsUntagggedViewDataSet.dataSetId!,
                              columnName: 'tagged',
                            },
                            aggregationFunction: {
                              simpleNumericalAggregation: 'SUM',
                            },
                          },
                        },
                      ],
                      targetValues: [
                        {
                          numericalMeasureField: {
                            fieldId: 'f95d6f1d-59fd-4db9-b6b4-fb3d0d23d115.1.1693423151027',
                            column: {
                              dataSetIdentifier: tagInventoryLatestTaggedVsUntagggedViewDataSet.dataSetId!,
                              columnName: 'Total',
                            },
                            aggregationFunction: {
                              simpleNumericalAggregation: 'SUM',
                            },
                          },
                        },
                      ],
                    },
                    gaugeChartOptions: {
                      comparison: {
                        comparisonMethod: 'PERCENT',
                      },
                      arc: {
                        arcAngle: 180.0,
                      },
                      primaryValueFontConfiguration: {
                        fontSize: {
                          relative: 'SMALL',
                        },
                      },
                    },
                    dataLabels: {
                      visibility: 'VISIBLE',
                      overlap: 'DISABLE_OVERLAP',
                    },
                  },
                  conditionalFormatting: {
                    conditionalFormattingOptions: [
                      {
                        arc: {
                          foregroundColor: {
                            solid: {
                              expression: 'SUM({tagged})/nullIf(SUM({Total}),0) >= 75.0',
                              color: '#F7E65A',
                            },
                          },
                        },
                      },
                      {
                        arc: {
                          foregroundColor: {
                            solid: {
                              expression: 'SUM({tagged})/nullIf(SUM({Total}),0) >= 50.0',
                              color: '#F7E65A',
                            },
                          },
                        },
                      },
                      {
                        arc: {
                          foregroundColor: {
                            solid: {
                              expression: 'SUM({tagged})/nullIf(SUM({Total}),0) < 50.0',
                              color: '#DE3B00',
                            },
                          },
                        },
                      },
                      {
                        arc: {
                          foregroundColor: {
                            solid: {
                              expression: 'SUM({tagged})/nullIf(SUM({Total}),0) > 75.0',
                              color: '#2CAD00',
                            },
                          },
                        },
                      },
                    ],
                  },
                  actions: [],
                },
              },
              {
                barChartVisual: {
                  visualId: 'b99df76e-f4b8-4c2d-8fa8-3dc5978925d3',
                  title: {
                    visibility: 'VISIBLE',
                    formatText: {
                      richText: '<visual-title>Tags to Accounts</visual-title>',
                    },
                  },
                  subtitle: {
                    visibility: 'VISIBLE',
                  },
                  chartConfiguration: {
                    fieldWells: {
                      barChartAggregatedFieldWells: {
                        category: [
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest.owningaccountid.1.1693423830345',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'owningaccountid',
                              },
                            },
                          },
                        ],
                        values: [
                          {
                            categoricalMeasureField: {
                              fieldId: 'tag-inventory-view-latest.tagname.1.1693423817108',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'tagname',
                              },
                              aggregationFunction: 'COUNT',
                            },
                          },
                        ],
                        colors: [
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest.tagname.2.1693423883905',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'tagname',
                              },
                            },
                          },
                        ],
                      },
                    },
                    sortConfiguration: {
                      categorySort: [
                        {
                          fieldSort: {
                            fieldId: 'tag-inventory-view-latest.tagname.1.1693423817108',
                            direction: 'DESC',
                          },
                        },
                      ],
                      categoryItemsLimit: {
                        otherCategories: 'INCLUDE',
                      },
                      colorItemsLimit: {
                        otherCategories: 'INCLUDE',
                      },
                      smallMultiplesLimitConfiguration: {
                        otherCategories: 'INCLUDE',
                      },
                    },
                    orientation: 'HORIZONTAL',
                    barsArrangement: 'STACKED',
                    categoryAxis: {
                      scrollbarOptions: {
                        visibleRange: {
                          percentRange: {
                            from: 54.545454545454604,
                            to: 100.0,
                          },
                        },
                      },
                    },
                    categoryLabelOptions: {
                      axisLabelOptions: [
                        {
                          customLabel: 'Account #',
                          applyTo: {
                            fieldId: 'tag-inventory-view-latest.owningaccountid.1.1693423830345',
                            column: {
                              dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                              columnName: 'owningaccountid',
                            },
                          },
                        },
                      ],
                    },
                    valueLabelOptions: {
                      axisLabelOptions: [
                        {
                          customLabel: 'Number of tags',
                          applyTo: {
                            fieldId: 'tag-inventory-view-latest.tagname.1.1693423817108',
                            column: {
                              dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                              columnName: 'tagname',
                            },
                          },
                        },
                      ],
                    },
                    legend: {
                      title: {
                        customLabel: 'Tag name',
                      },
                      width: '227px',
                    },
                    dataLabels: {
                      visibility: 'HIDDEN',
                      overlap: 'DISABLE_OVERLAP',
                    },
                    tooltip: {
                      tooltipVisibility: 'VISIBLE',
                      selectedTooltipType: 'BASIC',
                      fieldBasedTooltip: {
                        aggregationVisibility: 'HIDDEN',
                        tooltipTitleType: 'PRIMARY_VALUE',
                        tooltipFields: [
                          {
                            fieldTooltipItem: {
                              fieldId: 'tag-inventory-view-latest.owningaccountid.1.1693423830345',
                              visibility: 'VISIBLE',
                            },
                          },
                          {
                            fieldTooltipItem: {
                              fieldId: 'tag-inventory-view-latest.tagname.2.1693423883905',
                              visibility: 'VISIBLE',
                            },
                          },
                          {
                            fieldTooltipItem: {
                              fieldId: 'tag-inventory-view-latest.tagname.2.1693423883905',
                              visibility: 'VISIBLE',
                            },
                          },
                        ],
                      },
                    },
                  },
                  actions: [],
                  columnHierarchies: [],
                },
              },
              {
                tableVisual: {
                  visualId: 'aa36eaf4-6c95-46a6-b914-4ccbfd036eff',
                  title: {
                    visibility: 'VISIBLE',
                    formatText: {
                      richText: '<visual-title>Tag Inventory</visual-title>',
                    },
                  },
                  subtitle: {
                    visibility: 'VISIBLE',
                  },
                  chartConfiguration: {
                    fieldWells: {
                      tableAggregatedFieldWells: {
                        groupBy: [
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest.tagname.0.1693424974533',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'tagname',
                              },
                            },
                          },
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest.tagvalue.1.1693424991141',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'tagvalue',
                              },
                            },
                          },
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest.owningaccountid.2.1693425018483',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'owningaccountid',
                              },
                            },
                          },
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest.region.3.1693425061317',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'region',
                              },
                            },
                          },
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest.service.4.1693425114160',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'service',
                              },
                            },
                          },
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest.resourcetype.5.1693425118981',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'resourcetype',
                              },
                            },
                          },
                          {
                            categoricalDimensionField: {
                              fieldId: 'tag-inventory-view-latest.arn.6.1693425128501',
                              column: {
                                dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                                columnName: 'arn',
                              },
                            },
                          },
                        ],
                        values: [],
                      },
                    },
                    sortConfiguration: {
                      paginationConfiguration: {
                        pageSize: 100,
                        pageNumber: 1,
                      },
                    },
                    tableOptions: {
                      headerStyle: {
                        textWrap: 'WRAP',
                        height: 25,
                      },
                      rowAlternateColorOptions: {
                        status: 'DISABLED',
                      },
                    },
                    fieldOptions: {
                      selectedFieldOptions: [
                        {
                          fieldId: 'tag-inventory-view-latest.tagname.0.1693424974533',
                          width: '198px',
                          customLabel: 'Tag Name',
                        },
                        {
                          fieldId: 'tag-inventory-view-latest.tagvalue.1.1693424991141',
                          width: '244px',
                          customLabel: 'Tag Value',
                        },
                        {
                          fieldId: 'tag-inventory-view-latest.owningaccountid.2.1693425018483',
                          customLabel: 'Account #',
                        },
                        {
                          fieldId: 'tag-inventory-view-latest.region.3.1693425061317',
                          customLabel: 'Region',
                        },
                        {
                          fieldId: 'tag-inventory-view-latest.service.4.1693425114160',
                          customLabel: 'Service',
                        },
                        {
                          fieldId: 'tag-inventory-view-latest.resourcetype.5.1693425118981',
                          customLabel: 'Resource Type',
                        },
                        {
                          fieldId: 'tag-inventory-view-latest.arn.6.1693425128501',
                          customLabel: 'Resource ARN',
                        },
                      ],
                      order: [],
                    },
                  },
                  actions: [],
                },
              },
            ],
            layouts: [
              {
                configuration: {
                  gridLayout: {
                    elements: [
                      {
                        elementId: 'kpi-distinct-tag-names',
                        elementType: 'VISUAL',
                        columnIndex: 0,
                        columnSpan: 12,
                        rowIndex: 0,
                        rowSpan: 6,
                      },
                      {
                        elementId: '312edc0a-7458-44cb-af2c-04a07a3f7113',
                        elementType: 'VISUAL',
                        columnIndex: 12,
                        columnSpan: 12,
                        rowIndex: 0,
                        rowSpan: 6,
                      },
                      {
                        elementId: 'kpi-distinct-arns',
                        elementType: 'VISUAL',
                        columnIndex: 24,
                        columnSpan: 12,
                        rowIndex: 0,
                        rowSpan: 6,
                      },
                      {
                        elementId: 'tag-inventory-view-latest-top-ten',
                        elementType: 'VISUAL',
                        columnIndex: 0,
                        columnSpan: 18,
                        rowIndex: 6,
                        rowSpan: 12,
                      },
                      {
                        elementId: 'distinct-tag-names-by-service',
                        elementType: 'VISUAL',
                        columnIndex: 18,
                        columnSpan: 18,
                        rowIndex: 6,
                        rowSpan: 12,
                      },
                      {
                        elementId: 'b99df76e-f4b8-4c2d-8fa8-3dc5978925d3',
                        elementType: 'VISUAL',
                        columnIndex: 0,
                        columnSpan: 36,
                        rowIndex: 18,
                        rowSpan: 14,
                      },
                      {
                        elementId: 'aa36eaf4-6c95-46a6-b914-4ccbfd036eff',
                        elementType: 'VISUAL',
                        columnIndex: 0,
                        columnSpan: 36,
                        rowIndex: 32,
                        rowSpan: 21,
                      },
                    ],
                  },
                },
              },
            ],
            sheetControlLayouts: [
              {
                configuration: {
                  gridLayout: {
                    elements: [
                      {
                        elementId: 'latest-tag-name-filter',
                        elementType: 'FILTER_CONTROL',
                        columnSpan: 2,
                        rowSpan: 1,
                      },
                    ],
                  },
                },
              },
            ],
            contentType: 'INTERACTIVE',
          },
        ],
        calculatedFields: [
          {
            dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
            name: 'Distinct Arns',
            expression: 'distinct_count(arn)',
          },
          {
            dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
            name: 'Distinct Tag Names',
            expression: 'distinct_count(tagname)-1',
          },
          {
            dataSetIdentifier: tagInventoryLatestTaggedVsUntagggedViewDataSet.dataSetId!,
            name: 'Total',
            expression: 'tagged+untagged',
          },
        ],
        parameterDeclarations: [],
        filterGroups: [
          {
            filterGroupId: 'tag-name-filter-group',
            filters: [
              {
                categoryFilter: {
                  filterId: 'tag-name-filter',
                  column: {
                    dataSetIdentifier: tagInventoryLatestViewDataSet.dataSetId!,
                    columnName: 'tagname',
                  },
                  configuration: {
                    filterListConfiguration: {
                      matchOperator: 'CONTAINS',
                      selectAllOptions: 'FILTER_ALL_VALUES',
                    },
                  },
                },
              },
            ],
            scopeConfiguration: {
              selectedSheets: {
                sheetVisualScopingConfigurations: [
                  {
                    sheetId: 'tag-inventory-analysis-latest-sheet',
                    scope: 'SELECTED_VISUALS',
                    visualIds: [
                      'distinct-tag-names-by-service',
                    ],
                  },
                ],
              },
            },
            status: 'ENABLED',
            crossDataset: 'SINGLE_DATASET',
          },
        ],
      },


    });

  }

}

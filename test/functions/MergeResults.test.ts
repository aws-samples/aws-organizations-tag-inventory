import {onEvent} from "../../src/functions/MergeResults";

test("Test merge results", async () => {
	const event = {
		"ViewArn": "arn:aws:resource-explorer-2:us-east-2:562200247894:view/tag-inventory-all-resources/838d869f-f4dc-4c90-8edb-47c860b072b6",
		"Count": {
			"Complete": true,
			"TotalResources": 545
		},
		"NextToken": "AQICAHg3K9Lgkv25I7wJsURdLqVDtSKuwH-051JSdAF5tFxyRAF_jTPqY_Nh4z7yd8iGLEZDAAAAuzCBuAYJKoZIhvcNAQcGoIGqMIGnAgEAMIGhBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDPYFile7MQQcmVjUmQIBEIB07frA7uFRcvSG31orDbRQz4xfJn5yl1lyI1zCpRtOEtiuqk6FMB77_AE0zyGGQaLzr_QL2YpSYp97q5r8r-oEnkeT7G4BF8OOFMCGWCyUmZSvfNZ1Zo-hkFKKS8ofxGvABG5ixey9jmNpiVYxs7sT_yFf-UA=",
		"Resources": [
			{
				"Arn": "arn:aws:iam::562200247894:role/cdk-hnb659fds-lookup-role-562200247894-us-east-2",
				"LastReportedAt": "2023-06-14T04:14:59.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [],
				"Region": "global",
				"ResourceType": "iam:role",
				"Service": "iam"
			},
			{
				"Arn": "arn:aws:lambda:us-east-2:562200247894:function:aws-appconfig-stack-awsappconfigtest88FE2BA1-JFoddxUh8kGX",
				"LastReportedAt": "2023-06-12T16:52:53.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [
					{
						"Data": [
							{
								"Key": "aws:cloudformation:stack-name",
								"Value": "aws-appconfig-stack"
							},
							{
								"Key": "aws:cloudformation:stack-id",
								"Value": "arn:aws:cloudformation:us-east-2:562200247894:stack/aws-appconfig-stack/e9fe1ef0-efd5-11eb-8f24-064655ceed0e"
							},
							{
								"Key": "aws:cloudformation:logical-id",
								"Value": "awsappconfigtest88FE2BA1"
							}
						],
						"LastReportedAt": "2022-10-07T07:06:58.000Z",
						"Name": "tags"
					}
				],
				"Region": "us-east-2",
				"ResourceType": "lambda:function",
				"Service": "lambda"
			},
			{
				"Arn": "arn:aws:iam::562200247894:role/ApplicationCostProfilerapilamb-LambdaExecutionRole-1A7X70DDG4TTO",
				"LastReportedAt": "2023-06-14T04:14:59.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [],
				"Region": "global",
				"ResourceType": "iam:role",
				"Service": "iam"
			},
			{
				"Arn": "arn:aws:iam::562200247894:role/aws-service-role/license-management.marketplace.amazonaws.com/AWSServiceRoleForMarketplaceLicenseManagement",
				"LastReportedAt": "2023-06-14T04:14:59.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [],
				"Region": "global",
				"ResourceType": "iam:role",
				"Service": "iam"
			},
			{
				"Arn": "arn:aws:ec2:us-east-2:562200247894:key-pair/awsgalen-ct-dev-002-us-east-2",
				"LastReportedAt": "2023-06-12T11:27:01.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [],
				"Region": "us-east-2",
				"ResourceType": "ec2:key-pair",
				"Service": "ec2"
			},
			{
				"Arn": "arn:aws:ssm:us-west-2:562200247894:patchbaseline/pb-01122360d00a0a428",
				"LastReportedAt": "2023-06-12T07:31:45.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [
					{
						"Data": [
							{
								"Key": "AWS_Solutions",
								"Value": "CustomControlTowerStackSet"
							},
							{
								"Key": "aws:cloudformation:stack-name",
								"Value": "StackSet-CustomControlTower-pvre-12fcb340-cdb6-4c9c-91b4-f69e8e02d2e5"
							},
							{
								"Key": "aws:cloudformation:stack-id",
								"Value": "arn:aws:cloudformation:us-west-2:562200247894:stack/StackSet-CustomControlTower-pvre-12fcb340-cdb6-4c9c-91b4-f69e8e02d2e5/59cbdd80-9333-11eb-ac27-02a6cd2b3a09"
							},
							{
								"Key": "aws:cloudformation:logical-id",
								"Value": "PVRECentosPatchBaseline"
							}
						],
						"LastReportedAt": "2022-09-21T14:50:53.000Z",
						"Name": "tags"
					}
				],
				"Region": "us-west-2",
				"ResourceType": "ssm:patchbaseline",
				"Service": "ssm"
			},
			{
				"Arn": "arn:aws:logs:us-east-2:562200247894:log-group:/aws-glue/jobs/error",
				"LastReportedAt": "2023-06-12T22:14:45.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [],
				"Region": "us-east-2",
				"ResourceType": "logs:log-group",
				"Service": "logs"
			},
			{
				"Arn": "arn:aws:elasticache:us-east-2:562200247894:parametergroup:default.redis4.0.cluster.on",
				"LastReportedAt": "2023-06-13T16:37:46.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [],
				"Region": "us-east-2",
				"ResourceType": "elasticache:parametergroup",
				"Service": "elasticache"
			},
			{
				"Arn": "arn:aws:s3:::recruit-access-log-bucket-562200247894-us-east-2-master",
				"LastReportedAt": "2023-06-15T23:20:51.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [
					{
						"Data": [
							{
								"Key": "Stack",
								"Value": "Stateful"
							},
							{
								"Key": "aws:cloudformation:stack-name",
								"Value": "frontline-poc-master-stack-statefulNestedStackstatefulNestedStackResourceB025EA26-1SP7BZ3F67SEH"
							},
							{
								"Key": "aws:cloudformation:stack-id",
								"Value": "arn:aws:cloudformation:us-east-2:562200247894:stack/frontline-poc-master-stack-statefulNestedStackstatefulNestedStackResourceB025EA26-1SP7BZ3F67SEH/d4dab960-43d2-11ec-8288-0aec67c173cc"
							},
							{
								"Key": "aws:cloudformation:logical-id",
								"Value": "recruitstoragerecruitaccesslogbucket58C8B2C3"
							}
						],
						"LastReportedAt": "2022-10-07T07:18:06.000Z",
						"Name": "tags"
					}
				],
				"Region": "global",
				"ResourceType": "s3:bucket",
				"Service": "s3"
			},
			{
				"Arn": "arn:aws:s3:::cf-templates-yjivm7gl9cky-us-west-2",
				"LastReportedAt": "2023-06-12T19:37:45.000Z",
				"OwningAccountId": "562200247894",
				"Properties": [],
				"Region": "global",
				"ResourceType": "s3:bucket",
				"Service": "s3"
			}
		],
		"Results": {
			"flatten": [
				{
					"NoTag": {
						"NoValue": [
							{
								"OwningAccountId": "562200247894",
								"Region": "global",
								"Service": "iam",
								"ResourceType": "iam:role",
								"Arn": "arn:aws:iam::562200247894:role/cdk-hnb659fds-lookup-role-562200247894-us-east-2"
							}
						]
					}
				},
				{
					"aws:cloudformation:stack-name": {
						"aws-appconfig-stack": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-east-2",
								"Service": "lambda",
								"ResourceType": "lambda:function",
								"Arn": "arn:aws:lambda:us-east-2:562200247894:function:aws-appconfig-stack-awsappconfigtest88FE2BA1-JFoddxUh8kGX"
							}
						]
					}
				},
				{
					"aws:cloudformation:stack-id": {
						"arn:aws:cloudformation:us-east-2:562200247894:stack/aws-appconfig-stack/e9fe1ef0-efd5-11eb-8f24-064655ceed0e": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-east-2",
								"Service": "lambda",
								"ResourceType": "lambda:function",
								"Arn": "arn:aws:lambda:us-east-2:562200247894:function:aws-appconfig-stack-awsappconfigtest88FE2BA1-JFoddxUh8kGX"
							}
						]
					}
				},
				{
					"aws:cloudformation:logical-id": {
						"awsappconfigtest88FE2BA1": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-east-2",
								"Service": "lambda",
								"ResourceType": "lambda:function",
								"Arn": "arn:aws:lambda:us-east-2:562200247894:function:aws-appconfig-stack-awsappconfigtest88FE2BA1-JFoddxUh8kGX"
							}
						]
					}
				},
				{
					"NoTag": {
						"NoValue": [
							{
								"OwningAccountId": "562200247894",
								"Region": "global",
								"Service": "iam",
								"ResourceType": "iam:role",
								"Arn": "arn:aws:iam::562200247894:role/ApplicationCostProfilerapilamb-LambdaExecutionRole-1A7X70DDG4TTO"
							}
						]
					}
				},
				{
					"NoTag": {
						"NoValue": [
							{
								"OwningAccountId": "562200247894",
								"Region": "global",
								"Service": "iam",
								"ResourceType": "iam:role",
								"Arn": "arn:aws:iam::562200247894:role/aws-service-role/license-management.marketplace.amazonaws.com/AWSServiceRoleForMarketplaceLicenseManagement"
							}
						]
					}
				},
				{
					"NoTag": {
						"NoValue": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-east-2",
								"Service": "ec2",
								"ResourceType": "ec2:key-pair",
								"Arn": "arn:aws:ec2:us-east-2:562200247894:key-pair/awsgalen-ct-dev-002-us-east-2"
							}
						]
					}
				},
				{
					"AWS_Solutions": {
						"CustomControlTowerStackSet": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-west-2",
								"Service": "ssm",
								"ResourceType": "ssm:patchbaseline",
								"Arn": "arn:aws:ssm:us-west-2:562200247894:patchbaseline/pb-01122360d00a0a428"
							}
						]
					}
				},
				{
					"aws:cloudformation:stack-name": {
						"StackSet-CustomControlTower-pvre-12fcb340-cdb6-4c9c-91b4-f69e8e02d2e5": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-west-2",
								"Service": "ssm",
								"ResourceType": "ssm:patchbaseline",
								"Arn": "arn:aws:ssm:us-west-2:562200247894:patchbaseline/pb-01122360d00a0a428"
							}
						]
					}
				},
				{
					"aws:cloudformation:stack-id": {
						"arn:aws:cloudformation:us-west-2:562200247894:stack/StackSet-CustomControlTower-pvre-12fcb340-cdb6-4c9c-91b4-f69e8e02d2e5/59cbdd80-9333-11eb-ac27-02a6cd2b3a09": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-west-2",
								"Service": "ssm",
								"ResourceType": "ssm:patchbaseline",
								"Arn": "arn:aws:ssm:us-west-2:562200247894:patchbaseline/pb-01122360d00a0a428"
							}
						]
					}
				},
				{
					"aws:cloudformation:logical-id": {
						"PVRECentosPatchBaseline": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-west-2",
								"Service": "ssm",
								"ResourceType": "ssm:patchbaseline",
								"Arn": "arn:aws:ssm:us-west-2:562200247894:patchbaseline/pb-01122360d00a0a428"
							}
						]
					}
				},
				{
					"NoTag": {
						"NoValue": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-east-2",
								"Service": "logs",
								"ResourceType": "logs:log-group",
								"Arn": "arn:aws:logs:us-east-2:562200247894:log-group:/aws-glue/jobs/error"
							}
						]
					}
				},
				{
					"NoTag": {
						"NoValue": [
							{
								"OwningAccountId": "562200247894",
								"Region": "us-east-2",
								"Service": "elasticache",
								"ResourceType": "elasticache:parametergroup",
								"Arn": "arn:aws:elasticache:us-east-2:562200247894:parametergroup:default.redis4.0.cluster.on"
							}
						]
					}
				},
				{
					"Stack": {
						"Stateful": [
							{
								"OwningAccountId": "562200247894",
								"Region": "global",
								"Service": "s3",
								"ResourceType": "s3:bucket",
								"Arn": "arn:aws:s3:::recruit-access-log-bucket-562200247894-us-east-2-master"
							}
						]
					}
				},
				{
					"aws:cloudformation:stack-name": {
						"frontline-poc-master-stack-statefulNestedStackstatefulNestedStackResourceB025EA26-1SP7BZ3F67SEH": [
							{
								"OwningAccountId": "562200247894",
								"Region": "global",
								"Service": "s3",
								"ResourceType": "s3:bucket",
								"Arn": "arn:aws:s3:::recruit-access-log-bucket-562200247894-us-east-2-master"
							}
						]
					}
				},
				{
					"aws:cloudformation:stack-id": {
						"arn:aws:cloudformation:us-east-2:562200247894:stack/frontline-poc-master-stack-statefulNestedStackstatefulNestedStackResourceB025EA26-1SP7BZ3F67SEH/d4dab960-43d2-11ec-8288-0aec67c173cc": [
							{
								"OwningAccountId": "562200247894",
								"Region": "global",
								"Service": "s3",
								"ResourceType": "s3:bucket",
								"Arn": "arn:aws:s3:::recruit-access-log-bucket-562200247894-us-east-2-master"
							}
						]
					}
				},
				{
					"aws:cloudformation:logical-id": {
						"recruitstoragerecruitaccesslogbucket58C8B2C3": [
							{
								"OwningAccountId": "562200247894",
								"Region": "global",
								"Service": "s3",
								"ResourceType": "s3:bucket",
								"Arn": "arn:aws:s3:::recruit-access-log-bucket-562200247894-us-east-2-master"
							}
						]
					}
				},
				{
					"NoTag": {
						"NoValue": [
							{
								"OwningAccountId": "562200247894",
								"Region": "global",
								"Service": "s3",
								"ResourceType": "s3:bucket",
								"Arn": "arn:aws:s3:::cf-templates-yjivm7gl9cky-us-west-2"
							}
						]
					}
				}
			]
		}
	}
	await onEvent(event,{},undefined)
})
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
import { CfnParameter, Stack, StackProps, Tags } from "aws-cdk-lib";

import { RegionInfo } from "aws-cdk-lib/region-info";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { ScheduleExpression } from "../constructs/ScheduleExpression";
import { Spoke } from "../constructs/Spoke";

export interface SpokeStackProps extends StackProps {
  enabledRegions?: string;
  aggregatorRegion?: string;
  bucketName?: string;
  topicArn?: string;
  centralRoleArn?: string;
  organizationPayerAccountId?: string;
  schedule?: string;
  queryString?: string;
}

export class SpokeStack extends Stack {
  constructor(scope: Construct, id: string, props: SpokeStackProps) {
    super(scope, id, props);
    const bucketNameParameter = new CfnParameter(this, "BucketNameParameter", {
      default: props.bucketName,
      type: "String",
      description:
        "Name of the central account bucket where tag inventory data is stored",
    });
    const centralRoleArnParameter = new CfnParameter(
      this,
      "CentralRoleArnParameter",
      {
        default: props.centralRoleArn,
        type: "String",
        description:
          "ARN of the central account's cross account role with permissions to write to the centralized bucket where tag inventory data is stored",
      },
    );
    const centralTopicArnParameter = new CfnParameter(
      this,
      "TopicArnParameter",
      {
        default: props.topicArn,
        type: "String",
        description: "ARN of the central account's notification topic",
      },
    );
    const enabledRegionsParameter = new CfnParameter(
      this,
      "EnabledRegionsParameter",
      {
        default: props.enabledRegions,
        type: "CommaDelimitedList",
        description: "Regions to enable Resource Explorer Indexing",
      },
    );
    const aggregatorRegionParameter = new CfnParameter(
      this,
      "AggregatorRegionParameter",
      {
        allowedValues: RegionInfo.regions.map((value) => {
          return value.name;
        }),
        default: props.aggregatorRegion,
        type: "String",
        description:
          "The region that contains teh Resource Explorer aggregator",
      },
    );
    const organizationPayerAccountIdParameter = new CfnParameter(
      this,
      "OrganizationPayerAccountIdParameter",
      {
        default: props.organizationPayerAccountId,
        type: "String",
        description: "The id of the AWS organization payer account",
      },
    );
    const scheduleParameter = new CfnParameter(this, "ScheduleParameter", {
      default: props.schedule,
      type: "String",
      allowedValues: [
        ScheduleExpression.DAILY,
        ScheduleExpression.WEEKLY,
        ScheduleExpression.MONTHLY,
      ],
      description: "The frequency jobs are run",
    });
    const queryStringParameter = new CfnParameter(
      this,
      "QueryStringParameter",
      {
        default: props.queryString ?? "",
        type: "String",
        description:
          "Query string for Resource Explorer to run. See https://docs.aws.amazon.com/resource-explorer/latest/userguide/using-search-query-syntax.html",
      },
    );
    new Spoke(this, "spoke", {
      bucketName: bucketNameParameter.valueAsString,
      aggregatorRegion: aggregatorRegionParameter.valueAsString,
      centralRoleArn: centralRoleArnParameter.valueAsString,
      enabledRegions: enabledRegionsParameter.valueAsList.join(","),
      organizationPayerAccountId:
        organizationPayerAccountIdParameter.valueAsString,
      topicArn: centralTopicArnParameter.valueAsString,
      // @ts-ignore
      schedule: scheduleParameter.valueAsString,
      queryString: queryStringParameter.valueAsString,
    });
    this.cdkNagSuppressions();
    Tags.of(this).add("Solution", "aws-organizations-tag-inventory");
    Tags.of(this).add(
      "Url",
      "https://github.com/aws-samples/aws-organizations-tag-inventory",
    );
  }

  private cdkNagSuppressions() {
    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-IAM4",
        reason: "AWS managed policies acceptable for sample",
      },
      {
        id: "AwsSolutions-IAM5",
        reason: "Wildcard permissions have been scoped down",
      },
      {
        id: "AwsSolutions-L1",
        reason: "Manually managing versions",
      },
    ]);
  }
}

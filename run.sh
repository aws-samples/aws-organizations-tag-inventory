#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of this
# software and associated documentation files (the "Software"), to deal in the Software
# without restriction, including without limitation the rights to use, copy, modify,
# merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
# permit persons to whom the Software is furnished to do so.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
# PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
# HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
# OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
# SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
#

#!/bin/bash

#write a bash script that prompts whether to deploy the central stack or the spoke stack
#if the user selects the central stack, then prompt for organization id
#if the user selects the spoke stack, then prompt bucketName, centralRoleArn, enabledRegions, and aggregatorRegion
#if the user selects neither, then print help message
export JSII_SILENCE_WARNING_DEPRECATED_NODE_VERSION=1
export NODE_NO_WARNINGS=1
current_account=`aws sts get-caller-identity | jq -r '.Account'`
current_region=$AWS_DEFAULT_REGION

prerequisites() {
  if [ -z "$current_region" ]; then
     read -p "Enter your deployment region: " current_region
  fi
  (cd ../ && cdk bootstrap aws://$current_account/$current_region)
  npm install;
  npm run build;
}

deploy(){

  if [ "$1" == "central" ]; then
      if [ -z "$2" ]; then
          echo "Please provide an organization id"
          exit 1
      else
        prerequisites
        echo "Deploying Central Stack"
        echo "npm run deploy -- -c stack=$1 -c organizationId=$2"
        npm run deploy -- -c stack=central -c organizationId=$2
        exit 0;
      fi
  elif [ "$1" == "spoke" ]; then
      if [ -z "$2" ]; then
          echo "Please provide a bucketName"
          exit 1
      elif [ -z "$3" ]; then
          echo "Please provide a centralRoleArn"
          exit 1
      elif [ -z "$4" ]; then
          echo "Please provide enabledRegions"
          exit 1
      elif [ -z "$5" ]; then
          echo "Please provide aggregatorRegion"
          exit 1
      else
        prerequisites
        echo "Deploying Spoke Stack"
        echo "npm run deploy -- -c stack=$1 -c bucketName=$2 -c centralRoleArn=$3 -c enabledRegions=$4 -c aggregatorRegion=$5"
        npm run deploy -- -c stack=spoke -c bucketName=$2 -c centralRoleArn=$3 -c enabledRegions=$4 -c aggregatorRegion=$5
        exit 0;
      fi
  else
      echo "Please select either central or spoke"
      select stack in central spoke; do
          if [ "$stack" == "central" ]; then
            organizationId=`aws organizations describe-organization | jq -r .Organization.Id`
            if [ -z "$organizationId" ]; then
              read -p "Enter your organization id: " organizationId
            fi
            echo "Using organization id $organizationId"
            deploy $stack $organizationId
            break
          elif [ "$stack" == "spoke" ]; then
            read -p "Enter the central stack bucket name: " bucketName
            read -p "Enter the central role arn: " centralRoleArn
            read -p "Enter the enabled regions: " enabledRegions
            read -p "Enter the aggregator region: " aggregatorRegion
            deploy $stack $bucketName $centralRoleArn "$enabledRegions" $aggregatorRegion
            break
          fi
      done
  fi

}

deploy $1 $2 $3 $4 $5
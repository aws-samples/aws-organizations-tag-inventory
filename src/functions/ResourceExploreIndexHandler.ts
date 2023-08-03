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

import {
  AssociateDefaultViewCommand,

  CreateIndexCommand, CreateViewCommand, GetDefaultViewCommand, GetIndexCommand, GetViewCommand, paginateListViews,
  ResourceExplorer2Client, UpdateIndexTypeCommand,
} from '@aws-sdk/client-resource-explorer-2';
import {
  CloudFormationCustomResourceEvent, CloudFormationCustomResourceFailedResponse,
  CloudFormationCustomResourceResponse,
  CloudFormationCustomResourceSuccessResponse,
} from 'aws-lambda';
import { v4 } from 'uuid';


export const onEvent = async (
  event: CloudFormationCustomResourceEvent,
  //@ts-ignore
  context: Context,
  //@ts-ignore
  callback: Callback,
): Promise<CloudFormationCustomResourceResponse | undefined> => {
  console.log(`Event: ${JSON.stringify(event)}`);

  let data: {
    [Key: string]: any;
  } = {};
  //then execute task based on request type
  let physicalResourceId: string | undefined;
  if (['Create', 'Update'].indexOf(event.RequestType) != -1) {
    if (event.RequestType == 'Update') {
      physicalResourceId = event.PhysicalResourceId;
    }
    console.debug('Attempting to create resource explorer index');

    const enabledRegions: string[] = event.ResourceProperties.ENABLED_REGIONS;
    for (const region of enabledRegions) {
      //turn on indexes for each of the specified regions
      await turnOnIndexForRegion(region);
    }
    const aggregatorIndexRegion: string = event.ResourceProperties.AGGREGATOR_INDEX_REGION;
    //create an aggregator index in the specified region
    await createAggregatorIndexForRegion(aggregatorIndexRegion);

    const client = new ResourceExplorer2Client({ region: aggregatorIndexRegion });
    const createViewResponse = await createView(aggregatorIndexRegion, client);
    if (createViewResponse == undefined) {
      return {
        Status: 'FAILED',
        Reason: 'Could not create view. check logs.',
      } as CloudFormationCustomResourceFailedResponse;
    }
    physicalResourceId = createViewResponse;
    data.ViewArn = createViewResponse;
    return {
      Status: 'SUCCESS',
      PhysicalResourceId: physicalResourceId,
      LogicalResourceId: event.LogicalResourceId,
      Data: data,
    } as CloudFormationCustomResourceSuccessResponse;

  } else {
    //just return success on delete
    return {
      Status: 'SUCCESS',
      PhysicalResourceId: physicalResourceId,
      LogicalResourceId: event.LogicalResourceId,
      Data: data,
    } as CloudFormationCustomResourceSuccessResponse;
  }

};


async function turnOnIndexForRegion(region: string, client: ResourceExplorer2Client = new ResourceExplorer2Client({
  region: region,

})): Promise<string | undefined> {

  const command = new CreateIndexCommand({
    ClientToken: v4(),
  });
  try {
    const response = await client.send(command);
    console.debug(`Successfully turned on resource explorer index in region ${region}`);
    return response.Arn;
  } catch (e) {
    const error = e as Error;
    let message = error.message;
    console.warn(message);
    if (error.name == 'ConflictException') {
      const response = await client.send(new GetIndexCommand({
        region: region,
      }));
      console.debug(`Resource explorer index ${response.Arn} already exists in region ${region}`);
      return response.Arn;
    } else {
      throw Error(`Problem calling enabling index in region ${region}: ${message}`);
    }
  }
}

async function createAggregatorIndexForRegion(region: string): Promise<void> {
  const client = new ResourceExplorer2Client({
    region: region,
  });
  const indexArn = await turnOnIndexForRegion(region, client);
  try {
    const response = await client.send(new UpdateIndexTypeCommand({
      Arn: indexArn,
      Type: 'AGGREGATOR',
    }));
    console.debug(`Successfully created aggregator index ${response.Arn} in region ${region}`);
  } catch (e) {
    const error = e as Error;
    let message = error.message;
    console.warn(message);
    if (error.name == 'ConflictException') {
      console.debug(`Resource explorer index in region ${region} is already set to type AGGREGATOR`);
    } else {
      throw Error(`Problem calling enabling index in region ${region}: ${message}`);
    }
  }

}


async function createView(region: string, client: ResourceExplorer2Client = new ResourceExplorer2Client({
  region: region,
})): Promise<string | undefined> {

  //lets check that there is a  view in this region
  try {
    let tagInventorResourcesView = await client.send(new CreateViewCommand({
      ClientToken: v4(),
      ViewName: 'tag-inventory-all-resources',
      IncludedProperties: [{
        Name: 'tags',
      }],
    }));
    console.debug(`Successfully created resource explorer view ${tagInventorResourcesView.View?.ViewArn}`);

  } catch (e) {
    const error = e as Error;
    let message = error.message;
    console.warn(message);
    if (error.name == 'ConflictException') {
      console.debug('View  \'tag-inventory-all-resources\' already exists');
    } else {
      throw new Error(`Problem creating view  'tag-inventory-all-resources': ${message}`);
    }
  }
  const viewArn = await findViewByName(region, 'tag-inventory-all-resources', client);
  if (viewArn == undefined) {
    return viewArn;
  } else {
    const associateDefaultView = async () => {
      console.debug(`No default view specified, setting default view to ${viewArn}`);
      try {
        const associateDefaultViewResponse = await client.send(new AssociateDefaultViewCommand({
          ViewArn: viewArn!,
        }));
        console.debug(`${associateDefaultViewResponse.ViewArn} has successfully been associated as the default view`);
      } catch (e1) {
        const error1 = e1 as Error;
        let message1 = error1.message;
        console.warn(`Problem associating view ${viewArn} as default view: ${message1}`);
      }
    };
    //check to see if we have a default view, if not make this the default view
    try {
      const getDefaultViewResponse = await client.send(new GetDefaultViewCommand({}));
      if (getDefaultViewResponse.ViewArn == undefined) {
        await associateDefaultView();
      } else {
        console.debug(`${getDefaultViewResponse.ViewArn} is already associated as the default view`);
      }
    } catch (e) {
      const error = e as Error;
      let message = error.message;
      console.warn(message);
      if (error.name == 'ResourceNotFoundException') {
        await associateDefaultView();
      } else {
        throw new Error(`Problem creating view  'tag-inventory-all-resources': ${message}`);
      }
    }
  }
  return viewArn;
}

async function findViewByName(region: string, viewName: string, client: ResourceExplorer2Client = new ResourceExplorer2Client({
  region: region,
})): Promise<string | undefined> {
  let viewArn: string | undefined;
  try {
    const viewListPaginator = paginateListViews({
      client: client,
    }, {});

    for await (const page of viewListPaginator) {
      viewArn = page.Views!.find(value => {
        if (viewName === value.split('/')[1]) {
          return true;
        }
        return false;
      });
      if (viewArn != undefined) {
        break;
      }
    }
  } catch (e) {
    const error = e as Error;
    let message = error.message;
    throw new Error(`There was a problem finding view ${viewName}: ${message}`);
  }
  if (viewArn != undefined) {
    const getViewResponse = await client.send(new GetViewCommand({
      ViewArn: viewArn,
    }));

    console.debug(`Found view ${getViewResponse.View?.ViewArn} with name ${viewName}`);
    return getViewResponse.View?.ViewArn;
  } else {
    throw new Error("Could not find view with name 'tag-inventory-all-resources'");
  }


}
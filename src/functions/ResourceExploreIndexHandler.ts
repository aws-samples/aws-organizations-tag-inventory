import {

  CreateIndexCommand, CreateViewCommand, GetIndexCommand, GetViewCommand, paginateListViews,
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

    //try to create the index to ensure Resourc Explorer is enabled
    const enabledRegions: string[] = event.ResourceProperties.ENABLED_REGIONS;

    for (const region of enabledRegions) {
      await turnOnIndexForRegion(region);
    }
    const aggregatorIndexRegion: string = event.ResourceProperties.AGGREGATOR_INDEX_REGION;
    await createAggregatorIndexForRegion(aggregatorIndexRegion);

    const client = new ResourceExplorer2Client({});
    const createViewResponse = await createView(client);
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


async function turnOnIndexForRegion(region: string, client: ResourceExplorer2Client = new ResourceExplorer2Client({})): Promise<string | undefined> {

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


async function createView(client: ResourceExplorer2Client = new ResourceExplorer2Client({})): Promise<string | undefined> {

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
  return findViewByName('tag-inventory-all-resources', client);
}

async function findViewByName(viewName: string, client: ResourceExplorer2Client = new ResourceExplorer2Client({})): Promise<string | undefined> {
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
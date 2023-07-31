import { ResourceExplorer2Client, SearchCommand } from '@aws-sdk/client-resource-explorer-2';

export const onEvent = async (
  event: any,
  //@ts-ignore
  context: Context,
  //@ts-ignore
  callback: Callback,
): Promise<string> => {
  console.log(`Event: ${JSON.stringify(event)}`);
  const client = new ResourceExplorer2Client({
    region: process.env.VIEW_ARN!.split(':')[3],
  });
  const command = new SearchCommand({ ViewArn: process.env.VIEW_ARN, MaxResults: event.MaxResults==undefined ? 10 : event.MaxResults, QueryString: '', NextToken: event?.NextToken });
  const response = await client.send(command);
  return JSON.stringify({
    ViewArn: response.ViewArn,
    Count: response.Count,
    NextToken: response.NextToken,
    Resources: response.Resources,
  });


};
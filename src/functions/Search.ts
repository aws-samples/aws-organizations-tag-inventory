import { ResourceExplorer2Client, SearchCommand } from '@aws-sdk/client-resource-explorer-2';

export const onEvent= async (
  event: any,
  //@ts-ignore
  context: Context,
  //@ts-ignore
  callback: Callback,
): Promise<string> => {
  console.log(`Event: ${JSON.stringify(event)}`);
  const client = new ResourceExplorer2Client({});
  const command = new SearchCommand({ ViewArn: process.env.VIEW_ARN, MaxResults: 10, QueryString: '', NextToken: event?.NextToken });
  const response = await client.send(command);
  return JSON.stringify(response);


};
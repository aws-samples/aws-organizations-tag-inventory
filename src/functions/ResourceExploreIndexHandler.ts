import {
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceResponse,
    CloudFormationCustomResourceSuccessResponse
} from "aws-lambda";
import {
    ConflictException,
    CreateIndexCommand,
    GetIndexCommand,
    ResourceExplorer2Client
} from "@aws-sdk/client-resource-explorer-2";
import {v4} from 'uuid';
const client = new ResourceExplorer2Client({});
export const onEvent = async (
    event: CloudFormationCustomResourceEvent,
    //@ts-ignore
    context: Context,
    //@ts-ignore
    callback: Callback,
): Promise<CloudFormationCustomResourceResponse|undefined> => {
    console.log(`Event: ${JSON.stringify(event)}`);
    //then execute task based on request type

    switch (event.RequestType) {
        case 'Create':
            //TODO: Check to see if index exists
            //if not create
            //else don't
            const command = new CreateIndexCommand({
                ClientToken: v4()
            });
            try {
                const createIndexResponse = await client.send(command);
                return {
                    Status: "SUCCESS",
                    PhysicalResourceId: createIndexResponse.Arn!,
                    LogicalResourceId: event.LogicalResourceId

                } as CloudFormationCustomResourceSuccessResponse
            }
            catch (e) {
                let message = 'Unknown Error'
                if (e instanceof ConflictException) {
                    message = e.message;
                    console.error(`Error:${message}`)
                    const getIndexResponse = await client.send(new GetIndexCommand({}))
                    return {
                        Status: "SUCCESS",
                        PhysicalResourceId: getIndexResponse.Arn!,
                        LogicalResourceId: event.LogicalResourceId
                    }as CloudFormationCustomResourceSuccessResponse
                }
                // we'll proceed, but let's report it

            }
        //     break;
        // case 'Update':
        //     throw Error("Not implemented")
        //     break;
        //
        // case 'Delete':
        //
        //     throw Error("Not implemented")
        //     break;
        //
        // default:
        //     throw Error("Not implemented")
    }
    return undefined
};
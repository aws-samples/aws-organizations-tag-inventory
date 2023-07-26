export const onEvent = async (
    event?: any,
    //@ts-ignore
    context: Context,
    //@ts-ignore
    callback: Callback,
): Promise<string> => {
    console.log(`Event: ${JSON.stringify(event)}`);
    return 'hello world'


};
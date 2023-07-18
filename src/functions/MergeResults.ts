export const onEvent = async (
  event?: any,
  //@ts-ignore
  context: Context,
  //@ts-ignore
  callback: Callback,
): Promise<string> => {
  console.log(`Event: ${JSON.stringify(event)}`);
  const flatten: Object[] = event.Results.flatten;
  let result: { [key: string]: any } = event.PreviousResults!=undefined ? event.PreviousResults : {};
  flatten.forEach((value: { [key: string]: any }) => {
    const tagName = Object.keys(value)[0];
    const tagValue = Object.keys(value[tagName] as {})[0];
    const resources = value[tagName][tagValue];
    if (tagName in result) {
      const existingValue = result[tagName];
      if (tagValue in existingValue) {
        const valueArray = existingValue[tagValue];
        if (valueArray == undefined) {
          existingValue[tagValue] = [];
        }
        existingValue[tagValue] = valueArray.concat(resources);
      } else {
        //@ts-ignore
        value[tagName][tagValue] = resources;
      }
    } else {
      result = {
        ...result,
        ...value,
      };
    }
  });
  // @ts-ignore
  const resultArray: [{ [key: string]: any }] = [];
  for (const k of Object.keys(result)) {
    const newResult: { [key: string]: any } = {};
    newResult["TagName"]=k
    const tagValue = Object.keys(result[k])[0];
    newResult["TagValue"]=tagValue
    newResult["Resources"]=result[k][tagValue]
    resultArray.push(newResult);

  }
  return JSON.stringify({
    NextToken: event?.Payload?.Result?.NextToken,
    Results: resultArray,
  });


};
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
    newResult.TagName=k;
    const tagValue = Object.keys(result[k])[0];
    newResult.TagValue=tagValue;
    newResult.Resources=result[k][tagValue];
    resultArray.push(newResult);

  }
  return JSON.stringify({
    NextToken: event?.Payload?.Result?.NextToken,
    Results: resultArray,
  });


};
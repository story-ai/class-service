import { Result } from "story-backend-utils";
import { boomify, BoomError } from "boom";
import * as AWSLambda from "aws-lambda";

const cors = {
  "Access-Control-Allow-Origin": "*"
};

export async function serialiseLambda(
  callback: AWSLambda.Callback,
  resulter: () => Result
) {
  let output;
  try {
    const res = await resulter();
    output = {
      statusCode: res.statusCode || 200,
      body: JSON.stringify(res.result),
      headers: Object.assign({}, cors)
    };
  } catch (e) {
    console.log("Internal ", e);
    let b: BoomError;
    if (e.isBoom) {
      b = e;
    } else {
      console.error(e);
      b = boomify(e);
    }

    output = {
      statusCode: b.output.statusCode,
      headers: Object.assign({}, cors, b.output.headers),
      body: JSON.stringify(b.output.payload)
    };
  }
  return callback(null, output);
}

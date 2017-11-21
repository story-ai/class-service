import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import * as Boom from "boom";

import { Result, serialiseLambda } from "story-backend-utils";

import { getToken } from "./auth";

const Result = Promise;

async function handler(body: { code?: any }): Result<{ success: true }> {
  // get an admin login token for century
  let token = await getToken();
  token = await getToken();
  // get all courses in Org from Century
  // join with teacher info from Century
  //    join with teacher meta from dynamo
  // join with course info from century
  // join with course meta from dynamo
  // return something to the client
  return {
    result: { success: true },
    statusCode: 200
  };
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = JSON.parse(e.body || "{}");
  serialiseLambda(done, () => handler(req));
}

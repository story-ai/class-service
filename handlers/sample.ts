import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import * as Boom from "boom";

import { Result, serialiseLambda } from "story-backend-utils";
import { SECRET_CODE } from "../config";

const Result = Promise;

function handler(body: { code?: any }): Result<{ success: boolean }> {
  // validate inputs
  if (typeof body.code !== "string") throw Boom.badData("Code must be given");
  if (body.code !== SECRET_CODE)
    throw Boom.badData(
      "Code given must match the secret code (which is " + SECRET_CODE + ")"
    );

  // return something to the client
  return Promise.resolve({
    result: { success: true },
    statusCode: 200
  });
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = JSON.parse(e.body || "{}");
  serialiseLambda(done, () => handler(req));
}

import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import * as Boom from "boom";
import * as querystring from "querystring";
import { keyBy } from "lodash";

import {
  Result,
  serialiseLambda,
  CenturyTypes,
  StoryTypes
} from "story-backend-utils";

import { getToken } from "./auth";

const dynamodb = new DynamoDB({
  region: "eu-west-1"
});
const Result = Promise;

type HandlerResult = {
  [id: string]: StoryTypes.Class;
};

async function handler(ids: string[]): Result<HandlerResult> {
  // get an admin login token for century
  let token = await getToken();

  // get all class from dynamo
  const result: HandlerResult = keyBy(await getStoryClassesById(ids), "_id");
  return {
    result,
    statusCode: 200
  };
}

async function getStoryClassesById(ids: string[]): Promise<StoryTypes.Class[]> {
  const params = {
    RequestItems: {
      "story-class": {
        Keys: ids.map(id => ({
          _id: {
            S: id
          }
        }))
      }
    }
  };
  const result = await dynamodb.batchGetItem(params).promise();
  if (
    result.Responses === undefined ||
    result.Responses["story-class"] === undefined
  )
    return [];
  return result.Responses["story-class"].map(item => ({
    _id: item._id.S!,
    price: parseFloat(item.price.N!),
    meta: item.meta.S!,
    teachers: item.teachers.SS!,
    courses: item.courses.SS!
  }));
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = (e.queryStringParameters!["ids"] || "").split(/,\s*/);
  serialiseLambda(done, () => handler(req));
}

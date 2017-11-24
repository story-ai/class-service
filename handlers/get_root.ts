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
  classes: {
    [id: string]: StoryTypes.Class;
  };
};

async function handler(): Result<HandlerResult> {
  // get an admin login token for century
  let token = await getToken();

  // get all class from dynamo
  const classes = keyBy(await getStoryClasses(), "_id");
  return {
    result: { classes },
    statusCode: 200
  };
}

async function getStoryClasses(): Promise<StoryTypes.Class[]> {
  const params = {
    TableName: "story-class"
  };
  const result = await dynamodb.scan(params).promise();
  if (result.Items === undefined) return [];
  return result.Items.map(item => ({
    _id: item._id.S!,
    price: parseFloat(item.price.N!),
    meta: item.meta.S!,
    teachers: item.teachers.SS!,
    courses: item.courses.SS!
  }));
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  serialiseLambda(done, handler);
}

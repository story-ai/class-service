import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import * as Boom from "boom";
import * as querystring from "querystring";
import { Map } from "story-backend-utils";
import { keyBy } from "lodash";
import { CENTURY_ORG_ID, TABLES } from "../config";
import { getCenturyClasses } from "./get_classes";

import {
  Result,
  serialiseLambda,
  CenturyTypes,
  StoryTypes
} from "story-backend-utils";

import { getToken } from "./auth";

const dynamodb = new DynamoDB({
  region: "eu-west-2"
});
const Result = Promise;

type ClassResult = {
  [id: string]: StoryTypes.Class;
};
type HandlerResult = {
  classes: ClassResult;
};

async function handler(): Result<HandlerResult> {
  // get an admin login token for century
  let token = await getToken();

  // get all class from dynamo
  const [storyTeachers, centuryTeachers] = await Promise.all([
    getStoryClasses(),
    getCenturyClasses(token)
  ]);
  console.log("Got classes");

  const classes = Object.keys(storyTeachers).reduce<ClassResult>((map, id) => {
    if (id in centuryTeachers) {
      return Object.assign({}, map, {
        [id]: { ...storyTeachers[id], ...centuryTeachers[id] }
      });
    }
    return map;
  }, {});

  return {
    result: { classes },
    statusCode: 200
  };
}

async function getStoryClasses(): Promise<Map<StoryTypes.StoryClassFields>> {
  const params = {
    TableName: TABLES.class
  };
  const result = await dynamodb.scan(params).promise();
  if (result.Items === undefined) return {};
  return keyBy(
    result.Items.map(item => ({
      _id: item._id.S!,
      price: parseFloat(item.price.N!),
      meta: item.meta.S!
    })),
    "_id"
  );
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  serialiseLambda(done, handler);
}

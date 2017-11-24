import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import * as Boom from "boom";
import * as querystring from "querystring";
import { CENTURY_ORG_ID } from "../config";
import {
  flatten,
  keyBy,
  mapValues,
  flow,
  map,
  fromPairs,
  merge,
  uniq
} from "lodash";

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

type HandlerResult = { [id: string]: StoryTypes.Teacher };

async function handler(ids: string[]): Result<HandlerResult> {
  // get an admin login token for century
  let token = await getToken();

  const [storyTeachers, teacherMap] = await Promise.all([
    getStoryTeachers(ids),
    getCenturyTeachers(ids, token)
  ]);

  const result: HandlerResult = keyBy(
    storyTeachers.map(teacher =>
      Object.assign({}, teacherMap[teacher._id], teacher)
    ),
    "_id"
  );
  // return something to the client
  return {
    result,
    statusCode: 200
  };
}

async function getStoryTeachers(
  ids: string[]
): Promise<StoryTypes.StoryTeacherFields[]> {
  const params = {
    RequestItems: {
      "story-teacher": {
        Keys: ids.map(id => ({
          id: {
            S: id
          }
        }))
      }
    }
  };
  const result = await dynamodb.batchGetItem(params).promise();
  console.log(result);
  if (
    result.Responses === undefined ||
    result.Responses["story-teacher"] === undefined
  )
    return [];
  return result.Responses["story-teacher"].map(item => ({
    _id: item.id.S!,
    meta: item.meta.S!
  }));
}

async function getCenturyTeachers(ids: string[], token: string) {
  const qs = querystring.stringify({
    org: CENTURY_ORG_ID,
    include: "profile,personal,contact",
    role: "teacher",
    populate: "true"
  });

  const result = await fetch(
    `https://api.century.tech/accounts/v2/users?${qs}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  );

  const allTeachers = await result.json<CenturyTypes.User[]>();
  return keyBy(allTeachers.filter(t => ids.indexOf(t._id) >= 0), "_id");
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = (e.queryStringParameters!["ids"] || "").split(/,\s*/);
  serialiseLambda(done, () => handler(req));
}

async function promiseMapAll<T>(promiseMap: {
  [k: string]: Promise<T>;
}): Promise<{ [k: string]: T }> {
  try {
    const promises = await Promise.all(
      Object.keys(promiseMap).map(k => promiseMap[k])
    );
    let objMapped: { [k: string]: T } = {};
    Object.keys(promiseMap).forEach((key, i) => {
      objMapped[key] = promises[i];
    });
    return objMapped;
  } catch (err) {
    return { err };
  }
}

import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import * as Boom from "boom";
import * as querystring from "querystring";
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

type HandlerResult = {
  [id: string]: CenturyTypes.Course;
};

async function handler(courseIDs: string[]): Result<HandlerResult> {
  // get an admin login token for century
  let token = await getToken();
  console.log("Still going for it?");

  // get full course definitions from Century
  const courses = await Promise.all(
    uniq(courseIDs).map(id => getCourse(id, token))
  );
  console.log(courses);
  const result: HandlerResult = keyBy(courses, "_id");
  // return something to the client
  return {
    result,
    statusCode: 200
  };
}

function getCourse(
  courseId: string,
  token: string
): Promise<CenturyTypes.Course> {
  return fetch(`https://api.century.tech/content/v2/courses/${courseId}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`
    }
  })
    .then(r => r.json<CenturyTypes.Course>())
    .then(course => course);
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = (e.queryStringParameters!["ids"] || "").split(/,\s*/);
  serialiseLambda(done, () => handler(req));
}

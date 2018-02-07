import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import * as Boom from "boom";
import * as querystring from "querystring";
import { keyBy } from "lodash";
import { CENTURY_ORG_ID, TABLES } from "../config";

import {
  Id,
  Map,
  Result,
  serialiseLambda,
  CenturyTypes,
  StoryTypes
} from "story-backend-utils";

import { getToken } from "./auth";

const getWithTokenParams = (token: string) => ({
  method: "GET",
  headers: {
    authorization: `Bearer ${token}`
  }
});

const dynamodb = new DynamoDB({
  region: "eu-west-2"
});
const Result = Promise;

type HandlerResult = {
  [id: string]: StoryTypes.Class;
};

async function handler(ids: string[]): Result<HandlerResult> {
  // get an admin login token for century
  let token = await getToken();

  const [storyTeachers, centuryTeachers] = await Promise.all([
    getStoryClassesById(ids),
    getCenturyClasses(token, ids)
  ]);

  const result = Object.keys(storyTeachers).reduce<HandlerResult>((map, id) => {
    if (id in centuryTeachers) {
      return Object.assign({}, map, {
        [id]: { ...storyTeachers[id], ...centuryTeachers[id] }
      });
    }
    return map;
  }, {});

  return {
    result,
    statusCode: 200
  };
}

async function getStoryClassesById(
  ids: string[]
): Promise<Map<StoryTypes.StoryClassFields>> {
  const params = {
    RequestItems: {
      [TABLES.class]: {
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
    result.Responses[TABLES.class] === undefined
  )
    return {};

  return keyBy(
    result.Responses[TABLES.class].map(item => ({
      _id: item._id.S!,
      price: parseFloat(item.price.N!),
      meta: item.meta.S!
    })),
    "_id"
  );
}

export async function getCenturyClasses(
  token: string,
  ids?: string[]
): Promise<Map<CenturyTypes.Class>> {
  let qs = querystring.stringify({
    orgs: CENTURY_ORG_ID,
    include: "organisation,type"
  });

  const result = await fetch(
    `https://api.century.tech/accounts/v2/classes?${qs}`,
    getWithTokenParams(token)
  );

  let classes = await result.json<CenturyTypes.UnjoinedClass[]>();
  if (ids !== undefined) {
    classes = classes.filter(t => ids.indexOf(t._id) >= 0);
  }

  console.log("Got classes ", classes);

  // also want to retrieve teachers and courses for this class
  const joined = await Promise.all(
    classes.map(c =>
      Promise.all([
        fetch(
          `https://api.century.tech/accounts/v2/users?${querystring.stringify({
            org: CENTURY_ORG_ID,
            role: "teacher",
            class: c._id
          })}`,
          getWithTokenParams(token)
        ).then(
          r =>
            console.log("Teachers: ", r.statusText) || r.json<{ _id: Id }[]>()
        ),

        fetch(
          `https://api.century.tech/accounts/v2/study-groups?include=course&class=${
            c._id
          }`,
          getWithTokenParams(token)
        ).then(async r => {
          // const text = await r.text();
          // try {
          //   const json = JSON.parse(text);
          //   console.log(
          //     "Failed on ",
          //     `https://app.century.tech/teach/api/learners/courses?classId=${
          //       c._id
          //     }`
          //   );

          // } catch (e) {
          //   console.log(
          //     "Failed on ",
          //     `https://app.century.tech/teach/api/learners/courses?classId=${
          //       c._id
          //     }`
          //   );
          // }
          console.log("Courses: ", r.statusText);
          return r.json<{ course: Id }[]>();
        })
      ]).then(([teachers, courses]) => {
        return {
          ...c,
          teachers: teachers.map(x => x._id),
          courses: courses.map(x => x.course)
        };
      })
    )
  );

  return keyBy(joined, "_id");
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = (e.queryStringParameters!["ids"] || "").split(/,\s*/);
  serialiseLambda(done, () => handler(req));
}

import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import {
  Result,
  serialiseLambda,
  CenturyTypes,
  StoryTypes
} from "story-backend-utils";
import { AttributeMap } from "aws-sdk/clients/dynamodbstreams";
import { keyBy } from "lodash";
import { TABLES } from "../config";

const dynamodb = new DynamoDB({
  region: "eu-west-2"
});

export async function getCourseMetas(
  ids?: string[]
): Promise<{ [k: string]: StoryTypes.StoryCourseFields }> {
  let result: AttributeMap[];
  console.log("IDS: ", ids);
  if (ids) {
    const response = await dynamodb
      .batchGetItem({
        RequestItems: {
          [TABLES.course]: {
            Keys: ids.map(id => ({
              _id: {
                S: id
              }
            }))
          }
        }
      })
      .promise();

    if (
      response.Responses === undefined ||
      response.Responses[TABLES.course] === undefined
    )
      return {};

    result = response.Responses[TABLES.course];
  } else {
    const { Items: items } = await dynamodb
      .scan({
        TableName: TABLES.course
      })
      .promise();
    result = items!;
  }

  return keyBy(
    result.map(item => ({
      _id: item._id.S!,
      price: parseFloat(item.price.N!)
    })),
    "_id"
  );
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  let result: Promise<{ [k: string]: StoryTypes.StoryCourseFields }>;
  if (e.queryStringParameters && e.queryStringParameters.ids) {
    result = getCourseMetas(e.queryStringParameters.ids.split(","));
  } else {
    result = getCourseMetas();
  }
  serialiseLambda(done, async () => {
    return {
      result: await result,
      statusCode: 200
    };
  });
}

import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import {
  Result,
  serialiseLambda,
  CenturyTypes,
  StoryTypes
} from "story-backend-utils";

const dynamodb = new DynamoDB({
  region: "eu-west-2"
});

export async function getCourseMeta(
  courseID: string
): Promise<StoryTypes.StoryCourseFields> {
  const result = await dynamodb
    .getItem({
      TableName: "story-course",
      Key: {
        _id: {
          S: courseID
        }
      }
    })
    .promise();

  const item = {
    _id: result.Item!._id.S!,
    price: parseFloat(result.Item!.price.N!)
  };

  return item;
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = e.pathParameters!.id;
  serialiseLambda(done, async () => {
    return {
      result: await getCourseMeta(req),
      statusCode: 200
    };
  });
}

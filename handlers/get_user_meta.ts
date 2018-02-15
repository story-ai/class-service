import { fetchToken } from "./auth";
import { Handler, APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import axios from "axios";
import {
  Result,
  serialiseLambda,
  CenturyTypes,
  StoryTypes
} from "story-backend-utils";
import { CENTURY_ORG_ID, TABLES } from "../config";

const dynamodb = new DynamoDB({
  region: "eu-west-2"
});

export async function getUserMeta(
  userId: string
): Promise<StoryTypes.StoryUserFields> {
  const result = await dynamodb
    .getItem({
      TableName: TABLES.user,
      Key: {
        _id: {
          S: userId
        }
      }
    })
    .promise();

  if (result.Item !== undefined) {
    console.log("Re-used existing class");
    return {
      _id: result.Item._id.S!,
      class: result.Item.class.S!
    };
  }
  const token = await fetchToken();

  // get the user object we are going to modify
  let { data: userResult } = await axios.get<CenturyTypes.User>(
    `https://api.century.tech/accounts/v2/users/${userId}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    }
  );

  // create a new class in Century
  const { data: { id: classId } } = await axios.post<{ id: string }>(
    "https://api.century.tech/accounts/v2/classes",
    {
      name: `${userResult.personal.name.first}'s Story Class`,
      organisation: CENTURY_ORG_ID,
      type: "custom",
      isTest: true
    },
    {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    }
  );
  console.log("Created a new class with ID ", classId);

  // add the student to this new class
  const user: CenturyTypes.User = {
    ...userResult,
    profile: {
      ...userResult.profile,
      groups: {
        ...userResult.profile.groups,
        organisations: userResult.profile.groups.organisations.map(
          o =>
            o.organisation === CENTURY_ORG_ID
              ? {
                  ...o,
                  classes: o.classes.concat([classId]),
                  classSettings: o.classSettings.concat([{ class: classId }])
                }
              : o
        )
      }
    }
  };
  console.log("Obtained new user", user.profile.groups.organisations);
  let centuryUpdate = axios
    .patch(`https://api.century.tech/accounts/v2/users/${userId}`, user, {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    })
    .then(r => {
      console.log("Patched user", r.data);
    });

  // persist this new class to the meta info in Story DB
  const dynamoUpdate = dynamodb
    .putItem({
      TableName: TABLES.user,
      Item: {
        _id: {
          S: userId
        },
        class: {
          S: classId
        }
      }
    })
    .promise();

  // wait for things to settle
  await Promise.all([dynamoUpdate, centuryUpdate]);

  return {
    _id: userId,
    class: classId
  };
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = e.pathParameters!.id;
  serialiseLambda(done, async () => {
    try {
      return {
        result: await getUserMeta(req),
        statusCode: 200
      };
    } catch (e) {
      return {
        result: null,
        statusCode: 500,
        message: e.message
      };
    }
  });
}

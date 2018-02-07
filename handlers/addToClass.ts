import { fetchToken } from "./auth";
import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import axios from "axios";
import * as Stripe from "stripe";
import { DynamoDB } from "aws-sdk";
import {
  CENTURY_ORG_ID,
  CLASS_CODE,
  SENDGRID_API_KEY,
  STRIPE_SECRET_KEY,
  TABLES
} from "../config";
import {
  Map,
  StoryTypes,
  Result,
  serialiseLambda,
  CenturyTypes
} from "story-backend-utils";

console.log(STRIPE_SECRET_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY);
const dynamodb = new DynamoDB({
  region: "eu-west-2"
});

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = JSON.parse(e.body || "{}");
  serialiseLambda(done, () =>
    simpleHandler(e.pathParameters!.userId, req.classId, req.stripeToken)
  );
}

const Result = Promise;

async function simpleHandler(
  userId: string,
  classId: string,
  stripeToken: string
): Result<{ success: boolean; message?: string }> {
  try {
    if (userId === undefined || userId.length < 1) throw "User ID invalid";
    if (classId === undefined || classId.length < 1) throw "Class ID invalid";
    if (stripeToken === undefined || stripeToken.length < 1)
      throw "Stripe token is invalid";

    console.log("STRIPE KEY IS ", STRIPE_SECRET_KEY);

    // Firstly, retrieve the class details so we know how much to charge
    const storyClass = await getStoryClass(classId);
    if (storyClass === null) throw "Could not retrieve class with the given ID";

    // Now check the stripe token allows us to take payment

    // Charge the user's card:
    const charge = await stripe.charges.create({
      amount: storyClass.price * 100,
      currency: "USD",
      description: "Story Course", // TODO: retrieve this (from century)?
      source: stripeToken
    });

    // now that's done, we can actually add the user to the class
    const token = await fetchToken();

    // get the user object we are going to modify
    let userResult = await axios.get<CenturyTypes.User>(
      `https://api.century.tech/accounts/v2/users/${userId}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        }
      }
    );

    if (userResult.status !== 200) {
      throw userResult.statusText;
    }

    const user: CenturyTypes.User = {
      ...userResult.data,
      profile: {
        ...userResult.data.profile,
        groups: {
          ...userResult.data.profile.groups,
          organisations: userResult.data.profile.groups.organisations.map(
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

    let update = await axios.patch<{ id: string }>(
      `https://api.century.tech/accounts/v2/users/${userId}`,
      user,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        }
      }
    );

    console.log(update);
    return { result: { success: true }, statusCode: 200 };
  } catch (e) {
    console.log("ERROR");
    console.log(e);
    return {
      result: { success: false, message: e.message },
      statusCode: 500
    };
  }
}

async function getStoryClass(
  id: string
): Promise<StoryTypes.StoryClassFields | null> {
  const result = await dynamodb
    .getItem({
      Key: { _id: { S: id } },
      TableName: TABLES.class
    })
    .promise();

  if (result.Item === undefined) return null;

  return {
    _id: result.Item._id.S!,
    price: parseFloat(result.Item.price.N!)
  };
}

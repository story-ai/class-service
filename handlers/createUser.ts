import { fetchToken } from "./auth";
import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import axios from "axios";
import { createUserMeta } from "./get_user_meta";

import { Result, serialiseLambda, StoryTypes } from "story-backend-utils";
import {
  CENTURY_ORG_ID,
  CLASS_CODE,
  SENDGRID_API_KEY,
  TABLES
} from "../config";
import { DynamoDB } from "aws-sdk";

const Result = Promise;
var docClient = new DynamoDB.DocumentClient({
  region: "eu-west-2"
});

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = JSON.parse(e.body || "{}");
  serialiseLambda(done, () =>
    simpleHandler(
      req.username,
      req.firstname,
      req.lastname,
      req.password,
      req.passwordConfirmation,
      req.referral_code
    )
  );
}

async function simpleHandler(
  username: string,
  firstname: string,
  lastname: string,
  password: string,
  passwordConfirmation: string,
  referral_code?: string
): Result<{
  success: boolean;
  message?: string;
  story?: StoryTypes.StoryUserFields;
}> {
  try {
    console.log(username, password, passwordConfirmation);
    // basic validation
    if (username === undefined || username.length < 1) {
      return {
        result: { success: false, message: "Email must be provided" },
        statusCode: 400
      };
    }
    if (username.match(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i) === null) {
      return {
        result: { success: false, message: "Email format is invalid" },
        statusCode: 400
      };
    }
    if (password === undefined || password.length < 1) {
      return {
        result: { success: false, message: "Password must not be empty" },
        statusCode: 400
      };
    }
    if (passwordConfirmation !== password) {
      return {
        result: { success: false, message: "Password confirmation must match" },
        statusCode: 400
      };
    }
    if (firstname === undefined) {
      firstname = "Story";
      lastname = "User;";
    }

    // check if the user has already registered with Century
    let check = await axios.get<{ isKnownUser: boolean }>(
      `https://app.century.tech/learn/api/users?email=${username}`,
      {
        headers: {
          "Content-Type": "application/javascript"
        }
      }
    );
    if (check.data.isKnownUser) {
      return {
        result: {
          success: false,
          message: "This email has already been registered"
        },
        statusCode: 400
      };
    }

    // prepare a user object to register
    const token = await fetchToken();

    let register = await axios.post<{ id: string }>(
      "https://api.century.tech/accounts/v2/users/",
      {
        password,
        personal: { name: { first: firstname, last: lastname } },
        isTest: true,

        contact: {
          emails: [
            {
              address: username,
              isVerified: false
            }
          ]
        },
        profile: {
          groups: {
            organisations: [
              {
                organisation: "0adee573-b3e3-46cf-a16b-32980590e2fe",
                roles: ["learner", "student"]
              }
            ]
          },
          ids: { username }
        }
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        }
      }
    );
    // TODO: update mailchimp. POST to us17.api.mailchimp.com/3.0/lists/{list_id}/members/
    /*
{
    email_address: username,
    "status": "subscribed",
    "merge_fields": {
        "FNAME": firstname,
        "LNAME": lastname
    }
}
*/

    // Give a discount to referrer

    let referral_bonus = false;
    if (referral_code !== undefined && referral_code.length > 0) {
      console.log("Rewarding referrer", referral_code);
      const referrer = await docClient
        .query({
          TableName: TABLES.user,
          IndexName: "ReferralCode",
          KeyConditionExpression: "referral_code = :code",
          ExpressionAttributeValues: {
            ":code": referral_code
          }
        })
        .promise();
      console.log("Got ", referrer.Items);
      if (referrer.Items && referrer.Items.length > 0) {
        const referralDiscount: StoryTypes.Discount = {
          _id: `discount_${Math.random() * 1000000000}`,
          value: 20,
          name: "Referral Bonus for " + firstname + " " + lastname
        };

        const referrer_result = await docClient
          .update({
            TableName: TABLES.user,

            Key: {
              _id: referrer.Items[0]._id
            },

            UpdateExpression: "SET #discounts = list_append(#discounts, :d)",
            ExpressionAttributeValues: {
              ":d": [referralDiscount]
            },
            ExpressionAttributeNames: {
              "#discounts": "discounts"
            },
            ReturnValues: "ALL_NEW"
          })
          .promise();

        console.log(referrer_result);
        referral_bonus = true;
      }
    }

    // Initialise Story data for this user
    const userMeta = await createUserMeta(register.data.id, referral_bonus);

    return { result: { success: true, story: userMeta }, statusCode: 200 };
  } catch (e) {
    console.error(e);
    return {
      result: { success: false, message: e.response.data.message },
      statusCode: 500
    };
  }
}

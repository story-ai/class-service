import { fetchToken } from "./auth";
import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import axios from "axios";

import { Result, serialiseLambda } from "story-backend-utils";
import { CENTURY_ORG_ID, CLASS_CODE, SENDGRID_API_KEY } from "../config";

const Result = Promise;

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = JSON.parse(e.body || "{}");
  serialiseLambda(done, () =>
    simpleHandler(
      req.username,
      req.firstname,
      req.lastname,
      req.password,
      req.passwordConfirmation
    )
  );
}

async function simpleHandler(
  username: string,
  firstname: string,
  lastname: string,
  password: string,
  passwordConfirmation: string
): Result<{ success: boolean; message?: string }> {
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

    console.log(register);
    return { result: { success: true }, statusCode: 200 };
  } catch (e) {
    return {
      result: { success: false, message: e.response.data.message },
      statusCode: 500
    };
  }
}

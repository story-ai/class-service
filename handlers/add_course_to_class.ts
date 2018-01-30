import { fetchToken } from "./auth";
import fetch from "node-fetch";
import { Handler, APIGatewayEvent } from "aws-lambda";
import axios, { AxiosPromise } from "axios";
import * as Stripe from "stripe";
import { DynamoDB } from "aws-sdk";
import {
  CENTURY_ORG_ID,
  CLASS_CODE,
  SENDGRID_API_KEY,
  STRIPE_SECRET_KEY
} from "../config";
import {
  Map,
  StoryTypes,
  Result,
  serialiseLambda,
  CenturyTypes
} from "story-backend-utils";
import { getCourseMeta } from "./get_course_meta";
import { getUserMeta } from "./get_user_meta";

console.log(STRIPE_SECRET_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY);
const dynamodb = new DynamoDB({
  region: "eu-west-2"
});

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = JSON.parse(e.body || "{}");
  serialiseLambda(done, () =>
    simpleHandler(e.pathParameters!.userId, req.courseId, req.stripeToken)
  );
}

const Result = Promise;

async function simpleHandler(
  userId: string,
  courseId: string,
  stripeToken: string
): Result<{ success: boolean; message?: string }> {
  try {
    if (userId === undefined || userId.length < 1) throw "User ID invalid";
    if (courseId === undefined || courseId.length < 1)
      throw "Course ID invalid";
    if (stripeToken === undefined || stripeToken.length < 1)
      throw "Stripe token is invalid";

    // Firstly, retrieve the course details so we know how much to charge
    const courseMeta = await getCourseMeta(courseId);

    // Charge the user's card:
    const charge = await stripe.charges.create({
      amount: courseMeta.price * 100,
      currency: "USD",
      description: "Story Course", // TODO: retrieve this (from century)?
      source: stripeToken
    });

    // Get the user's class
    const userMeta = await getUserMeta(userId);

    // now that's done, we can actually add the course to the user's class
    await assignCourse(userMeta._id, courseId);
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

async function assignCourse(classId: string, courseId: string): Promise<any> {
  const token = await fetchToken();
  type Job = {
    contentResponse: null;
    contextIds: string[];
    endTime: string;
    error: string;
    jobId: string;
    name: string;
    scheduledTime: string;
    startTime: string;
    status: "waiting" | "success" | "running";
  };

  return waitForJob(
    axios.post<Job>(
      "https://api.century.tech/palpatine/api/v1/studygroups/create-update",
      {
        name: "No Name Given", // TODO: name this better
        classId,
        courseId,
        organisationId: CENTURY_ORG_ID
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        }
      }
    )
  );

  async function waitForJob(p: AxiosPromise<Job>): Promise<Job> {
    const { status, data: job } = await p;
    if (status === 200) {
      if (job.status === "success") {
        return job;
      } else if (job.status === "waiting" || job.status === "running") {
        // delay before checking status
        await new Promise(r => setTimeout(r, 200));
        // check status of the job
        return waitForJob(
          axios.get<Job>(
            `https://api.century.tech/palpatine/api/v1/jobs/${
              job.jobId
            }?${new Date().getTime()}`,
            {
              headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json"
              }
            }
          )
        );
      }
    }
    // something went wrong
    console.error("Something went wrong");
    console.log("Status ", status);
    console.log(job);
    return Promise.reject(job);
  }
}

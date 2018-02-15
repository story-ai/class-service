import { APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import axios, { AxiosPromise } from "axios";
import { serialiseLambda } from "story-backend-utils";
import * as Stripe from "stripe";

import { CENTURY_ORG_ID, STRIPE_SECRET_KEY } from "../config";
import { getToken } from "./auth";
import { fetchToken } from "./auth";
import { getCourseMeta } from "./get_course_meta";
import { getCourse } from "./get_courses";
import { getUserMeta } from "./get_user_meta";
import { Result } from "story-backend-utils/dist/types/common";
const Result = Promise;

console.log(STRIPE_SECRET_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY);

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = JSON.parse(e.body || "{}");
  serialiseLambda(done, () =>
    simpleHandler(e.pathParameters!.id, req.courseId, req.stripeToken)
  );
}

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

    // get an admin login token for century
    let token = await getToken();

    // Firstly, retrieve the course details so we know how much to charge
    const [courseMeta, courseDetails] = await Promise.all([
      getCourseMeta(courseId),
      getCourse(courseId, token)
    ]);

    // Charge the user's card:
    const charge = await stripe.charges.create({
      amount: courseMeta.price * 100,
      currency: "GBP",
      description: "Story Course: " + courseDetails.name,
      source: stripeToken
    });

    // Get the user's class
    const userMeta = await getUserMeta(userId);

    // now that's done, we can actually add the course to the user's class
    await assignCourse(userMeta.class, courseId, courseDetails.name);
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

async function assignCourse(
  classId: string,
  courseId: string,
  courseName: string
): Promise<any> {
  const token = await fetchToken();
  type Job = {
    contentResponse: null;
    contextIds: string[];
    endTime: string | null;
    error: string | null;
    jobId: string;
    name: string;
    scheduledTime: string;
    startTime: string | null;
    status: "waiting" | "success" | "running";
  };

  return waitForJob(
    axios.post<Job>(
      "https://api.century.tech/palpatine/api/v1/studygroups",
      {
        name: courseName + " Study Group",
        isTest: true,
        classId,
        courseId,
        filter: { classes: [classId] },
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
        console.log("Will retry shortly");
        await new Promise(r => setTimeout(r, 100));
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
    return Promise.reject(job.error);
  }
}

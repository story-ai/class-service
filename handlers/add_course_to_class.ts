import { APIGatewayEvent } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import axios, { AxiosPromise } from "axios";
import { StoryTypes } from "story-backend-utils";
import { serialiseLambda } from "../serialiseLambda";
import * as Stripe from "stripe";

import { CENTURY_ORG_ID, STRIPE_SECRET_KEY, TABLES } from "../config";
import { fetchToken, getToken } from "./auth";
import { getCourse } from "./get_courses";
import { getUserMeta } from "./get_user_meta";
import { Result } from "story-backend-utils";
import { notify } from "../utils/slack-notify";
import { getCourseMeta } from "./get_course_meta";
const Result = Promise;

var docClient = new DynamoDB.DocumentClient({
  region: "eu-west-2"
});

const stripe = new Stripe(STRIPE_SECRET_KEY);

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = JSON.parse(e.body || "{}");
  serialiseLambda(done, () =>
    simpleHandler(
      e.pathParameters!.id,
      req.courseId,
      req.stripeToken,
      req.discount,
      req.receipt_email
    )
  );
}

async function simpleHandler(
  userId: string,
  prismicCourseId: string,
  stripeToken?: string,
  discount?: Partial<StoryTypes.Discount>,
  receipt_email?: string
): Result<{ success: boolean; message?: string }> {
  try {
    if (userId === undefined || userId.length < 1)
      throw new Error("User ID invalid");
    if (prismicCourseId === undefined || prismicCourseId.length < 1)
      throw new Error("Course ID invalid");

    // get an admin login token for century
    let token = await getToken();

    // Firstly, retrieve the course details so we know how much to charge
    const [courseMeta, userMeta] = await Promise.all([
      getCourseMeta({ id: prismicCourseId }),
      getUserMeta(userId)
    ]);
    const courseDetails = await getCourse(courseMeta.century_course_id, token);

    let validDiscount: StoryTypes.Discount | undefined;

    if (discount !== undefined) {
      // TODO: validate that this user is allowed this discount
      console.log("My discount", discount);
      console.log("Available", userMeta.discounts);
      validDiscount = userMeta.discounts.find(d => d._id === discount._id);
      console.log("Found", validDiscount);
      if (validDiscount === undefined) throw new Error("Invalid discount");
    }

    const price = Math.max(
      0,
      courseMeta.price - (validDiscount ? validDiscount.value : 0)
    );

    if (price > 0) {
      if (stripeToken === undefined || stripeToken.length < 1) {
        throw new Error("Stripe token is invalid");
      }

      console.log("Sending receipt to ", receipt_email);
      // Charge the user's card:
      const charge = await stripe.charges.create({
        amount: price * 100,
        currency: "GBP",
        description: "Story Course: " + courseDetails.name,
        source: stripeToken,
        statement_descriptor: "Story: " + courseDetails.name.substr(0, 15),
        receipt_email
      });
    }

    if (validDiscount !== undefined) {
      const newDiscounts = userMeta.discounts.filter(
        d => d._id !== (validDiscount as StoryTypes.Discount)._id
      );

      const result = await docClient
        .update({
          TableName: TABLES.user,
          Key: {
            _id: userMeta._id
          },

          UpdateExpression: "set discounts=:d",
          ExpressionAttributeValues: {
            ":d": newDiscounts
          }
        })
        .promise();
    }

    // now that's done, we can actually add the course to the user's class
    await assignCourse(userMeta.class, prismicCourseId, courseDetails.name);

    notify(
      `${receipt_email} just unlocked the course "${
        courseDetails.name
      }" for ${price.toLocaleString("en-GB", {
        style: "currency",
        currency: "GBP"
      })}${
        validDiscount === undefined
          ? ""
          : ` (discounted from ${courseMeta.price.toLocaleString("en-GB", {
              style: "currency",
              currency: "GBP"
            })} with "${validDiscount.name}")`
      }.`
    );
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

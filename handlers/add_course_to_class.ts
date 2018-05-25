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
  console.log("Received", e.body);
  const req = JSON.parse(e.body || "{}");
  console.log("Parsed as ", req);
  serialiseLambda(done, () =>
    simpleHandler(
      e.pathParameters!.id,
      req.prismicCourseId,
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
    console.log(
      `ADDING COURSE ${prismicCourseId} TO USER ${userId} [${receipt_email}]`
    );

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
    const courseId = courseMeta.century_course_id;

    let validDiscount: StoryTypes.Discount | undefined;

    if (discount != undefined && discount != null) {
      validDiscount = userMeta.discounts.find(d => d._id === discount._id);
      if (validDiscount === undefined) throw new Error("Invalid discount");
      console.log(`\tApplying discount ${validDiscount.value}`);
    }

    const price = Math.max(
      0,
      courseMeta.price - (validDiscount ? validDiscount.value : 0)
    );

    const courseDetails = await getCourse(courseMeta.century_course_id, token);

    if (price > 0) {
      if (stripeToken === undefined || stripeToken.length < 1) {
        throw new Error("Stripe token is invalid");
      }

      // Charge the user's card:
      console.log("\tCharging " + price);
      const charge = await stripe.charges.create({
        amount: Math.ceil(price * 100),
        currency: "GBP",
        description: "Story Course: " + courseDetails.name,
        source: stripeToken,
        statement_descriptor: "Story: " + courseDetails.name.substr(0, 15),
        receipt_email
      });
    }

    if (validDiscount !== undefined) {
      const newDiscounts = userMeta.discounts
        // reduce the value of the discount we just used
        .map(
          d =>
            d._id === (validDiscount as StoryTypes.Discount)._id
              ? { ...d, value: d.value - courseMeta.price }
              : d
        )
        // remove any discounts that have been fully used up
        .filter(d => d.value > 0.02);

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

    console.log(
      `\tAdding Century Course ${courseId}[${courseDetails.name}] to class ${
        userMeta.class
      }`
    );

    // now that's done, we can actually add the course to the user's class
    await assignCourse(userMeta.class, courseId, courseDetails.name);

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

async function getClassCourses(courseId: string): Promise<string[]> {
  const token = await fetchToken();
  const classes = await axios.get<{ course: string }[]>(
    `https://api.century.tech/accounts/v2/study-groups?include=course&class=${courseId}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    }
  );
  if (classes.status !== 200) {
    throw new Error("Could not get current classes for user");
  }
  return classes.data.map(x => x.course);
}

async function assignCourse(
  classId: string,
  courseId: string,
  courseName: string
): Promise<any> {
  // before we go any further, check if this user already has access to the course
  const existingCourses = await getClassCourses(classId);
  if (existingCourses.indexOf(courseId) >= 0) {
    throw new Error("Course has already been assigned");
  }

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
        isTest: process.env.STAGE !== "prod",
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

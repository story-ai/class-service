import { APIGatewayEvent } from "aws-lambda";
import { api as prismic } from "prismic-javascript";
import { serialiseLambda } from "../serialiseLambda";
import { StoryTypes, PrismicTypes } from "story-backend-utils";
import { PRISMIC_URL } from "../config";

const api = prismic(PRISMIC_URL);

export async function getCourseMeta(
  identifier: { id: string } | { slug: string }
): Promise<PrismicTypes.Course> {
  let course;
  if ("id" in identifier) {
    const result = await (await api).getByID<PrismicTypes.Course>(
      identifier.id
    );
    console.log("Got", result.data);
    course = result.data;
  } else {
    course = (await (await api).getByUID<PrismicTypes.Course>(
      "course",
      identifier.slug
    )).data;
  }
  console.log("course");

  return course;
}

export function index(e: APIGatewayEvent, ctx: any, done = () => {}) {
  const req = e.pathParameters!.id;
  serialiseLambda(done, async () => {
    return {
      result: await getCourseMeta({ id: req }),
      statusCode: 200
    };
  });
}

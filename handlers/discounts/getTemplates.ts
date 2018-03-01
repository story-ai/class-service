import { DynamoDB } from "aws-sdk";
import { StoryTypes } from "story-backend-utils";
import { TABLES } from "../../config";
import * as uuid from "uuid";

var docClient = new DynamoDB.DocumentClient({
  region: "eu-west-2"
});

export const enum DiscountTemplates {
  INTRODUCTORY = "a66368c9-c6a1-4c5f-89ed-5ce5099b1008",
  REFERRAL_BONUS = "5571053f-7e10-4dc3-8bf1-76e2cfa562cc",
  REFERRAL_REWARD = "c31efdb5-2941-4ab2-adaf-30280614857a"
}

export async function buildDiscount(
  id: DiscountTemplates,
  newName?: string
): Promise<StoryTypes.Discount> {
  const template = await docClient
    .get({
      TableName: TABLES.discountTemplates,
      Key: { _id: id }
    })
    .promise();

  if (template.Item === undefined) {
    throw new Error("No discount was found with that ID");
  }
  return {
    _id: uuid.v4(),
    name: newName || template.Item.name,
    value: template.Item.value
  };
}

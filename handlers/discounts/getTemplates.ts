import { api as prismic } from "prismic-javascript";
import { StoryTypes } from "story-backend-utils";
import * as uuid from "uuid";
import { PRISMIC_URL, PRISMIC_TYPES } from "../../config";

const api = prismic(PRISMIC_URL);

export const enum DiscountTemplates {
  INTRODUCTORY = "introduction",
  REFERRAL_BONUS = "referral-discount",
  REFERRAL_REWARD = "referral-reward"
}

type DiscountTemplate = {
  value: number;
  name: string;
};

export async function buildDiscount(
  id: DiscountTemplates,
  newName?: string
): Promise<StoryTypes.Discount> {
  const template = await (await api).getByUID<DiscountTemplate>(
    PRISMIC_TYPES.discountTemplate,
    id
  );

  return {
    _id: uuid.v4(),
    name: newName || template.data.name,
    value: template.data.value
  };
}

import { StoryTypes } from "story-backend-utils";
import * as uuid from "uuid";
import { PRISMIC_TYPES } from "../../config";
import { initApi } from "../../utils/prismic";

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
  const api = await initApi();
  const template = await api.getByUID<DiscountTemplate>(
    PRISMIC_TYPES.discountTemplate,
    id
  );

  return {
    _id: uuid.v4(),
    name: newName || template.data.name,
    value: template.data.value
  };
}

export const CLASS_CODE = process.env.CENTURY_CLASS_CODE || "";

export const CENTURY_API_BASE = "https://app.century.tech/learn/api";

export const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";

export const CENTURY_ADMIN_EMAIL = process.env.CENTURY_ADMIN_EMAIL || "";

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

export const CENTURY_ADMIN_PASSWORD = process.env.CENTURY_ADMIN_PASSWORD || "";

export const CENTURY_ORG_ID =
  process.env.CENTURY_ORG_ID || "0adee573-b3e3-46cf-a16b-32980590e2fe";

const stage = process.env.STAGE;

export const TABLES = {
  user: `${stage}-story-user`
  // teacher: `${stage}-story-teacher`,
  // course: `${stage}-story-course`,
  // class: `${stage}-story-class`,
  // discountTemplates: `${stage}-story-discount-templates`
};

export const MAILCHIMP_LIST_ID = process.env.MAILCHIMP_LIST_ID;
export const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY!;

export const SLACK_WEBHOOK_URL =
  "https://hooks.slack.com/services/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";

export const PRISMIC_URL = "https://story-ai.prismic.io/api/v2";

export const PRISMIC_TYPES = {
  course: "course",
  discountTemplate: "discount_template"
};

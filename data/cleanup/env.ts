import * as yaml from "js-yaml"; //yaml = require('js-yaml');
import * as fs from "fs";
import { MAILCHIMP_API_KEY } from "../../config";

export function setEnv() {
  // Get document, or throw exception on error
  try {
    var doc = yaml.safeLoad(fs.readFileSync("keys.yml", "utf8")) as {
      CENTURY_ADMIN_EMAIL: string;
      CENTURY_ADMIN_PASSWORD: string;
      STRIPE_SECRET_KEY: {
        dev: string;
        prod: string;
      };
      MAILCHIMP_API_KEY: string;
    };
    const env = {
      CENTURY_ADMIN_EMAIL: doc.CENTURY_ADMIN_EMAIL,
      CENTURY_ADMIN_PASSWORD: doc.CENTURY_ADMIN_PASSWORD,
      STRIPE_SECRET_KEY: doc.STRIPE_SECRET_KEY.dev,
      MAILCHIMP_API_KEY: doc.MAILCHIMP_API_KEY,
      CENTURY_ORG_ID: "0adee573-b3e3-46cf-a16b-32980590e2fe"
    };
    process.env = env;
  } catch (e) {}
}

import { getApi } from "prismic-javascript";
import { PRISMIC_URL } from "../config";
import axios from "axios";
import { isNullOrUndefined } from "util";

export function initApi() {
  return getApi(PRISMIC_URL, {
    // TODO: pass through a cookie from the client
    // req: req
  });
}

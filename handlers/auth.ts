import fetch from "node-fetch";
import jwt_decode = require("jwt-decode");

import { CENTURY_ADMIN_EMAIL, CENTURY_ADMIN_PASSWORD } from "../config";

let token: string | null = null;
let expiry: Date | null = null;

export const fetchToken: () => Promise<string> = () => {
  console.log("Fetching new token");

  return fetch("https://api.century.tech/accounts/v2/login-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: CENTURY_ADMIN_EMAIL,
      password: CENTURY_ADMIN_PASSWORD
    })
  })
    .then(response => response.json())
    .then(json => {
      const decoded = jwt_decode<{ exp: number }>(json.token);
      token = json.token;
      expiry = new Date(1000 * decoded.exp);
      return json.token;
    });
};

export const getToken: () => Promise<string> = () => {
  if (token === null || expiry === null || expiry <= new Date()) {
    return fetchToken();
  }
  console.log("fetched from cache");
  return Promise.resolve(token);
};

export const invalidateToken = () => {
  token = null;
  expiry = null;
};

import axios from "axios";
import { SLACK_WEBHOOK_URL } from "../config";

export function notify(text: string) {
  axios.post(SLACK_WEBHOOK_URL, {
    text,
    ...(process.env.STAGE === "prod"
      ? {}
      : {
          username: `Story [${process.env.STAGE}]`,
          channel: "#dev-notifications"
        })
  });
}

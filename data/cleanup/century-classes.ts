import { setEnv } from "./env";
setEnv();
import axios from "axios";
import { getToken } from "../../handlers/auth";
import { CENTURY_ORG_ID } from "../../config";

// get classes from Story
async function clean() {
  const token = await getToken();

  const classReq = await axios.get<{ _id: string; name: string }[]>(
    `https://api.century.tech/accounts/v2/classes?&orgs=${CENTURY_ORG_ID}&include=organisation,type`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    }
  );

  if (classReq.status !== 200)
    throw new Error("Could not fetch current classes");

  const classes = classReq.data.filter(
    c => c.name.match(/Story Class/) !== null
  );
  console.log(`${classes.length} possible classes`);

  const deletion = Promise.all(
    classes.map(async c => {
      const sgReq = await axios.get<{ _id: string }[]>(
        `https://api.century.tech/accounts/v2/study-groups?filters.classes=${
          c._id
        }`,
        {
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json"
          }
        }
      );
      if (sgReq.status !== 200)
        throw new Error("Could not get study groups for " + c._id);

      const deletions = sgReq.data.map(sg =>
        axios.delete(
          `https://api.century.tech/accounts/v2/study-groups/${sg._id}`,
          {
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json"
            }
          }
        )
      );
      return Promise.all(deletions).then(() =>
        axios.delete(
          `https://api.century.tech/accounts/v2/classes/${c._id}`,

          {
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json"
            }
          }
        )
      );
    })
  );
}

clean()
  .then(() => console.log("Done!"))
  .catch(e => console.error(e));

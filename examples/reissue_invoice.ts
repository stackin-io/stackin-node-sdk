// How to retry a previously issued invoice with the Stackin SDK.
import { Invoice, APIError, ConnectionFailedError } from "../src";

const INVOICE_ID = "00000000-0000-0000-0000-000000000000";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  try {
    const result = await client.reissue(INVOICE_ID);
    console.log("Reissued:", result);
  } catch (error) {
    if (error instanceof ConnectionFailedError) {
      console.error("Could not reach the platform");
      return;
    }
    if (error instanceof APIError) {
      console.error(`Request rejected (${error.statusCode}): ${error.detail}`);
      return;
    }
    throw error;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

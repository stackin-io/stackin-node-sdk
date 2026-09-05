// How to look up a fiscal document by its access key with the Stackin SDK.
import {
  Invoice,
  DocumentType,
  APIError,
  ConnectionFailedError,
} from "../src";

const ACCESS_KEY = "42250611222333000181550010000000011000000017";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  try {
    const result = await client.consult(ACCESS_KEY, {
      documentType: DocumentType.NFE,
    });
    console.log("Status:", result);
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

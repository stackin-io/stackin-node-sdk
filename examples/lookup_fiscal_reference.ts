// How to resolve an NCM, and how to find one you only half remember.
import { FiscalReference, APIError, ConnectionFailedError } from "../src";

async function main() {
  const client = new FiscalReference({ apiKey: process.env.STACKIN_API_KEY });

  try {
    const ncm = await client.ncm.get("84716052");
    console.log("NCM:", ncm.description);
    console.log("Extras:", ncm.metadata);

    const found = await client.ncm.search({ term: "teclado", limit: 5 });
    console.log(`\n${found.total} match 'teclado'; first page:`);
    for (const row of found.data as Array<Record<string, unknown>>) {
      console.log(" ", row.code, row.description);
    }

    console.log("\nClassifications available:", await client.kinds());

    const cfop = await client.kind("cfop").get("5102");
    console.log("Any kind by name:", cfop.description);
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

main();

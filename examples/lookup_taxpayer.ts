// How to look up who a CNPJ belongs to before invoicing it.
import { Taxpayer, APIError, ConnectionFailedError } from "../src";

async function main() {
  const client = new Taxpayer({ apiKey: process.env.STACKIN_API_KEY });

  try {
    const found = await client.get("00000000000191");
    console.log("Name:", found.name);
    console.log("Trade name:", found.trade_name);
    console.log("City code:", found.city_code, "State:", found.state);
  } catch (error) {
    if (error instanceof ConnectionFailedError) {
      console.error("Could not reach the platform");
      return;
    }
    if (error instanceof APIError) {
      if (error.statusCode === 404) {
        console.error(
          "The registry has no record of this tax id yet. It reloads " +
            "monthly, so a recently registered company is simply not in it " +
            "— this is not proof the company does not exist, and it is not " +
            "a validation rule."
        );
        return;
      }
      console.error(`Request rejected (${error.statusCode}): ${error.detail}`);
      return;
    }
    throw error;
  }
}

main();

// Only description/amount — service_code falls back to the company's fiscal profile.
import { Invoice, DocumentType, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const invoice = await client.issue({
    documentType: DocumentType.NFSE,
    clientName: "John Doe",
    taxId: "00000000000",
    items: [
      new br.Product({
        description: "Software development",
        amount: 5000.0,
      }),
    ],
  });

  console.log(invoice);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

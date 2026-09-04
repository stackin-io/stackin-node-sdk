// Only what NFE requires: description, amount, ncm, cfop.
import { Invoice, DocumentType, Address, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const invoice = await client.issue({
    documentType: DocumentType.NFE,
    clientName: "Buyer Company Ltd",
    taxId: "11111111111111",
    items: [
      new br.Product({
        description: "Produto basico",
        amount: 50.0,
        ncm: "84713012",
        cfop: "5102",
      }),
    ],
    recipientAddress: new Address({
      street: "Avenida Atlantica",
      number: "500",
      neighborhood: "Copacabana",
      city: "Rio de Janeiro",
      state: "RJ",
      zipCode: "22010000",
      cityCode: "3304557",
    }),
  });

  console.log(invoice);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

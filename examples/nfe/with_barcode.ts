import { Invoice, DocumentType, Address, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const product = new br.Product({
    description: "Produto com codigo de barras",
    amount: 29.9,
    ncm: "21069090",
    cfop: "5102",
    barcode: "7891000100103",
  });

  const result = await client.issue({
    documentType: DocumentType.NFE,
    clientName: "Comprador Teste Ltda",
    taxId: "11222333000181",
    items: [product],
    recipientAddress: new Address({
      street: "Rua das Palmeiras",
      number: "100",
      neighborhood: "Centro",
      city: "Florianopolis",
      state: "SC",
      zipCode: "88010000",
      cityCode: "4205407",
    }),
  });

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { Invoice, DocumentType, Address, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const product = new br.Product({
    description: "Produto importado",
    amount: 320.0,
    ncm: "85171231",
    cfop: "5102",
    exTipi: "01",
    importContentControlNumber: "550E8400-E29B-41D4-A716-446655440000",
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

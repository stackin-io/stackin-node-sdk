import { Invoice, DocumentType, Address, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const product = new br.Product({
    description: "Produto vinculado a pedido de compra",
    amount: 75.0,
    ncm: "84433210",
    cfop: "5102",
    purchaseOrder: "PC-2026-00042",
    purchaseOrderItem: "1",
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

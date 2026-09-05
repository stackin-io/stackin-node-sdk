import { Invoice, DocumentType, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const product = new br.Product({
    description: "Monthly support and maintenance",
    amount: 800.0,
    serviceCode: "1.07",
    serviceDiscount: 50.0,
  });

  const result = await client.issue({
    documentType: DocumentType.NFSE,
    clientName: "Comprador Teste Ltda",
    taxId: "11222333000181",
    items: [product],
  });

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

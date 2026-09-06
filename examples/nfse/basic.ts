import { Invoice, DocumentType, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const product = new br.Product({
    description: "Software development SDK Node",
    amount: 5000.0,
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

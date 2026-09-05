import { Invoice, DocumentType, Address, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const product = new br.Product({
    description: "UI/UX design",
    amount: 3200.0,
    serviceCode: "1.03",
    taxRetained: true,
  });

  const result = await client.issue({
    documentType: DocumentType.NFSE,
    clientName: "Comprador Teste Ltda",
    taxId: "11222333000181",
    items: [product],
    recipientAddress: new Address({
      street: "Rua das Flores",
      number: "123",
      neighborhood: "Centro",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01310100",
      cityCode: "3550308",
    }),
  });

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

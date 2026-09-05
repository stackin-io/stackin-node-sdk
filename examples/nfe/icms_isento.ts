import { Invoice, DocumentType, Address, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const product = new br.Product({
    description: "Rosa Holambra Vermelha",
    amount: 112.44,
    ncm: "06031100",
    cfop: "6108",
    quantity: 6,
    freight: 11.05,
    tax: {
      icms: { ICMSSN102: { orig: "0", CSOSN: "400" } },
      pis: { PISNT: { CST: "07" } },
      cofins: { COFINSNT: { CST: "07" } },
    },
  });

  const result = await client.issue({
    documentType: DocumentType.NFE,
    clientName: "Comprador Teste Ltda",
    taxId: "11222333000181",
    items: [product],
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

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { Invoice, DocumentType, Address, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const product = new br.Product({
    description: "Plastico celofane 50x50",
    amount: 0.27,
    ncm: "39202019",
    cfop: "6108",
    freight: 0.03,
    tax: {
      icms: { ICMSSN102: { orig: "0", CSOSN: "102" } },
      pis: {
        PISAliq: {
          CST: "01",
          vBC: "0.30",
          pPIS: "0.6500",
          vPIS: "0.00",
        },
      },
      cofins: {
        COFINSAliq: {
          CST: "01",
          vBC: "0.30",
          pCOFINS: "3.0000",
          vCOFINS: "0.01",
        },
      },
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

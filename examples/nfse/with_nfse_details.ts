import { Invoice, DocumentType, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const result = await client.issue({
    documentType: DocumentType.NFSE,
    clientName: "Comprador Teste Ltda",
    taxId: "11222333000181",
    recipientMunicipalRegistration: "123456",
    items: [
      new br.Product({
        description: "Consultoria em tecnologia",
        unitPrice: 1500.0,
        serviceCode: "1.07",
        nbs: "1.1502.10.00",
        municipalServiceCode: "001",
        internalCode: "CONS01",
        conditionalDiscount: 50,
      }),
    ],
    nfse: {
      competenceDate: new Date().toISOString().slice(0, 10),
      approximateTaxes: {
        federalPercent: 13.45,
        statePercent: 0,
        municipalPercent: 2,
      },
      iss: { rate: 2.5, retention: "none" },
    },
  });

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

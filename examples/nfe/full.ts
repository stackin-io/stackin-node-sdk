// Every field NFE accepts on a single item.
import { Invoice, DocumentType, Address, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const invoice = await client.issue({
    documentType: DocumentType.NFE,
    clientName: "Buyer Company Ltd",
    taxId: "11111111111111",
    items: [
      new br.Product({
        description: "Produto completo",
        amount: 199.9,
        unit: "UN",
        quantity: 2,
        ncm: "84713012",
        cfop: "5102",
        cest: "2104900",
        barcode: "7891234567890",
        freight: 10.0,
        insurance: 2.5,
        discount: 5.0,
        otherExpenses: 1.0,
        purchaseOrder: "PO-42",
        purchaseOrderItem: "1",
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

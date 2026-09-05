import { Invoice, DocumentType, Address, br } from "../../src";

async function main() {
  const client = new Invoice({ apiKey: process.env.STACKIN_API_KEY });

  const product = new br.Product({
    description: "Urso de Pelucia Dudu",
    amount: 92.72,
    ncm: "95030031",
    cfop: "6108",
    freight: 9.12,
    tax: {
      icms: {
        ICMSSN900: {
          orig: "0",
          CSOSN: "900",
          modBC: "3",
          vBC: "101.84",
          pICMS: "12.0000",
          vICMS: "12.22",
        },
      },
      icms_uf_dest: {
        vBCUFDest: "101.84",
        pICMSUFDest: "17.0000",
        pICMSInter: "12.00",
        pICMSInterPart: "100.0000",
        vICMSUFDest: "5.09",
        vICMSUFRemet: "0.00",
      },
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

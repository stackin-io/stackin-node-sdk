import { beforeEach, describe, expect, it } from "vitest";

import {
  Address,
  DocumentType,
  Invoice,
  InvoiceDetail,
  Items,
  ValidationError,
  br,
  type IssueRequest,
} from "../src";

type Body = Record<string, unknown> & {
  items: Array<{ product: Record<string, unknown> }>;
  transport: { volumes: Array<Record<string, unknown>> };
};

type Call = { method: string; url: string; body?: Body };

let calls: Call[];

beforeEach(() => {
  calls = [];
});

function fakeFetch(status = 200, reply: unknown = { result: {} }) {
  return (async (input: string, init: RequestInit) => {
    calls.push({
      method: String(init.method),
      url: String(input),
      body:
        init.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
}

function invoice(reply: unknown = { result: {} }) {
  return new Invoice({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: fakeFetch(200, reply),
  });
}

const address = new Address({
  street: "Rua A",
  number: "1",
  neighborhood: "Centro",
  city: "Sao Paulo",
  state: "SP",
  zipCode: "01000000",
});

function request(extra: Partial<IssueRequest> = {}): IssueRequest {
  return {
    documentType: DocumentType.NFE,
    clientName: "Maria",
    taxId: "12345678909",
    recipientAddress: address,
    items: [
      new br.Product({
        description: "Cafe",
        unitPrice: 10,
        ncm: "09012100",
        cfop: "5102",
      }),
    ],
    ...extra,
  };
}

describe("sale terms on issue", () => {
  it("omits every term when unset", async () => {
    await invoice().issue(request());

    for (const key of [
      "presence",
      "intermediary",
      "transport",
      "payments",
      "change",
    ]) {
      expect(calls[0].body).not.toHaveProperty(key);
    }
  });

  it("sends every term under the API snake_case names", async () => {
    await invoice().issue(
      request({
        presence: "2",
        intermediary: { taxId: "11222333000181", identifier: "loja-42" },
        transport: {
          freightMode: "0",
          volumes: [
            {
              quantity: 2,
              species: "CAIXA",
              brand: "ACME",
              numbering: "1-2",
              netWeight: 1.5,
              grossWeight: "1.750",
            },
          ],
        },
        payments: [
          {
            method: "03",
            amount: 12.5,
            card: {
              integration: "1",
              taxId: "11222333000181",
              brand: "01",
              authorization: "A1B2C3",
            },
          },
          { method: "99", amount: "2.00", description: "Vale troca" },
        ],
        change: 4.5,
      })
    );

    expect(calls[0].body).toMatchObject({
      presence: "2",
      intermediary: { tax_id: "11222333000181", identifier: "loja-42" },
      transport: {
        freight_mode: "0",
        volumes: [
          {
            quantity: 2,
            species: "CAIXA",
            brand: "ACME",
            numbering: "1-2",
            net_weight: "1.5",
            gross_weight: "1.750",
          },
        ],
      },
      payments: [
        {
          method: "03",
          amount: "12.5",
          card: {
            integration: "1",
            tax_id: "11222333000181",
            brand: "01",
            authorization: "A1B2C3",
          },
        },
        { method: "99", amount: "2.00", description: "Vale troca" },
      ],
      change: "4.5",
    });
  });

  it("keeps an empty volume list, which writes none", async () => {
    await invoice().issue(
      request({ transport: { freightMode: "9", volumes: [] } })
    );

    expect(calls[0].body?.transport).toEqual({
      freight_mode: "9",
      volumes: [],
    });
  });

  it("sends product weights on the line", async () => {
    await invoice().issue(
      request({
        items: [
          new br.Product({
            description: "Cafe",
            unitPrice: 10,
            ncm: "09012100",
            cfop: "5102",
            netWeight: 0.5,
            grossWeight: 0.52,
          }),
        ],
      })
    );

    expect(calls[0].body?.items[0].product).toMatchObject({
      net_weight: 0.5,
      gross_weight: 0.52,
    });
  });

  it("does not leak the idempotency key into the terms", async () => {
    await invoice().issue(request({ presence: "1", idempotencyKey: "k-1" }));

    expect(calls[0].body).not.toHaveProperty("idempotencyKey");
    expect(calls[0].body).not.toHaveProperty("idempotency_key");
  });

  it("validate() carries the terms too", async () => {
    await invoice({ valid: true, errors: [], warnings: [] }).validate(
      request({ change: "1.00" })
    );

    expect(calls[0].url).toContain("/invoices/validate");
    expect(calls[0].body?.change).toBe("1.00");
  });
});

describe("sale terms validation", () => {
  const refuses = async (extra: Partial<IssueRequest>, text: RegExp) => {
    await expect(invoice().issue(request(extra))).rejects.toThrow(text);
    await expect(invoice().issue(request(extra))).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(calls).toHaveLength(0);
  };

  it("refuses a presence outside the code set", () =>
    refuses({ presence: "7" as never }, /presence must be one of/));

  it("refuses a freight mode outside the code set", () =>
    refuses(
      { transport: { freightMode: "5" as never } },
      /transport.freightMode/
    ));

  it("refuses a payment method that is not two digits", () =>
    refuses(
      { payments: [{ method: "6" as never, amount: 1 }] },
      /payments\[0\].method must be two digits/
    ));

  it("refuses more than 100 payments", () =>
    refuses(
      {
        payments: Array.from({ length: 101 }, () => ({
          method: "01",
          amount: 1,
        })),
      },
      /at most 100/
    ));

  it("accepts weights with any decimal places", async () => {
    await invoice().issue(
      request({
        transport: {
          freightMode: "0",
          volumes: [{ netWeight: "1.23456789" }],
        },
      })
    );
    expect(calls[0].body?.transport.volumes[0].net_weight).toBe("1.23456789");
  });

  it("leaves the NFS-e refusal to the API", async () => {
    await invoice().issue(
      request({ documentType: DocumentType.NFSE, presence: "1" })
    );
    expect(calls[0].body?.presence).toBe("1");
  });

  it("requires description for method 99", () =>
    refuses(
      { payments: [{ method: "99", amount: 1 }] },
      /description is required for method 99/
    ));

  it("refuses a negative weight", () =>
    refuses(
      { transport: { freightMode: "0", volumes: [{ grossWeight: -1 }] } },
      /grossWeight/
    ));

  it("refuses a short intermediary identifier", () =>
    refuses(
      { intermediary: { taxId: "11222333000181", identifier: "x" } },
      /identifier must be 2 to 60/
    ));

  it("refuses a negative product weight", () => {
    expect(
      () => new br.Product({ description: "Cafe", grossWeight: -0.1 })
    ).toThrow(/grossWeight must be a number of at least 0/);
  });
});

describe("stored terms on the invoice detail", () => {
  it("parses the real detail shape", async () => {
    const detail = {
      id: "d9f6",
      document_type: "nfe",
      access_key: null,
      status: "authorized",
      client_name: "Maria",
      tax_id: "12345678909",
      description: "Cafe",
      amount: 10.0,
      cancel_reason: null,
      external_reference: null,
      fiscal_operation: null,
      items: null,
      recipient_address: { street: "Rua A" },
      client_email: null,
      client_phone: null,
      presence: "2",
      intermediary: { tax_id: "11222333000181", identifier: "loja-42" },
      transport: {
        freight_mode: "0",
        volumes: [{ quantity: 1, net_weight: "1.500", gross_weight: "1.750" }],
      },
      payments: [
        { method: "03", amount: "10.00", card: { integration: "2" } },
      ],
      change: "0.00",
      created_at: "2026-11-23T10:00:00Z",
      updated_at: "2026-11-23T10:00:00Z",
    };
    const result = (await invoice({ result: detail }).consult("K", {
      documentType: DocumentType.NFE,
    })) as unknown as InvoiceDetail;

    expect(result.presence).toBe("2");
    expect(result.intermediary?.tax_id).toBe("11222333000181");
    expect(result.transport?.volumes?.[0].net_weight).toBe("1.500");
    expect(result.payments?.[0].card?.integration).toBe("2");
    expect(result.change).toBe("0.00");
  });
});

describe("catalog item weights and IBS/CBS", () => {
  function items(reply: unknown = {}) {
    return new Items({
      apiKey: "k",
      baseUrl: "https://sdk.test",
      fetch: fakeFetch(200, reply),
    });
  }

  it("sends the four fields by their API names", async () => {
    await items().create({
      kind: "product",
      description: "Cafe",
      netWeight: 0.5,
      grossWeight: "0.512345",
      ibsCbsCst: "000",
      ibsCbsClass: "000001",
    });

    expect(calls[0].body).toMatchObject({
      net_weight: "0.5",
      gross_weight: "0.512345",
      ibs_cbs_cst: "000",
      ibs_cbs_class: "000001",
    });
  });

  it("omits them when unset", async () => {
    await items().create({ kind: "product", description: "Cafe" });

    for (const key of [
      "net_weight",
      "gross_weight",
      "ibs_cbs_cst",
      "ibs_cbs_class",
    ]) {
      expect(calls[0].body).not.toHaveProperty(key);
    }
  });

  it("clears them with null on update", async () => {
    await items().update("i1", {
      netWeight: null,
      ibsCbsCst: null,
      ibsCbsClass: null,
    });

    expect(calls[0].body).toEqual({
      net_weight: null,
      ibs_cbs_cst: null,
      ibs_cbs_class: null,
    });
  });

  it("reads the fields back", async () => {
    const item = await items({
      result: { id: "i1", net_weight: 0.5, ibs_cbs_cst: "000" },
    }).get("i1");

    expect(item.net_weight).toBe(0.5);
    expect(item.ibs_cbs_cst).toBe("000");
  });

  it("refuses a negative weight", async () => {
    await expect(
      items().create({ kind: "product", description: "Cafe", netWeight: -1 })
    ).rejects.toThrow(/netWeight must be a number of at least 0/);
    expect(calls).toHaveLength(0);
  });
});

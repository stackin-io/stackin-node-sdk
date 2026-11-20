import { beforeEach, describe, expect, it } from "vitest";

import {
  APIError,
  COMPANY_HEADER,
  DocumentType,
  FiscalReference,
  Invoice,
  ValidationError,
  br,
} from "../src";

const BASE = "https://sdk.test/api/v1";
const INVOICE_ID = "9f0e1d2c-3b4a-5968-7766-554433221100";

type Call = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
};

let calls: Call[];

beforeEach(() => {
  calls = [];
});

function fakeFetch(status = 200, reply: unknown = {}): typeof fetch {
  return (async (input: string, init: RequestInit) => {
    calls.push({
      method: String(init.method),
      url: String(input),
      headers: init.headers as Record<string, string>,
      body:
        init.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return new Response(status === 204 ? null : JSON.stringify(reply), {
      status,
    });
  }) as unknown as typeof fetch;
}

function invoice(status = 200, reply: unknown = {}, company?: string) {
  return new Invoice({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: fakeFetch(status, reply),
    company,
  });
}

function reference(status = 200, reply: unknown = []) {
  return new FiscalReference({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: fakeFetch(status, reply),
  });
}

describe("stats", () => {
  it("sends no params without days", async () => {
    await invoice().stats();

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/invoices/stats`);
  });

  it("sends days and returns the counts", async () => {
    const result = await invoice(200, { total: 3, period_days: 7 }).stats({
      days: 7,
    });

    expect(calls[0].url).toBe(`${BASE}/invoices/stats?days=7`);
    expect(result.total).toBe(3);
  });

  it("refuses days outside 1 to 365 before the call", async () => {
    for (const days of [0, 366, 1.5]) {
      await expect(invoice().stats({ days })).rejects.toThrow(ValidationError);
    }
    expect(calls).toHaveLength(0);
  });

  it("names the company", async () => {
    await invoice().stats({ company: "acme" });

    expect(calls[0].headers[COMPANY_HEADER]).toBe("acme");
  });
});

describe("readiness", () => {
  it("reads the company", async () => {
    const reply = { ready: false, missing: ["certificate"] };
    const result = await invoice(200, reply).readiness();

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/company`);
    expect(result).toEqual(reply);
  });

  it("takes a per-call company over the client's", async () => {
    await invoice(200, {}, "mine").readiness({ company: "other" });

    expect(calls[0].headers[COMPANY_HEADER]).toBe("other");
  });
});

describe("rejection", () => {
  it("reads the explanation by invoice id", async () => {
    const reply = { code: "539", explanation: "duplicated", steps: [] };
    const result = await invoice(200, reply).rejection(INVOICE_ID);

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/invoices/${INVOICE_ID}/rejection`);
    expect(result).toEqual(reply);
  });

  it("keeps the invoice id one path segment", async () => {
    await invoice().rejection("a/b");

    expect(calls[0].url).toBe(`${BASE}/invoices/a%2Fb/rejection`);
  });

  it("refuses the dot segments", async () => {
    for (const id of ["", ".", ".."]) {
      await expect(invoice().rejection(id)).rejects.toThrow(ValidationError);
    }
    expect(calls).toHaveLength(0);
  });

  it("surfaces a 409 for a document that is not rejected", async () => {
    await expect(
      invoice(409, { detail: "Invoice is not rejected." }).rejection(
        INVOICE_ID
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("submissions path", () => {
  it("keeps the invoice id one path segment", async () => {
    await invoice(200, []).submissions("a/b");

    expect(calls[0].url).toBe(`${BASE}/invoices/a%2Fb/submissions`);
  });

  it("refuses the dot segments", async () => {
    await expect(invoice(200, []).submissions("..")).rejects.toThrow(
      ValidationError
    );
    expect(calls).toHaveLength(0);
  });
});

describe("classify", () => {
  it("sends the description and document type in snake_case", async () => {
    const reply = { primary_candidate: { ncm: "22030000" } };
    const result = await invoice(200, reply).classify({
      description: "Cerveja artesanal IPA 500ml",
      documentType: DocumentType.NFE,
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/ai/classify`);
    expect(calls[0].body).toEqual({
      description: "Cerveja artesanal IPA 500ml",
      document_type: "nfe",
    });
    expect(result).toEqual(reply);
  });

  it("uppercases the state and passes the answers", async () => {
    await invoice().classify({
      description: "Consultoria",
      documentType: DocumentType.NFSE,
      recipientState: "sp",
      answers: { purpose: "resale" },
      company: "acme",
    });

    expect(calls[0].body).toEqual({
      description: "Consultoria",
      document_type: "nfse",
      recipient_state: "SP",
      answers: { purpose: "resale" },
    });
    expect(calls[0].headers[COMPANY_HEADER]).toBe("acme");
  });

  it("leaves empty answers out", async () => {
    await invoice().classify({
      description: "Consultoria",
      documentType: DocumentType.NFSE,
      answers: {},
    });

    expect(calls[0].body).not.toHaveProperty("answers");
  });

  it("refuses a description outside 3 to 500 characters", async () => {
    for (const description of ["ab", "x".repeat(501)]) {
      await expect(
        invoice().classify({ description, documentType: DocumentType.NFE })
      ).rejects.toThrow(/description/);
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses a state that is not two letters", async () => {
    await expect(
      invoice().classify({
        description: "Cerveja",
        documentType: DocumentType.NFE,
        recipientState: "SPX",
      })
    ).rejects.toThrow(/recipientState/);
    expect(calls).toHaveLength(0);
  });

  it("refuses an unknown document type", async () => {
    await expect(
      invoice().classify({
        description: "Cerveja",
        documentType: "nfce" as DocumentType,
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe("invalidations", () => {
  it("lists the first page without params", async () => {
    const reply = { items: [], total: 0 };
    const result = await invoice(200, reply).invalidations();

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/invoices/invalidations`);
    expect(result).toEqual(reply);
  });

  it("sends the page in snake_case", async () => {
    await invoice().invalidations({
      limit: 20,
      offset: 40,
      sortBy: "created_at",
      orderBy: "asc",
      company: "acme",
    });

    expect(calls[0].url).toBe(
      `${BASE}/invoices/invalidations?limit=20&offset=40&sort_by=created_at&order_by=asc`
    );
    expect(calls[0].headers[COMPANY_HEADER]).toBe("acme");
  });
});

describe("issue contingency", () => {
  const nfse = () =>
    new br.Product({
      description: "Consultoria",
      quantity: 1,
      unitPrice: 100,
    });

  it("sends contingency only when true", async () => {
    await invoice().issue({
      documentType: DocumentType.NFSE,
      clientName: "Acme",
      taxId: "00000000000191",
      items: [nfse()],
      contingency: true,
    });

    expect((calls[0].body as Record<string, unknown>).contingency).toBe(true);
  });

  it("leaves it out otherwise", async () => {
    for (const contingency of [undefined, false]) {
      calls = [];
      await invoice().issue({
        documentType: DocumentType.NFSE,
        clientName: "Acme",
        taxId: "00000000000191",
        items: [nfse()],
        contingency,
      });

      expect(calls[0].body).not.toHaveProperty("contingency");
    }
  });
});

describe("FiscalReference.cities", () => {
  it("searches by name in the client's country", async () => {
    const rows = [
      { country: "BR", code: "3550308", name: "São Paulo", state: "SP" },
    ];
    const result = await reference(200, rows).cities("são");

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(
      `${BASE}/cities?name=${encodeURIComponent("são")}&country=BR`
    );
    expect(result).toEqual(rows);
  });

  it("uppercases the state and takes a country", async () => {
    await reference().cities("santa rita", { state: "sp", country: "BR" });

    expect(calls[0].url).toBe(
      `${BASE}/cities?name=santa+rita&country=BR&state=SP`
    );
  });

  it("refuses a name outside 2 to 100 characters", async () => {
    for (const name of ["a", "x".repeat(101)]) {
      await expect(reference().cities(name)).rejects.toThrow(/name/);
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses a state that is not two letters", async () => {
    await expect(reference().cities("santa", { state: "S" })).rejects.toThrow(
      /state/
    );
  });

  it("refuses an answer that is not a list", async () => {
    await expect(
      reference(200, { items: [] }).cities("santa")
    ).rejects.toThrow(/expected a list/);
  });

  it("surfaces an API refusal", async () => {
    await expect(
      reference(422, { detail: "bad" }).cities("santa")
    ).rejects.toBeInstanceOf(APIError);
  });
});

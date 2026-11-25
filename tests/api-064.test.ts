import { beforeEach, describe, expect, it } from "vitest";

import {
  Address,
  DocumentType,
  FiscalReference,
  Invoice,
  IssueRequest,
  ValidationError,
  br,
} from "../src";
import type { NbsSuggestions } from "../src";

type Call = {
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
};

let calls: Call[];

beforeEach(() => {
  calls = [];
});

function fakeFetch(reply: unknown): typeof fetch {
  return (async (input: string, init: RequestInit) => {
    calls.push({
      url: String(input),
      headers: init.headers as Record<string, string>,
      body:
        init.body === undefined
          ? undefined
          : (JSON.parse(String(init.body)) as Record<string, unknown>),
    });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as unknown as typeof fetch;
}

const invoice = (reply: unknown = {}) =>
  new Invoice({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: fakeFetch(reply),
  });

const domestic = new Address({
  street: "Rua A",
  number: "10",
  neighborhood: "Centro",
  city: "Sao Paulo",
  state: "SP",
  zipCode: "01001000",
});

const nfe = (fields: Partial<IssueRequest> = {}): IssueRequest => ({
  documentType: DocumentType.NFE,
  clientName: "Buyer Ltda",
  taxId: "11111111111111",
  items: [
    new br.Product({
      description: "Teclado",
      amount: 100,
      ncm: "84716052",
      cfop: "5102",
    }),
  ],
  recipientAddress: domestic,
  contingency: true,
  ...fields,
});

describe("NbsSuggestions", () => {
  it("reads the new fields", async () => {
    const reply = {
      service_code: "010701",
      suggestions: [
        {
          nbs: "115021000",
          description: "Servicos",
          operation_indicator: "010101",
          ibs_cbs_classification: "200034",
          classification_name: "Reducao",
          classification_cst: "200",
          reduction_ibs: 60,
          reduction_cbs: null,
          legal_reference: "Art. 129 da LC 214/2025",
          incidence: "Local do fornecedor",
          operation_variants: { free_abroad: "010401" },
        },
      ],
      source: { path: "x", date: null },
    };
    const client = new FiscalReference({
      apiKey: "k",
      baseUrl: "https://sdk.test",
      fetch: fakeFetch(reply),
    });
    const result: NbsSuggestions = await client.nbsSuggestions("1.07");
    const found = result.suggestions[0];
    expect(found.classification_cst).toBe("200");
    expect(found.reduction_ibs).toBe(60);
    expect(found.reduction_cbs).toBeNull();
    expect(found.legal_reference).toBe("Art. 129 da LC 214/2025");
    expect(found.incidence).toBe("Local do fornecedor");
    expect(found.operation_variants?.free_abroad).toBe("010401");
  });
});

describe("issue() contingency moment and reason", () => {
  it("sends both beside contingency", async () => {
    await invoice().issue(
      nfe({
        contingencyStartedAt: "2026-11-25T09:00:00-03:00",
        contingencyReason: "SEFAZ authorizer unavailable",
      })
    );
    expect(calls[0].body).toMatchObject({
      contingency: true,
      contingency_started_at: "2026-11-25T09:00:00-03:00",
      contingency_reason: "SEFAZ authorizer unavailable",
    });
  });

  it("sends a Date as its UTC instant", async () => {
    await invoice().issue(
      nfe({ contingencyStartedAt: new Date("2026-11-25T12:00:00Z") })
    );
    expect(calls[0].body?.contingency_started_at).toBe(
      "2026-11-25T12:00:00.000Z"
    );
  });

  it("leaves them out when unset", async () => {
    await invoice().issue(nfe());
    expect(calls[0].body).not.toHaveProperty("contingency_started_at");
    expect(calls[0].body).not.toHaveProperty("contingency_reason");
  });

  it("refuses a start without an offset", async () => {
    await expect(
      invoice().issue(nfe({ contingencyStartedAt: "2026-11-25T09:00:00" }))
    ).rejects.toThrow(ValidationError);
  });

  it("validate() takes them too", async () => {
    await invoice({ valid: true, errors: [], warnings: [] }).validate(
      nfe({ contingencyReason: "SEFAZ authorizer unavailable" })
    );
    expect(calls[0].body?.contingency_reason).toBe(
      "SEFAZ authorizer unavailable"
    );
  });
});

describe("Accept-Language", () => {
  it("is sent on classify with the origin answer", async () => {
    await invoice().classify({
      description: "Camiseta de algodao",
      documentType: DocumentType.NFE,
      answers: { origin: "resale" },
      acceptLanguage: "en",
    });
    expect(calls[0].headers["Accept-Language"]).toBe("en");
    expect(calls[0].body?.answers).toEqual({ origin: "resale" });
    expect(calls[0].body).not.toHaveProperty("acceptLanguage");
  });

  it("is sent on the received list", async () => {
    await invoice({ data: [] }).received({ limit: 5, acceptLanguage: "es" });
    expect(calls[0].headers["Accept-Language"]).toBe("es");
    expect(calls[0].url).toContain("limit=5");
  });

  it("is absent when unset", async () => {
    await invoice({ data: [] }).received();
    expect(calls[0].headers["Accept-Language"]).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  Dispatcher,
} from "undici";

import {
  Address,
  APIError,
  ConnectionFailedError,
  DEFAULT_BASE_URL,
  DocumentType,
  Invoice,
  Manifestation,
  ValidationError,
  br,
} from "../src";

let agent: MockAgent;
let originalDispatcher: Dispatcher;

beforeEach(() => {
  delete process.env.STACKIN_BASE_URL;
  delete process.env.STACKIN_API_KEY;
  originalDispatcher = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  await agent.close();
  setGlobalDispatcher(originalDispatcher);
});

const nfeAddress = new Address({
  street: "Rua A",
  number: "1",
  neighborhood: "Centro",
  city: "Sao Paulo",
  state: "SP",
  zipCode: "01000000",
  cityCode: "3550308",
});

describe("Invoice construction", () => {
  it("defaults to the public base URL when nothing is set", () => {
    const client = new Invoice();
    expect(client.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("reads STACKIN_BASE_URL when set", () => {
    process.env.STACKIN_BASE_URL = "https://from-env.example";
    const client = new Invoice();
    expect(client.baseUrl).toBe("https://from-env.example");
  });

  it("explicit baseUrl option overrides both defaults and env vars", () => {
    process.env.STACKIN_BASE_URL = "https://from-env.example";
    const client = new Invoice({ baseUrl: "https://explicit.example" });
    expect(client.baseUrl).toBe("https://explicit.example");
  });
});

describe("Auth header", () => {
  it("sends Bearer token when an api key is set", async () => {
    let seenAuth: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, (req) => {
        const headers = req.headers as Record<string, string>;
        seenAuth = headers.authorization ?? headers.Authorization;
        return { result: { ok: true } };
      });

    const client = new Invoice({ apiKey: "secret" });
    await client.issue({
      documentType: DocumentType.NFSE,
      clientName: "John",
      taxId: "1",
      items: [new br.Product({ description: "svc", amount: 10 })],
    });
    expect(seenAuth).toBe("Bearer secret");
  });

  it("omits Authorization header when no api key is set", async () => {
    let seenAuth: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, (req) => {
        const headers = req.headers as Record<string, string>;
        seenAuth = headers.authorization ?? headers.Authorization;
        return { result: {} };
      });

    const client = new Invoice();
    await client.issue({
      documentType: DocumentType.NFSE,
      clientName: "John",
      taxId: "1",
      items: [new br.Product({ description: "svc", amount: 10 })],
    });
    expect(seenAuth).toBeUndefined();
  });
});

describe("issue() validation", () => {
  it("throws ValidationError when items is empty", async () => {
    const client = new Invoice({ apiKey: "k" });
    await expect(
      client.issue({
        documentType: DocumentType.NFSE,
        clientName: "n",
        taxId: "1",
        items: [],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("NFE requires ncm and cfop on every item", async () => {
    const client = new Invoice({ apiKey: "k" });
    await expect(
      client.issue({
        documentType: DocumentType.NFE,
        clientName: "n",
        taxId: "1",
        items: [new br.Product({ description: "x", amount: 10 })],
        recipientAddress: nfeAddress,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("NFSE does not require ncm/cfop", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, { result: {} });
    const client = new Invoice({ apiKey: "k" });
    await expect(
      client.issue({
        documentType: DocumentType.NFSE,
        clientName: "n",
        taxId: "1",
        items: [new br.Product({ description: "s", amount: 10 })],
      })
    ).resolves.toBeDefined();
  });

  it("NFE requires recipientAddress", async () => {
    const client = new Invoice({ apiKey: "k" });
    await expect(
      client.issue({
        documentType: DocumentType.NFE,
        clientName: "n",
        taxId: "1",
        items: [
          new br.Product({
            description: "x",
            amount: 10,
            ncm: "84713012",
            cfop: "5102",
          }),
        ],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("Request/response", () => {
  it("unwraps the result field on a 2xx response", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, { result: { access_key: "ABC" } });

    const client = new Invoice({ apiKey: "k" });
    const out = await client.issue({
      documentType: DocumentType.NFSE,
      clientName: "n",
      taxId: "1",
      items: [new br.Product({ description: "s", amount: 10 })],
    });
    expect(out).toEqual({ access_key: "ABC" });
  });

  it("raises APIError on a non-2xx response", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(422, { detail: "invalid tax_id" });

    const client = new Invoice({ apiKey: "k" });
    try {
      await client.issue({
        documentType: DocumentType.NFSE,
        clientName: "n",
        taxId: "1",
        items: [new br.Product({ description: "s", amount: 10 })],
      });
      throw new Error("expected APIError");
    } catch (err) {
      expect(err).toBeInstanceOf(APIError);
      expect((err as APIError).statusCode).toBe(422);
      expect((err as APIError).detail).toBe("invalid tax_id");
    }
  });

  it("raises ConnectionFailedError when the host is unreachable", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .replyWithError(new Error("ECONNREFUSED"));

    const client = new Invoice({ apiKey: "k" });
    await expect(
      client.issue({
        documentType: DocumentType.NFSE,
        clientName: "n",
        taxId: "1",
        items: [new br.Product({ description: "s", amount: 10 })],
      })
    ).rejects.toBeInstanceOf(ConnectionFailedError);
  });

  it("cancel() sends reason and document_type in the body", async () => {
    let seenBody: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices/AK/cancel", method: "POST" })
      .reply(200, (req) => {
        seenBody = req.body as string;
        return { result: {} };
      });

    const client = new Invoice({ apiKey: "k" });
    await client.cancel("AK", {
      documentType: DocumentType.NFSE,
      reason: "typo",
    });
    expect(JSON.parse(seenBody ?? "{}")).toEqual({
      document_type: "nfse",
      reason: "typo",
    });
  });

  it("reissue() posts to the invoice id, with no body", async () => {
    let seenBody: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices/INV-1/reissue", method: "POST" })
      .reply(200, (req) => {
        seenBody = req.body as string;
        return { result: { status: "authorized" } };
      });

    const client = new Invoice({ apiKey: "k" });
    const result = await client.reissue("INV-1");

    expect(seenBody ?? "").toBe("");
    expect(result).toEqual({ status: "authorized" });
  });

  it("reissue() surfaces a 404 as an APIError", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices/nope/reissue", method: "POST" })
      .reply(404, { detail: "Invoice not found" });

    const client = new Invoice({ apiKey: "k" });
    await expect(client.reissue("nope")).rejects.toBeInstanceOf(APIError);
  });
});

describe("Idempotency-Key", () => {
  it("issue() sends the header when a key is given", async () => {
    let seenKey: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, (req) => {
        const headers = req.headers as Record<string, string>;
        seenKey = headers["idempotency-key"] ?? headers["Idempotency-Key"];
        return { result: { ok: true } };
      });

    const client = new Invoice({ apiKey: "k" });
    await client.issue({
      documentType: DocumentType.NFSE,
      clientName: "John",
      taxId: "1",
      items: [new br.Product({ description: "svc", amount: 10 })],
      idempotencyKey: "idem-1",
    });

    expect(seenKey).toBe("idem-1");
  });

  it("issue() omits the header by default", async () => {
    let seenKey: string | undefined;
    let seenBody: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, (req) => {
        const headers = req.headers as Record<string, string>;
        seenKey = headers["idempotency-key"] ?? headers["Idempotency-Key"];
        seenBody = req.body as string;
        return { result: { ok: true } };
      });

    const client = new Invoice({ apiKey: "k" });
    await client.issue({
      documentType: DocumentType.NFSE,
      clientName: "John",
      taxId: "1",
      items: [new br.Product({ description: "svc", amount: 10 })],
    });

    expect(seenKey).toBeUndefined();
    expect(JSON.parse(seenBody ?? "{}")).not.toHaveProperty("idempotencyKey");
  });

  it("keeps the key out of the request body", async () => {
    let seenBody: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, (req) => {
        seenBody = req.body as string;
        return { result: { ok: true } };
      });

    const client = new Invoice({ apiKey: "k" });
    await client.issue({
      documentType: DocumentType.NFSE,
      clientName: "John",
      taxId: "1",
      items: [new br.Product({ description: "svc", amount: 10 })],
      idempotencyKey: "idem-1",
    });

    expect(JSON.parse(seenBody ?? "{}")).not.toHaveProperty("idempotencyKey");
  });

  it("reissue() sends the header when a key is given", async () => {
    let seenKey: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices/INV-1/reissue", method: "POST" })
      .reply(200, (req) => {
        const headers = req.headers as Record<string, string>;
        seenKey = headers["idempotency-key"] ?? headers["Idempotency-Key"];
        return { result: { status: "authorized" } };
      });

    const client = new Invoice({ apiKey: "k" });
    await client.reissue("INV-1", { idempotencyKey: "idem-2" });

    expect(seenKey).toBe("idem-2");
  });

  it("surfaces a replayed-key conflict as an APIError", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(409, { detail: "still in progress" });

    const client = new Invoice({ apiKey: "k" });
    await expect(
      client.issue({
        documentType: DocumentType.NFSE,
        clientName: "John",
        taxId: "1",
        items: [new br.Product({ description: "svc", amount: 10 })],
        idempotencyKey: "idem-3",
      })
    ).rejects.toBeInstanceOf(APIError);
  });
});

describe("correct()", () => {
  it("posts the correction to the CC-e path", async () => {
    let seenBody: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/invoices/ABC123/correction",
        method: "POST",
      })
      .reply(200, (req) => {
        seenBody = req.body as string;
        return { result: { status: "authorized" } };
      });

    const client = new Invoice({ apiKey: "k" });
    const result = await client.correct("ABC123", {
      documentType: DocumentType.NFE,
      correction: "Transportadora corrigida para Rapido Ltda",
    });

    expect(JSON.parse(seenBody ?? "{}")).toEqual({
      document_type: "nfe",
      correction: "Transportadora corrigida para Rapido Ltda",
    });
    expect(result).toEqual({ status: "authorized" });
  });

  it("rejects a correction under 15 characters before calling", async () => {
    const client = new Invoice({ apiKey: "k" });

    await expect(
      client.correct("ABC123", {
        documentType: DocumentType.NFE,
        correction: "curto demais",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a correction over 1000 characters before calling", async () => {
    const client = new Invoice({ apiKey: "k" });

    await expect(
      client.correct("ABC123", {
        documentType: DocumentType.NFE,
        correction: "a".repeat(1001),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("surfaces an NFS-e refusal as an APIError", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/invoices/ABC123/correction",
        method: "POST",
      })
      .reply(409, { detail: "correction isn't supported for nfse" });

    const client = new Invoice({ apiKey: "k" });

    await expect(
      client.correct("ABC123", {
        documentType: DocumentType.NFSE,
        correction: "Transportadora corrigida para Rapido Ltda",
      })
    ).rejects.toBeInstanceOf(APIError);
  });
});

describe("invalidate()", () => {
  const reason = "Numeracao reservada e nao utilizada por falha no ERP";

  it("posts the range to the invalidations path", async () => {
    let seenBody: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices/invalidations", method: "POST" })
      .reply(200, (req) => {
        seenBody = req.body as string;
        return { id: "range-1", status: "invalidated" };
      });

    const client = new Invoice({ apiKey: "k" });
    const result = await client.invalidate({
      series: "1",
      numberStart: 10,
      numberEnd: 12,
      reason,
    });

    expect(JSON.parse(seenBody ?? "{}")).toEqual({
      series: "1",
      number_start: 10,
      number_end: 12,
      reason,
    });
    expect(result.status).toBe("invalidated");
  });

  it("rejects a reason outside 15 to 255 characters", async () => {
    const client = new Invoice({ apiKey: "k" });

    await expect(
      client.invalidate({
        series: "1",
        numberStart: 10,
        numberEnd: 12,
        reason: "curto",
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      client.invalidate({
        series: "1",
        numberStart: 10,
        numberEnd: 12,
        reason: "a".repeat(256),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a backwards range", async () => {
    const client = new Invoice({ apiKey: "k" });

    await expect(
      client.invalidate({
        series: "1",
        numberStart: 12,
        numberEnd: 10,
        reason,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("surfaces an already-used number as an APIError", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices/invalidations", method: "POST" })
      .reply(409, { detail: "these numbers were already sent: 11" });

    const client = new Invoice({ apiKey: "k" });

    await expect(
      client.invalidate({
        series: "1",
        numberStart: 10,
        numberEnd: 12,
        reason,
      })
    ).rejects.toBeInstanceOf(APIError);
  });
});

describe("unknown response fields", () => {
  it("passes a field the SDK has never heard of through to the caller", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices/ABC?document_type=nfse" })
      .reply(200, {
        result: {
          access_key: "ABC",
          status: "authorized",
          field_invented_next_year: { nested: [1, 2] },
        },
      });

    const client = new Invoice({ apiKey: "k" });
    const result = await client.consult("ABC", {
      documentType: DocumentType.NFSE,
    });

    expect(result.access_key).toBe("ABC");
    expect(result.field_invented_next_year).toEqual({ nested: [1, 2] });
  });
});

// The only method returning bytes. A JSON round trip would corrupt the
// document, and the authorizer's endpoint for it is unstable by its own
// documentation, so a 502 must stay distinguishable from a bad note.
describe("pdf", () => {
  it("returns the bytes untouched", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/invoices/abc123/pdf?document_type=nfse",
        method: "GET",
      })
      .reply(200, Buffer.from("%PDF-1.4 fake"), {
        headers: { "content-type": "application/pdf" },
      });

    const client = new Invoice({ apiKey: "secret" });

    const bytes = await client.pdf("abc123", {
      documentType: DocumentType.NFSE,
    });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString()).toBe("%PDF-1.4 fake");
  });

  it("surfaces an unavailable authorizer as an APIError", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/invoices/abc123/pdf?document_type=nfse",
        method: "GET",
      })
      .reply(502, { detail: "authorizer unavailable" });

    const client = new Invoice({ apiKey: "secret" });

    await expect(
      client.pdf("abc123", { documentType: DocumentType.NFSE })
    ).rejects.toBeInstanceOf(APIError);
  });

  it("surfaces the API's 501 for nfe rather than validating locally", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/invoices/abc123/pdf?document_type=nfe",
        method: "GET",
      })
      .reply(501, { detail: "a PDF isn't available for nfe yet" });

    const client = new Invoice({ apiKey: "secret" });

    await expect(
      client.pdf("abc123", { documentType: DocumentType.NFE })
    ).rejects.toMatchObject({ statusCode: 501 });
  });
});

// Reads what the API already collected: the SEFAZ caps how many times a
// CNPJ may ask, so a listing must never reach the authorizer.
describe("received", () => {
  it("lists without a query when no pagination is given", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/received-invoices", method: "GET" })
      .reply(200, { data: [], total: 0 });

    const client = new Invoice({ apiKey: "secret" });

    const result = await client.received();

    expect(result).toMatchObject({ total: 0 });
  });

  it("passes pagination through", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/received-invoices?limit=10&offset=20",
        method: "GET",
      })
      .reply(200, { data: [] });

    const client = new Invoice({ apiKey: "secret" });

    await expect(
      client.received({ limit: 10, offset: 20 })
    ).resolves.toBeDefined();
  });
});

describe("manifest", () => {
  it("sends the answer to the manifestation path", async () => {
    let seen: Record<string, unknown> = {};
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/received-invoices/abc123/manifestation",
        method: "POST",
      })
      .reply(200, (req) => {
        seen = JSON.parse(req.body as string);
        return { result: { status: "registered" } };
      });

    const client = new Invoice({ apiKey: "secret" });

    await client.manifest("abc123", {
      manifestation: Manifestation.CIENCIA,
    });

    expect(seen.manifestation).toBe("210210");
  });

  it("refuses 210240 without a reason, before any request", async () => {
    const client = new Invoice({ apiKey: "secret" });

    await expect(
      client.manifest("abc123", {
        manifestation: Manifestation.OPERACAO_NAO_REALIZADA,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a reason where none is taken", async () => {
    const client = new Invoice({ apiKey: "secret" });

    await expect(
      client.manifest("abc123", {
        manifestation: Manifestation.CIENCIA,
        reason: "um motivo qualquer",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// The issuer's own side: what this company issued, not what it received.
describe("history", () => {
  it("lists without a query when no filter is given", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "GET" })
      .reply(200, { data: [], total: 0 });

    const client = new Invoice({ apiKey: "secret" });

    const result = await client.history();

    expect(result).toMatchObject({ total: 0 });
  });

  it("passes every filter through", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path:
          "/api/v1/invoices?document_type=nfe&status=rejected&limit=10" +
          "&offset=20&sort_by=created_at&order_by=asc",
        method: "GET",
      })
      .reply(200, { data: [] });

    const client = new Invoice({ apiKey: "secret" });

    await expect(
      client.history({
        documentType: DocumentType.NFE,
        status: "rejected",
        limit: 10,
        offset: 20,
        sortBy: "created_at",
        orderBy: "asc",
      })
    ).resolves.toBeDefined();
  });

  it("returns the paginated envelope", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices?limit=1", method: "GET" })
      .reply(200, { data: [{ id: "abc" }], total: 1, page: 1 });

    const client = new Invoice({ apiKey: "secret" });

    const result = await client.history({ limit: 1 });

    expect(result).toMatchObject({ total: 1, page: 1 });
  });
});

// consult() says a document was rejected; this says why.
describe("submissions", () => {
  it("reads the attempts by invoice id", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/invoices/abc-123/submissions",
        method: "GET",
      })
      .reply(200, [{ status: "rejected", status_code: "209" }]);

    const client = new Invoice({ apiKey: "secret" });

    const rows = await client.submissions("abc-123");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status_code: "209" });
  });

  it("refuses a response that is not a list", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/invoices/abc-123/submissions",
        method: "GET",
      })
      .reply(200, { result: {} });

    const client = new Invoice({ apiKey: "secret" });

    await expect(client.submissions("abc-123")).rejects.toThrow(
      "unexpected response shape"
    );
  });
});

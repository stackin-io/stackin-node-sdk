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

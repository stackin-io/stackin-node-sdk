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

  const nfeProduct = () =>
    new br.Product({
      description: "x",
      amount: 10,
      ncm: "84713012",
      cfop: "5102",
    });

  it("NFE accepts an address without cityCode and sends none", async () => {
    let seenBody: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, (req) => {
        seenBody = req.body as string;
        return { result: {} };
      });

    await new Invoice({ apiKey: "k" }).issue({
      documentType: DocumentType.NFE,
      clientName: "n",
      taxId: "1",
      items: [nfeProduct()],
      recipientAddress: new Address({
        street: "Rua A",
        number: "1",
        neighborhood: "Centro",
        city: "Sao Paulo",
        state: "SP",
        zipCode: "01000000",
      }),
    });

    expect(JSON.parse(seenBody ?? "{}").recipient_address).toEqual({
      street: "Rua A",
      number: "1",
      neighborhood: "Centro",
      city: "Sao Paulo",
      state: "SP",
      zip_code: "01000000",
    });
  });

  it("NFE refuses a partial address, naming only the required fields", async () => {
    await expect(
      new Invoice({ apiKey: "k" }).issue({
        documentType: DocumentType.NFE,
        clientName: "n",
        taxId: "1",
        items: [nfeProduct()],
        recipientAddress: new Address({
          number: "1",
          neighborhood: "Centro",
          city: "Sao Paulo",
          state: "SP",
        }),
      })
    ).rejects.toThrow(
      new ValidationError(
        "recipientAddress is missing required fields for NFE: street, zipCode"
      )
    );
  });
});

describe("issue() clientEmail / clientPhone", () => {
  const run = async (extra: {
    clientEmail?: string;
    clientPhone?: string;
  }) => {
    const seen: { body?: string; headers?: unknown } = {};
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, (req) => {
        seen.body = req.body as string;
        seen.headers = req.headers;
        return { result: {} };
      });
    await new Invoice({ apiKey: "k" }).issue({
      documentType: DocumentType.NFSE,
      clientName: "Buyer",
      taxId: "1",
      items: [new br.Product({ description: "Servico", amount: 100 })],
      idempotencyKey: "idem-1",
      ...extra,
    });
    return JSON.parse(seen.body ?? "{}");
  };

  it("sends client_email and client_phone when set", async () => {
    const body = await run({
      clientEmail: "ana@example.com",
      clientPhone: "+55 (11) 91234-5678",
    });
    expect(body.client_email).toBe("ana@example.com");
    expect(body.client_phone).toBe("+55 (11) 91234-5678");
    expect(body).not.toHaveProperty("clientEmail");
    expect(body).not.toHaveProperty("clientPhone");
    expect(body).not.toHaveProperty("idempotency_key");
    expect(body).not.toHaveProperty("idempotencyKey");
  });

  it("omits both when unset", async () => {
    const body = await run({});
    expect(body).not.toHaveProperty("client_email");
    expect(body).not.toHaveProperty("client_phone");
    expect(body).not.toHaveProperty("idempotency_key");
  });

  it("sends only the one given", async () => {
    const body = await run({ clientEmail: "ana@example.com" });
    expect(body.client_email).toBe("ana@example.com");
    expect(body).not.toHaveProperty("client_phone");
  });
});

describe("issue() externalReference", () => {
  const captureBody = () => {
    const seen: { body?: string } = {};
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, (req) => {
        seen.body = req.body as string;
        return { result: {} };
      });
    return seen;
  };

  const issue = (externalReference?: string) =>
    new Invoice({ apiKey: "k" }).issue({
      documentType: DocumentType.NFSE,
      clientName: "Buyer",
      taxId: "1",
      items: [new br.Product({ description: "Servico", amount: 100 })],
      externalReference,
    });

  it("sends external_reference when set", async () => {
    const seen = captureBody();
    await issue("nuvemshop:1:order:1234");
    const body = JSON.parse(seen.body ?? "{}");
    expect(body.external_reference).toBe("nuvemshop:1:order:1234");
    expect(body).not.toHaveProperty("externalReference");
  });

  it("omits external_reference when unset", async () => {
    const seen = captureBody();
    await issue();
    expect(JSON.parse(seen.body ?? "{}")).not.toHaveProperty(
      "external_reference"
    );
  });
});

describe("issue() NF-e layout limits", () => {
  const nfeItem = (description: string) =>
    new br.Product({ description, amount: 10, ncm: "84713012", cfop: "5102" });

  it("refuses an NF-e item description over 120 characters", async () => {
    const client = new Invoice({ apiKey: "k" });
    await expect(
      client.issue({
        documentType: DocumentType.NFE,
        clientName: "n",
        taxId: "1",
        items: [nfeItem("ok item"), nfeItem("x".repeat(121))],
        recipientAddress: nfeAddress,
      })
    ).rejects.toThrow(
      new ValidationError(
        "items[1].description exceeds 120 characters (NF-e xProd limit)"
      )
    );
  });

  it("sends an NF-e item description of exactly 120 characters", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, { result: {} });
    const client = new Invoice({ apiKey: "k" });
    await expect(
      client.issue({
        documentType: DocumentType.NFE,
        clientName: "n",
        taxId: "1",
        items: [nfeItem("x".repeat(120))],
        recipientAddress: nfeAddress,
      })
    ).resolves.toBeDefined();
  });

  it("does not limit an NFS-e description", async () => {
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
        items: [new br.Product({ description: "s".repeat(500), amount: 10 })],
      })
    ).resolves.toBeDefined();
  });
});

describe("issue() NF-e latin1 text", () => {
  const nfeItem = (fields: Partial<br.ProductFields> = {}) =>
    new br.Product({
      description: "Pão de queijo",
      amount: 10,
      ncm: "19012000",
      cfop: "5102",
      ...fields,
    });

  const issueNfe = (
    overrides: {
      clientName?: string;
      items?: br.Product[];
      recipientAddress?: Address;
    } = {}
  ) =>
    new Invoice({ apiKey: "k" }).issue({
      documentType: DocumentType.NFE,
      clientName: overrides.clientName ?? "Açougue São João",
      taxId: "1",
      items: overrides.items ?? [nfeItem()],
      recipientAddress: overrides.recipientAddress ?? nfeAddress,
    });

  const outside = (path: string, char: string) =>
    new ValidationError(
      `${path} contains a character outside ISO-8859-1 (latin1), which NF-e does not accept: '${char}'`
    );

  it("sends accented latin1 text", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, { result: {} });

    await expect(issueNfe()).resolves.toBeDefined();
  });

  it("lets through what the API converts or folds", async () => {
    for (const description of [
      "“Teclado” — 2 un… €10™",
      "‘a’ ‚b „c – d − e • f",
      "a\tb\nc\rd",
      "é ç ã",
    ]) {
      agent
        .get(DEFAULT_BASE_URL)
        .intercept({ path: "/api/v1/invoices", method: "POST" })
        .reply(200, { result: {} });

      await expect(
        issueNfe({ items: [nfeItem({ description })] })
      ).resolves.toBeDefined();
    }
  });

  it("refuses an emoji in an item description", async () => {
    await expect(
      issueNfe({ items: [nfeItem(), nfeItem({ description: "Teste 🔥 x" })] })
    ).rejects.toThrow(outside("items[1].description", "🔥"));
  });

  it("refuses a CJK character in the recipient name", async () => {
    await expect(issueNfe({ clientName: "中 Ltda" })).rejects.toThrow(
      outside("client_name", "中")
    );
  });

  it("refuses a Cyrillic character in an address field", async () => {
    await expect(
      issueNfe({
        recipientAddress: new Address({
          street: "Rua Ж",
          number: "1",
          neighborhood: "Centro",
          city: "Sao Paulo",
          state: "SP",
          zipCode: "01000000",
          cityCode: "3550308",
        }),
      })
    ).rejects.toThrow(outside("recipient_address.street", "Ж"));
  });

  it("refuses it in the unit, purchase order and observations", async () => {
    await expect(
      issueNfe({ items: [nfeItem({ unit: "㎡" })] })
    ).rejects.toThrow(outside("items[0].product.unit", "㎡"));
    await expect(
      issueNfe({ items: [nfeItem({ purchaseOrder: "PO Ж1" })] })
    ).rejects.toThrow(outside("items[0].product.purchase_order", "Ж"));
    await expect(
      issueNfe({ items: [nfeItem({ observations: "ok 中" })] })
    ).rejects.toThrow(outside("items[0].observations", "中"));
  });

  it("does not apply to an NFS-e", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, { result: {} });

    await expect(
      new Invoice({ apiKey: "k" }).issue({
        documentType: DocumentType.NFSE,
        clientName: "Łódź 🔥",
        taxId: "1",
        items: [new br.Product({ description: "Serviço 🚀", amount: 10 })],
      })
    ).resolves.toBeDefined();
  });
});

describe("issue() NFS-e retained ISS", () => {
  const retained = new br.Product({
    description: "Consultoria",
    amount: 100,
    taxRetained: true,
  });
  const plain = new br.Product({ description: "Suporte", amount: 50 });

  it("refuses retained ISS without a recipient address", async () => {
    await expect(
      new Invoice({ apiKey: "k" }).issue({
        documentType: DocumentType.NFSE,
        clientName: "Tomador Ltda",
        taxId: "11111111111111",
        items: [plain, retained],
      })
    ).rejects.toThrow(
      new ValidationError(
        "recipient_address is required on an NFS-e when any item has tax_retained=true (ISSQN retained by the tomador)"
      )
    );
  });

  it("sends retained ISS with a complete address, cityCode optional", async () => {
    let seenBody: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, (req) => {
        seenBody = req.body as string;
        return { result: {} };
      });

    await new Invoice({ apiKey: "k" }).issue({
      documentType: DocumentType.NFSE,
      clientName: "Tomador Ltda",
      taxId: "11111111111111",
      items: [retained],
      recipientAddress: new Address({
        street: "Rua A",
        number: "1",
        neighborhood: "Centro",
        city: "Sao Paulo",
        state: "SP",
        zipCode: "01000000",
      }),
    });

    expect(JSON.parse(seenBody ?? "{}").recipient_address).toEqual({
      street: "Rua A",
      number: "1",
      neighborhood: "Centro",
      city: "Sao Paulo",
      state: "SP",
      zip_code: "01000000",
    });
  });

  it("refuses retained ISS with a partial address, naming what is missing", async () => {
    await expect(
      new Invoice({ apiKey: "k" }).issue({
        documentType: DocumentType.NFSE,
        clientName: "Tomador Ltda",
        taxId: "11111111111111",
        items: [retained],
        recipientAddress: new Address({ city: "Sao Paulo", state: "SP" }),
      })
    ).rejects.toThrow(
      new ValidationError(
        "recipientAddress is missing required fields for NFSE with tax_retained=true: street, number, neighborhood, zipCode"
      )
    );
  });

  it("does not ask for an address when no ISS is retained", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(200, { result: {} });

    await expect(
      new Invoice({ apiKey: "k" }).issue({
        documentType: DocumentType.NFSE,
        clientName: "Tomador Ltda",
        taxId: "11111111111111",
        items: [plain],
      })
    ).resolves.toBeDefined();
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
    expect(out).toEqual({ access_key: "ABC", warnings: [] });
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

  it("cancel() sends the header when a key is given", async () => {
    // Cancelling is the irreversible one: a blind retry on a dropped
    // connection used to reach the authorizer twice.
    let seenKey: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices/KEY-1/cancel", method: "POST" })
      .reply(200, (req) => {
        const headers = req.headers as Record<string, string>;
        seenKey = headers["idempotency-key"] ?? headers["Idempotency-Key"];
        return { result: { status: "cancelled" } };
      });

    const client = new Invoice({ apiKey: "k" });
    await client.cancel("KEY-1", {
      documentType: DocumentType.NFSE,
      reason: "cancelled by the customer",
      idempotencyKey: "idem-3",
    });

    expect(seenKey).toBe("idem-3");
  });

  it("cancel() omits the header by default", async () => {
    let seenKey: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices/KEY-2/cancel", method: "POST" })
      .reply(200, (req) => {
        const headers = req.headers as Record<string, string>;
        seenKey = headers["idempotency-key"] ?? headers["Idempotency-Key"];
        return { result: { status: "cancelled" } };
      });

    const client = new Invoice({ apiKey: "k" });
    await client.cancel("KEY-2", {
      documentType: DocumentType.NFSE,
      reason: "cancelled by the customer",
    });

    expect(seenKey).toBeUndefined();
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
  const NFE_KEY = "35240912345678000199550010000000011000000017";
  const NFE_ONLY = new ValidationError(
    "correct is NFe only. NFSe has no correction letter — cancel and reissue instead."
  );

  it("refuses a 50-digit NFS-e key before calling", async () => {
    const client = new Invoice({ apiKey: "k" });

    await expect(
      client.correct("3".repeat(50), {
        documentType: DocumentType.NFSE,
        correction: "Transportadora corrigida para Rapido Ltda",
      })
    ).rejects.toThrow(NFE_ONLY);
  });

  it("refuses anything that is not an NF-e access key before calling", async () => {
    const client = new Invoice({ apiKey: "k" });

    for (const key of [
      "ABC123",
      "3".repeat(43),
      "3".repeat(45),
      "A".repeat(44),
      // lowercase letters in the CNPJ slot
      "352607" + "12abc3450001" + "9".repeat(26),
      // a letter outside positions 7-18
      "35260A" + "12ABC3450001" + "9".repeat(26),
      "352607" + "12ABC3450001" + "A" + "9".repeat(25),
    ]) {
      await expect(
        client.correct(key, {
          documentType: DocumentType.NFE,
          correction: "Transportadora corrigida para Rapido Ltda",
        })
      ).rejects.toThrow(NFE_ONLY);
    }
  });

  it("sends a key whose CNPJ slot is alphanumeric", async () => {
    const key = "352607" + "12ABC3450001" + "9".repeat(26);
    expect(key).toHaveLength(44);
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: `/api/v1/invoices/${key}/correction`,
        method: "POST",
      })
      .reply(200, { result: { status: "authorized" } });

    await expect(
      new Invoice({ apiKey: "k" }).correct(key, {
        documentType: DocumentType.NFE,
        correction: "Transportadora corrigida para Rapido Ltda",
      })
    ).resolves.toEqual({ status: "authorized" });
  });

  it("posts the correction to the CC-e path", async () => {
    let seenBody: string | undefined;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: `/api/v1/invoices/${NFE_KEY}/correction`,
        method: "POST",
      })
      .reply(200, (req) => {
        seenBody = req.body as string;
        return { result: { status: "authorized" } };
      });

    const client = new Invoice({ apiKey: "k" });
    const result = await client.correct(NFE_KEY, {
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
      client.correct(NFE_KEY, {
        documentType: DocumentType.NFE,
        correction: "curto demais",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a correction over 1000 characters before calling", async () => {
    const client = new Invoice({ apiKey: "k" });

    await expect(
      client.correct(NFE_KEY, {
        documentType: DocumentType.NFE,
        correction: "a".repeat(1001),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("surfaces an NFS-e refusal as an APIError", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: `/api/v1/invoices/${NFE_KEY}/correction`,
        method: "POST",
      })
      .reply(409, { detail: "correction isn't supported for nfse" });

    const client = new Invoice({ apiKey: "k" });

    await expect(
      client.correct(NFE_KEY, {
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

  it("filters by external reference and asks for the summary", async () => {
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({
        path: "/api/v1/invoices?external_reference=PED-42&fields=summary",
        method: "GET",
      })
      .reply(200, { data: [{ id: "abc" }], total: 1 });

    const client = new Invoice({ apiKey: "secret" });

    const result = await client.history({
      externalReference: "PED-42",
      fields: "summary",
    });

    expect(result).toMatchObject({ total: 1 });
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

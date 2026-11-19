import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  Dispatcher,
} from "undici";

import {
  APIError,
  ClientAlreadyExistsError,
  ClientInactiveError,
  ClientNotFoundError,
  COMPANY_HEADER,
  DEFAULT_BASE_URL,
  DocumentType,
  InsufficientPermissionError,
  Invoice,
  PaymentRequiredError,
  RateLimitedError,
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

const CLIENT_ID = "0b6c3d1e-7a2f-4e59-9c10-5d8e2f3a4b6c";

const USAGE = {
  plan_name: "Pro",
  plan_slug: "pro",
  included_invoices: 500,
  used_invoices: 120,
  overage_price_cents: 25,
  included_received: 50,
  used_received: 61,
  received_price_cents: 5,
  received_free: false,
  current_period_start: "2026-11-01T00:00:00Z",
  current_period_end: "2026-12-01T00:00:00Z",
  credit_balance: 1250,
  companies_on_account: 2,
};

function intercept(
  path: string,
  method: string,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Array<Record<string, string>> {
  const seen: Array<Record<string, string>> = [];
  agent
    .get(DEFAULT_BASE_URL)
    .intercept({ path, method })
    .reply(
      status,
      (req) => {
        seen.push({ ...(req.headers as Record<string, string>) });
        return body as object;
      },
      { headers }
    );
  return seen;
}

function lower(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
}

describe("usage", () => {
  it("reads the plan and the period's consumption", async () => {
    intercept("/api/v1/company/usage", "GET", 200, USAGE);

    const usage = await new Invoice({ apiKey: "secret" }).usage();

    expect(usage).toEqual(USAGE);
  });

  it("keeps a null overage price and period end", async () => {
    intercept("/api/v1/company/usage", "GET", 200, {
      ...USAGE,
      overage_price_cents: null,
      current_period_end: null,
    });

    const usage = await new Invoice({ apiKey: "secret" }).usage();

    expect(usage.overage_price_cents).toBeNull();
    expect(usage.current_period_end).toBeNull();
  });

  it("defaults the received fields an older API leaves out", async () => {
    const older: Record<string, unknown> = { ...USAGE };
    delete older.included_received;
    delete older.used_received;
    delete older.received_price_cents;
    delete older.received_free;
    intercept("/api/v1/company/usage", "GET", 200, older);

    const usage = await new Invoice({ apiKey: "secret" }).usage();

    expect(usage.included_received).toBe(50);
    expect(usage.used_received).toBe(0);
    expect(usage.received_price_cents).toBe(5);
    expect(usage.received_free).toBe(false);
  });

  it("passes a field it does not know through", async () => {
    intercept("/api/v1/company/usage", "GET", 200, {
      ...USAGE,
      new_counter: 7,
    });

    const usage = await new Invoice({ apiKey: "secret" }).usage();

    expect(usage.new_counter).toBe(7);
    expect(usage.plan_slug).toBe("pro");
  });

  it("sends the company it acts on", async () => {
    const seen = intercept("/api/v1/company/usage", "GET", 200, USAGE);

    await new Invoice({ apiKey: "secret" }).usage({
      company: "11222333000181",
    });

    expect(lower(seen[0])[COMPANY_HEADER.toLowerCase()]).toBe(
      "11222333000181"
    );
  });
});

describe("syncReceived", () => {
  it("posts without a body and returns the sync result", async () => {
    const result = {
      stored: 3,
      pages: 1,
      last_nsu: "000000000000123",
      max_nsu: "000000000000123",
      next_sync_at: "2026-11-18T22:00:00Z",
    };
    intercept("/api/v1/received-invoices/sync", "POST", 200, result);

    const sync = await new Invoice({ apiKey: "secret" }).syncReceived();

    expect(sync).toEqual(result);
  });

  it("keeps a null max_nsu and next_sync_at", async () => {
    intercept("/api/v1/received-invoices/sync", "POST", 200, {
      stored: 0,
      pages: 0,
      last_nsu: "0",
      max_nsu: null,
      next_sync_at: null,
    });

    const sync = await new Invoice({ apiKey: "secret" }).syncReceived();

    expect(sync.max_nsu).toBeNull();
    expect(sync.next_sync_at).toBeNull();
  });

  it("raises RateLimitedError inside the SEFAZ one-hour wait", async () => {
    intercept(
      "/api/v1/received-invoices/sync",
      "POST",
      429,
      {
        detail: "Wait before asking the SEFAZ again",
        code: "DISTRIBUTION_COOLDOWN",
        retry_at: "2026-11-18T22:00:00Z",
      },
      { "Retry-After": "1800" }
    );

    const error = await new Invoice({ apiKey: "secret" })
      .syncReceived()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error).toBeInstanceOf(APIError);
    const limited = error as RateLimitedError;
    expect(limited.statusCode).toBe(429);
    expect(limited.detail).toBe("Wait before asking the SEFAZ again");
    expect(limited.code).toBe("DISTRIBUTION_COOLDOWN");
    expect(limited.retryAt).toBe("2026-11-18T22:00:00Z");
    expect(limited.retryAfter).toBe(1800);
  });
});

describe("typed errors", () => {
  it("raises PaymentRequiredError on any 402", async () => {
    intercept("/api/v1/company/usage", "GET", 402, {
      detail: "No credit left",
    });

    const error = await new Invoice({ apiKey: "secret" })
      .usage()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentRequiredError);
    expect(error).toBeInstanceOf(APIError);
    expect((error as PaymentRequiredError).statusCode).toBe(402);
    expect((error as PaymentRequiredError).detail).toBe("No credit left");
  });

  it("raises RateLimitedError on a 429 without Retry-After or body fields", async () => {
    intercept("/api/v1/invoices", "GET", 429, { detail: "Too many requests" });

    const error = await new Invoice({ apiKey: "secret" })
      .history()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitedError);
    const limited = error as RateLimitedError;
    expect(limited.detail).toBe("Too many requests");
    expect(limited.retryAfter).toBeUndefined();
    expect(limited.retryAt).toBeUndefined();
    expect(limited.code).toBeUndefined();
  });

  it("reads a Retry-After given as an HTTP date", async () => {
    const at = new Date(Date.now() + 120_000).toUTCString();
    intercept(
      "/api/v1/invoices",
      "GET",
      429,
      { detail: "Too many requests" },
      { "Retry-After": at }
    );

    const error = (await new Invoice({ apiKey: "secret" })
      .history()
      .catch((e: unknown) => e)) as RateLimitedError;

    expect(error.retryAfter).toBeGreaterThan(100);
    expect(error.retryAfter).toBeLessThanOrEqual(120);
  });

  it("raises ClientInactiveError on a 422 CLIENT_INACTIVE", async () => {
    intercept("/api/v1/invoices", "POST", 422, {
      detail: {
        code: "CLIENT_INACTIVE",
        message: "Client is inactive",
        client_id: CLIENT_ID,
      },
    });

    const error = await new Invoice({ apiKey: "secret" })
      .issue({
        documentType: DocumentType.NFSE,
        clientId: CLIENT_ID,
        items: [new br.Product({ description: "Consultoria", amount: 100 })],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ClientInactiveError);
    expect(error).toBeInstanceOf(APIError);
    expect((error as ClientInactiveError).clientId).toBe(CLIENT_ID);
    expect((error as ClientInactiveError).detail).toBe("Client is inactive");
    expect((error as ClientInactiveError).statusCode).toBe(422);
  });

  it("raises ClientNotFoundError on a 404 CLIENT_NOT_FOUND", async () => {
    intercept("/api/v1/invoices", "POST", 404, {
      detail: {
        code: "CLIENT_NOT_FOUND",
        message: "Client not found",
        client_id: CLIENT_ID,
      },
    });

    const error = await new Invoice({ apiKey: "secret" })
      .issue({
        documentType: DocumentType.NFSE,
        clientId: CLIENT_ID,
        items: [new br.Product({ description: "Consultoria", amount: 100 })],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ClientNotFoundError);
    expect(error).toBeInstanceOf(APIError);
    expect((error as ClientNotFoundError).clientId).toBe(CLIENT_ID);
    expect((error as ClientNotFoundError).statusCode).toBe(404);
  });

  it("leaves another 404 and 422 a plain APIError", async () => {
    intercept("/api/v1/invoices/abc?document_type=nfse", "GET", 404, {
      detail: "Not found",
    });
    intercept("/api/v1/invoices", "POST", 422, {
      detail: { code: "SOMETHING_ELSE", message: "nope" },
    });
    const client = new Invoice({ apiKey: "secret" });

    const notFound = await client
      .consult("abc", { documentType: DocumentType.NFSE })
      .catch((e: unknown) => e);
    const invalid = await client
      .issue({
        documentType: DocumentType.NFSE,
        clientId: CLIENT_ID,
        items: [new br.Product({ description: "Consultoria", amount: 100 })],
      })
      .catch((e: unknown) => e);

    expect((notFound as Error).constructor).toBe(APIError);
    expect((invalid as Error).constructor).toBe(APIError);
  });

  it("keeps the existing typed errors", async () => {
    intercept("/api/v1/invoices/abc?document_type=nfse", "GET", 403, {
      detail: {
        code: "INSUFFICIENT_PERMISSION",
        error_description: "needs invoices:read, has none, company=x",
      },
    });
    intercept("/api/v1/invoices", "POST", 409, {
      detail: {
        code: "CLIENT_EXISTS",
        message: "Client exists",
        client_id: CLIENT_ID,
      },
    });
    const client = new Invoice({ apiKey: "secret" });

    await expect(
      client.consult("abc", { documentType: DocumentType.NFSE })
    ).rejects.toBeInstanceOf(InsufficientPermissionError);
    const exists = await client
      .issue({
        documentType: DocumentType.NFSE,
        clientId: CLIENT_ID,
        items: [new br.Product({ description: "Consultoria", amount: 100 })],
      })
      .catch((e: unknown) => e);
    expect(exists).toBeInstanceOf(ClientAlreadyExistsError);
  });
});

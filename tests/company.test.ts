import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  Dispatcher,
} from "undici";

import {
  APIError,
  COMPANY_HEADER,
  CompanyNotInScopeError,
  CompanyRequiredError,
  DEFAULT_BASE_URL,
  DocumentType,
  FiscalReference,
  InsufficientPermissionError,
  Invoice,
  Taxpayer,
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

const COMPANY_ID = "6f1c2a3e-0000-4000-8000-000000000001";
const CNPJ = "11.222.333/0001-81";

const listing = [
  {
    company_id: COMPANY_ID,
    name: "Acme",
    tax_id: "11222333000181",
    permissions: ["invoices:write", "invoices:read"],
  },
  {
    company_id: "6f1c2a3e-0000-4000-8000-000000000002",
    name: "Beta",
    tax_id: "44555666000199",
    permissions: ["invoices:read"],
  },
];

type Seen = { headers: Record<string, string>; body: string };

function capture(
  path: string,
  method: string,
  reply: unknown = { result: {} }
): Seen[] {
  const seen: Seen[] = [];
  agent
    .get(DEFAULT_BASE_URL)
    .intercept({ path, method })
    .reply(200, (req) => {
      seen.push({
        headers: { ...(req.headers as Record<string, string>) },
        body: (req.body as string) ?? "",
      });
      return reply as object;
    });
  return seen;
}

function companyHeader(seen: Seen): string | undefined {
  return (
    seen.headers[COMPANY_HEADER.toLowerCase()] ?? seen.headers[COMPANY_HEADER]
  );
}

function nfse(company?: string) {
  return {
    documentType: DocumentType.NFSE,
    clientName: "John",
    taxId: "1",
    items: [new br.Product({ description: "svc", amount: 10 })],
    company,
  };
}

describe("X-Stackin-Company header", () => {
  it("is not sent when no company is set", async () => {
    const seen = capture("/api/v1/invoices", "POST");

    await new Invoice({ apiKey: "k" }).issue(nfse());

    expect(companyHeader(seen[0])).toBeUndefined();
  });

  it("leaves the request unchanged when no company is set", async () => {
    const withoutOption = capture("/api/v1/invoices", "POST");
    await new Invoice({ apiKey: "k" }).issue(nfse());
    const withUndefined = capture("/api/v1/invoices", "POST");
    await new Invoice({ apiKey: "k", company: undefined }).issue(nfse());

    expect(withUndefined[0].headers).toEqual(withoutOption[0].headers);
    expect(withUndefined[0].body).toBe(withoutOption[0].body);
    expect(JSON.parse(withoutOption[0].body)).not.toHaveProperty("company");
  });

  it("is sent on every call when set on the client", async () => {
    const client = new Invoice({ apiKey: "k", company: COMPANY_ID });
    const issued = capture("/api/v1/invoices", "POST");
    const consulted = capture("/api/v1/invoices/AK?document_type=nfse", "GET");
    const listed = capture("/api/v1/invoices", "GET");
    const submissions = capture("/api/v1/invoices/INV/submissions", "GET", []);

    await client.issue(nfse());
    await client.consult("AK", { documentType: DocumentType.NFSE });
    await client.history();
    await client.submissions("INV");

    for (const seen of [issued, consulted, listed, submissions]) {
      expect(companyHeader(seen[0])).toBe(COMPANY_ID);
    }
  });

  it("is not part of the issue body", async () => {
    const seen = capture("/api/v1/invoices", "POST");

    await new Invoice({ apiKey: "k" }).issue(nfse(COMPANY_ID));

    expect(JSON.parse(seen[0].body)).not.toHaveProperty("company");
  });

  it("takes a per-call company over the client's", async () => {
    const seen = capture("/api/v1/invoices/AK/cancel", "POST");

    await new Invoice({ apiKey: "k", company: COMPANY_ID }).cancel("AK", {
      documentType: DocumentType.NFSE,
      reason: "typo",
      company: CNPJ,
    });

    expect(companyHeader(seen[0])).toBe(CNPJ);
  });

  it("sends a per-call company on a client without one", async () => {
    const seen = capture("/api/v1/invoices/INV/reissue", "POST");

    await new Invoice({ apiKey: "k" }).reissue("INV", { company: CNPJ });

    expect(companyHeader(seen[0])).toBe(CNPJ);
  });

  it("is sent on the lookups too", async () => {
    const reference = capture(
      "/api/v1/fiscal-references/ncm/84716052?country=BR",
      "GET"
    );
    const taxpayer = capture(
      "/api/v1/taxpayers/00000000000191?country=BR",
      "GET"
    );

    await new FiscalReference({ apiKey: "k", company: COMPANY_ID }).ncm.get(
      "84716052"
    );
    await new Taxpayer({ apiKey: "k", company: COMPANY_ID }).get(
      "00000000000191"
    );

    expect(companyHeader(reference[0])).toBe(COMPANY_ID);
    expect(companyHeader(taxpayer[0])).toBe(COMPANY_ID);
  });
});

describe("companies()", () => {
  it("lists the companies the credential covers", async () => {
    const seen = capture("/api/v1/me/companies", "GET", {
      environment: "production",
      companies: listing,
    });

    const result = await new Invoice({ apiKey: "k" }).companies();

    expect(seen).toHaveLength(1);
    expect(result).toEqual({ environment: "production", companies: listing });
    expect(result.companies[0].permissions).toContain("invoices:write");
  });

  it("returns an empty list when the API sends none", async () => {
    capture("/api/v1/me/companies", "GET", { environment: "test" });

    const result = await new Invoice({ apiKey: "k" }).companies();

    expect(result).toEqual({ environment: "test", companies: [] });
  });
});

function refuse(status: number, detail: unknown): void {
  agent
    .get(DEFAULT_BASE_URL)
    .intercept({ path: "/api/v1/invoices", method: "POST" })
    .reply(status, { detail });
}

async function failure(client: Invoice): Promise<unknown> {
  try {
    await client.issue(nfse());
  } catch (err) {
    return err;
  }
  throw new Error("expected the call to fail");
}

describe("company errors", () => {
  it("raises CompanyRequiredError on a 422 company_required", async () => {
    refuse(422, {
      error: "company_required",
      error_description: "This credential covers several companies.",
      companies: listing,
    });

    const err = await failure(new Invoice({ apiKey: "k" }));

    expect(err).toBeInstanceOf(CompanyRequiredError);
    expect(err).toBeInstanceOf(APIError);
    const typed = err as CompanyRequiredError;
    expect(typed.statusCode).toBe(422);
    expect(typed.detail).toBe("This credential covers several companies.");
    expect(typed.companies).toEqual(listing);
  });

  it("raises CompanyNotInScopeError on a 403 company_not_in_scope", async () => {
    refuse(403, {
      error: "company_not_in_scope",
      error_description: "This credential does not cover company X.",
      companies: listing,
    });

    const err = await failure(new Invoice({ apiKey: "k", company: "X" }));

    expect(err).toBeInstanceOf(CompanyNotInScopeError);
    const typed = err as CompanyNotInScopeError;
    expect(typed.statusCode).toBe(403);
    expect(typed.detail).toBe("This credential does not cover company X.");
    expect(typed.companies).toEqual(listing);
  });

  it("raises InsufficientPermissionError on a 403 INSUFFICIENT_PERMISSION", async () => {
    const description = `INSUFFICIENT_PERMISSION: needs invoices:write, has invoices:read, company=${COMPANY_ID}`;
    refuse(403, {
      error: "insufficient_scope",
      error_description: description,
      code: "INSUFFICIENT_PERMISSION",
    });

    const err = await failure(new Invoice({ apiKey: "k" }));

    expect(err).toBeInstanceOf(InsufficientPermissionError);
    const typed = err as InsufficientPermissionError;
    expect(typed.statusCode).toBe(403);
    expect(typed.detail).toBe(description);
  });

  it("makes exactly one request, never a retry", async () => {
    let calls = 0;
    agent
      .get(DEFAULT_BASE_URL)
      .intercept({ path: "/api/v1/invoices", method: "POST" })
      .reply(422, () => {
        calls += 1;
        return { detail: { error: "company_required", companies: [] } };
      })
      .persist();

    const err = await failure(new Invoice({ apiKey: "k" }));

    expect(err).toBeInstanceOf(CompanyRequiredError);
    expect((err as CompanyRequiredError).companies).toEqual([]);
    expect(calls).toBe(1);
  });

  it("keeps any other object detail a plain APIError", async () => {
    refuse(403, { error: "insufficient_scope", error_description: "nope" });

    const err = await failure(new Invoice({ apiKey: "k" }));

    expect(err).toBeInstanceOf(APIError);
    expect(err).not.toBeInstanceOf(InsufficientPermissionError);
    expect(err).not.toBeInstanceOf(CompanyNotInScopeError);
  });

  it("keeps a string detail a plain APIError", async () => {
    refuse(403, "Forbidden");

    const err = await failure(new Invoice({ apiKey: "k" }));

    expect(err).toBeInstanceOf(APIError);
    expect(err).not.toBeInstanceOf(InsufficientPermissionError);
    expect((err as APIError).detail).toBe("Forbidden");
  });
});

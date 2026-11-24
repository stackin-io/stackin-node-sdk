import { beforeEach, describe, expect, it } from "vitest";

import {
  Company,
  DocumentType,
  Invoice,
  Items,
  ValidationError,
  br,
} from "../src";

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

function fakeFetch(status: number, reply: unknown): typeof fetch {
  return (async (input: string, init: RequestInit) => {
    calls.push({
      method: String(init.method),
      url: String(input),
      headers: init.headers as Record<string, string>,
      body:
        init.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
}

const options = (status: number, reply: unknown) => ({
  apiKey: "k",
  baseUrl: "https://sdk.test",
  fetch: fakeFetch(status, reply),
});

const request = (fields: Record<string, unknown> = {}) => ({
  documentType: DocumentType.NFSE,
  clientName: "Buyer Ltda",
  taxId: "11111111111111",
  items: [
    new br.Product({
      description: "Consultoria",
      amount: 100,
      ...fields,
    }),
  ],
});

const line = () =>
  (calls[0].body as { items: Record<string, unknown>[] }).items[0];

describe("nbs on an issue line", () => {
  it("sends it beside serviceCode, not inside product", async () => {
    await new Invoice(options(200, { result: {} })).issue(
      request({ serviceCode: "1.07", nbs: "1.1502.10.00" })
    );

    expect(line().nbs).toBe("1.1502.10.00");
    expect(line().service_code).toBe("1.07");
    expect(line().product).not.toHaveProperty("nbs");
  });

  it("sends it as given without checking it", async () => {
    await new Invoice(options(200, { result: {} })).issue(
      request({ nbs: "x" })
    );

    expect(line().nbs).toBe("x");
  });

  it("leaves it out when unset", async () => {
    await new Invoice(options(200, { result: {} })).issue(request());

    expect(line()).not.toHaveProperty("nbs");
  });
});

describe("nbs on a catalog item", () => {
  it("is sent on create and update", async () => {
    const catalog = new Items(options(200, {}));
    await catalog.upsert({
      kind: "service",
      description: "Consultoria",
      serviceCode: "1.07",
      nbs: "115021000",
    });
    await catalog.update("id1", { nbs: "1.1502.10.00" });
    await catalog.update("id1", { nbs: null });

    expect(calls[0].body).toEqual({
      kind: "service",
      description: "Consultoria",
      service_code: "1.07",
      nbs: "115021000",
    });
    expect(calls[1].body).toEqual({ nbs: "1.1502.10.00" });
    expect(calls[2].body).toEqual({ nbs: null });
  });

  it("is left out when unset", async () => {
    await new Items(options(200, {})).upsert({
      kind: "service",
      description: "Consultoria",
    });

    expect(calls[0].body).not.toHaveProperty("nbs");
  });
});

describe("issue warnings", () => {
  const WARNING = {
    code: "MEI_ACTIVITY_NOT_ALLOWED",
    message: "activity not allowed",
    field: "items[0].service_code",
  };

  it("adds the warnings to the result", async () => {
    const result = await new Invoice(
      options(200, {
        result: { id: "i1", status: "authorized" },
        warnings: [WARNING, { code: "ACTIVITY_NOT_REGISTERED", message: "m" }],
      })
    ).issue(request());

    expect(result.id).toBe("i1");
    expect(result.warnings).toEqual([
      WARNING,
      { code: "ACTIVITY_NOT_REGISTERED", message: "m", field: null },
    ]);
  });

  it("answers an empty list when there are none", async () => {
    const withEmpty = await new Invoice(
      options(200, { result: { id: "i1" }, warnings: [] })
    ).issue(request());
    const without = await new Invoice(
      options(200, { result: { id: "i1" } })
    ).issue(request());
    const bare = await new Invoice(options(200, { id: "i1" })).issue(
      request()
    );

    expect(withEmpty.warnings).toEqual([]);
    expect(without.warnings).toEqual([]);
    expect(bare).toEqual({ id: "i1", warnings: [] });
  });

  it("leaves reissue unchanged", async () => {
    const result = await new Invoice(
      options(200, { result: { id: "i2" }, warnings: [WARNING] })
    ).reissue("i1");

    expect(result).toEqual({ id: "i2" });
  });
});

describe("validate warnings", () => {
  it("exposes the field of an activity warning", async () => {
    const result = await new Invoice(
      options(200, {
        valid: true,
        errors: [],
        warnings: [
          {
            code: "MEI_NO_ICMS_ACTIVITY",
            message: "no ICMS activity",
            field: null,
          },
          {
            code: "ACTIVITY_NOT_REGISTERED",
            message: "not registered",
            field: "items[0].service_code",
          },
        ],
      })
    ).validate(request());

    expect(result.warnings[0].field).toBeNull();
    expect(result.warnings[1].field).toBe("items[0].service_code");
  });
});

describe("acceptLanguage", () => {
  it("is sent as a header on issue, never in the body", async () => {
    await new Invoice(options(200, { result: {} })).issue({
      ...request(),
      acceptLanguage: "pt-BR",
    });

    expect(calls[0].headers["Accept-Language"]).toBe("pt-BR");
    const body = calls[0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty("accept_language");
    expect(body).not.toHaveProperty("acceptLanguage");
  });

  it("is sent as a header on validate, never in the body", async () => {
    await new Invoice(options(200, { valid: true })).validate({
      ...request(),
      acceptLanguage: "es",
    });

    expect(calls[0].url).toBe("https://sdk.test/api/v1/invoices/validate");
    expect(calls[0].headers["Accept-Language"]).toBe("es");
    const body = calls[0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty("accept_language");
    expect(body).not.toHaveProperty("acceptLanguage");
  });

  it("is omitted when unset", async () => {
    const invoice = new Invoice(options(200, { result: {}, valid: true }));
    await invoice.issue(request());
    await invoice.validate(request());

    expect(calls[0].headers).not.toHaveProperty("Accept-Language");
    expect(calls[1].headers).not.toHaveProperty("Accept-Language");
  });
});

describe("blockActivityMismatch", () => {
  const company = () => new Company(options(200, {}));

  it("sends true and false", async () => {
    await company().update({ blockActivityMismatch: true });
    await company().update({ blockActivityMismatch: false });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].body).toEqual({ block_activity_mismatch: true });
    expect(calls[1].body).toEqual({ block_activity_mismatch: false });
  });

  it("goes with the other groups", async () => {
    await company().update({
      fiscalFields: { taxRegime: "4" },
      blockActivityMismatch: true,
    });

    expect(calls[0].body).toEqual({
      fiscal_fields: { tax_regime: "4" },
      block_activity_mismatch: true,
    });
  });

  it("refuses a non-boolean", async () => {
    for (const value of ["true", 1, 0, {}]) {
      await expect(
        company().update({
          blockActivityMismatch: value as unknown as boolean,
        })
      ).rejects.toBeInstanceOf(ValidationError);
    }
    expect(calls).toHaveLength(0);
  });

  it("leaves it out when unset", async () => {
    await company().update({ fiscalFields: { taxRegime: "4" } });
    await company().update();

    expect(calls[0].body).not.toHaveProperty("block_activity_mismatch");
    expect(calls[1].body).toEqual({});
  });
});

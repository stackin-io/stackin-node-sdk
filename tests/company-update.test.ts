import { beforeEach, describe, expect, it } from "vitest";

import {
  APIError,
  COMPANY_HEADER,
  Company,
  CompanyUpdate,
  InsufficientPermissionError,
  ValidationError,
} from "../src";

const BASE = "https://sdk.test/api/v1";

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

function issuer(
  status = 200,
  reply: unknown = {},
  company?: string,
  headers: Record<string, string> = {}
) {
  return new Company({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    company,
    fetch: (async (input: string, init: RequestInit) => {
      calls.push({
        method: String(init.method),
        url: String(input),
        headers: init.headers as Record<string, string>,
        body:
          init.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify(reply), { status, headers });
    }) as unknown as typeof fetch,
  });
}

const ANSWER = {
  company_id: "c1",
  ready: true,
  missing: [],
  by_document_type: {
    nfse: { ready: true, missing: [], warnings: [] },
  },
  fix_url: null,
  suggested_fiscal_fields: {},
  address: {
    street: "Av. Paulista",
    number: "1000",
    neighborhood: "Bela Vista",
    municipality_code: "3550308",
    municipality_name: "São Paulo",
    zip_code: "01310100",
    state: "SP",
  },
  fiscal_fields: { tax_regime: "1" },
};

describe("Company.update", () => {
  it("patches /company with both groups in snake_case", async () => {
    const result = await issuer(200, ANSWER).update({
      address: {
        street: "Av. Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        municipalityCode: "3550308",
        municipalityName: "São Paulo",
        zipCode: "01310100",
      },
      fiscalFields: {
        taxRegime: "1",
        simplesNacional: "3",
        simplesApuracao: "1",
        stateRegistration: "ISENTO",
        serviceCode: "01.07.00",
      },
    });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}/company`);
    expect(calls[0].body).toEqual({
      address: {
        street: "Av. Paulista",
        number: "1000",
        neighborhood: "Bela Vista",
        municipality_code: "3550308",
        municipality_name: "São Paulo",
        zip_code: "01310100",
      },
      fiscal_fields: {
        tax_regime: "1",
        simples_nacional: "3",
        simples_apuracao: "1",
        state_registration: "ISENTO",
        service_code: "01.07.00",
      },
    });
    expect(result).toEqual(ANSWER);
  });

  it("strips the CEP mask", async () => {
    await issuer().update({ address: { zipCode: "01310-100" } });
    expect(calls[0].body).toEqual({ address: { zip_code: "01310100" } });

    await issuer().update({ address: { zipCode: "01.310 100" } });
    expect(calls[1].body).toEqual({ address: { zip_code: "01310100" } });
  });

  it("sends {} for a call with nothing", async () => {
    await issuer().update();
    await issuer().update({});
    await issuer().update({ address: {}, fiscalFields: {} });
    await issuer().update({
      address: { street: undefined },
      fiscalFields: { taxRegime: null as unknown as string },
    });

    expect(calls.map((call) => call.body)).toEqual([{}, {}, {}, {}]);
  });

  it("sends only the group given", async () => {
    await issuer().update({ fiscalFields: { taxRegime: "4" } });
    expect(calls[0].body).toEqual({ fiscal_fields: { tax_regime: "4" } });
  });

  it("sends the company of the client and of the call", async () => {
    await issuer(200, {}, "acme").update({ address: { number: "1" } });
    await issuer(200, {}, "acme").update(
      { address: { number: "1" } },
      { company: "other" }
    );

    expect(calls[0].headers[COMPANY_HEADER]).toBe("acme");
    expect(calls[1].headers[COMPANY_HEADER]).toBe("other");
  });

  const refusals: Array<[string, unknown, RegExp]> = [
    ["complement", { address: { complement: "Sala 1" } }, /complement/],
    ["state", { address: { state: "SP" } }, /state/],
    ["a snake_case key", { address: { zip_code: "01310100" } }, /zip_code/],
    ["an unknown fiscal field", { fiscalFields: { crt: "1" } }, /crt/],
    ["an unknown group", { name: "Acme" }, /name/],
    [
      "a municipality code that is not 7 digits",
      { address: { municipalityCode: "355030" } },
      /7-digit/,
    ],
    [
      "a CEP that is not 8 digits",
      { address: { zipCode: "0131-010" } },
      /8-digit/,
    ],
    ["taxRegime 5", { fiscalFields: { taxRegime: "5" } }, /taxRegime/],
    [
      "simplesNacional 4",
      { fiscalFields: { simplesNacional: "4" } },
      /simplesNacional/,
    ],
    [
      "simplesApuracao 0",
      { fiscalFields: { simplesApuracao: "0" } },
      /simplesApuracao/,
    ],
    ["a number as a value", { address: { number: 10 } }, /string/],
    ["an address that is a list", { address: [] }, /object/],
  ];

  for (const [name, changes, message] of refusals) {
    it(`refuses ${name} before the call`, async () => {
      const call = issuer().update(changes as CompanyUpdate);
      await expect(call).rejects.toBeInstanceOf(ValidationError);
      await expect(issuer().update(changes as CompanyUpdate)).rejects.toThrow(
        message
      );
      expect(calls).toHaveLength(0);
    });
  }

  it("surfaces a 403 for fiscal fields as an APIError", async () => {
    const call = issuer(403, {
      detail: "Only the company owner may change fiscal_fields.",
    }).update({ fiscalFields: { taxRegime: "1" } });

    await expect(call).rejects.toBeInstanceOf(APIError);
    await expect(call).rejects.not.toBeInstanceOf(InsufficientPermissionError);
    await expect(call).rejects.toMatchObject({ statusCode: 403 });
  });

  it("surfaces a missing company:write as InsufficientPermissionError", async () => {
    const call = issuer(403, {
      detail: {
        code: "INSUFFICIENT_PERMISSION",
        message: "needs company:write",
      },
    }).update({ address: { number: "1" } });

    await expect(call).rejects.toBeInstanceOf(InsufficientPermissionError);
  });

  it("surfaces a 503 from the city table as an APIError", async () => {
    const call = issuer(
      503,
      { detail: "The municipality could not be checked right now" },
      undefined,
      { "Retry-After": "30" }
    ).update({ address: { municipalityCode: "3550308" } });

    await expect(call).rejects.toBeInstanceOf(APIError);
    await expect(call).rejects.toMatchObject({ statusCode: 503 });
  });
});

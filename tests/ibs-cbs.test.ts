import { beforeEach, describe, expect, it } from "vitest";

import {
  APIError,
  COMPANY_HEADER,
  FiscalReference,
  IbsCbsCalculationRequest,
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

const ANSWER = {
  simulated: true,
  notice: "Simulation only",
  document_type: "nfe",
  operation_date: "2026-03-10",
  items: [
    {
      cst: "000",
      classification: "000001",
      indicators: { group: 1, reduction: 0, deferral: 0 },
      has_group: true,
      rates: { rate_state: "0.10", rate_city: "0.00", rate_federal: "0.90" },
      rates_source: "official_2026",
      reduction_ibs: null,
      reduction_cbs: null,
      effective_rates: null,
      deferral: null,
      amounts: {
        base: "100.00",
        ibs_state: "0.10",
        ibs_city: "0.00",
        ibs: "0.10",
        cbs: "0.90",
        deferred_ibs_state: "0.00",
        deferred_ibs_city: "0.00",
        deferred_cbs: "0.00",
      },
      added_later: true,
    },
  ],
  total: {
    base: "100.00",
    ibs_state: "0.10",
    ibs_city: "0.00",
    ibs: "0.10",
    cbs: "0.90",
    deferred_ibs_state: "0.00",
    deferred_ibs_city: "0.00",
    deferred_cbs: "0.00",
  },
};

function reference(status = 200, reply: unknown = ANSWER) {
  return new FiscalReference({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: (async (input: string, init: RequestInit) => {
      calls.push({
        method: String(init.method),
        url: String(input),
        headers: init.headers as Record<string, string>,
        body:
          init.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify(reply), { status, headers: {} });
    }) as unknown as typeof fetch,
  });
}

const MINIMAL: IbsCbsCalculationRequest = {
  operationDate: "2026-03-10",
  items: [{ cst: "000", classification: "000001", amount: 100 }],
};

describe("calculateIbsCbs", () => {
  it("posts only what is set, in snake_case", async () => {
    await reference().calculateIbsCbs(MINIMAL);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://sdk.test/api/v1/ibs-cbs/calculate");
    expect(calls[0].body).toEqual({
      operation_date: "2026-03-10",
      items: [{ cst: "000", classification: "000001", amount: 100 }],
    });
  });

  it("sends every field when all are set", async () => {
    await reference().calculateIbsCbs({
      documentType: "nfse",
      operationDate: "2027-01-05",
      rates: { rateState: 17.5, rateCity: 0, rateFederal: 8.8 },
      items: [
        {
          cst: "200",
          classification: "200003",
          base: 50,
          rateState: 1,
          rateCity: 2,
          rateFederal: 3,
          reductionIbs: 60,
          reductionCbs: 60,
        },
      ],
    });

    expect(calls[0].body).toEqual({
      document_type: "nfse",
      operation_date: "2027-01-05",
      rates: { rate_state: 17.5, rate_city: 0, rate_federal: 8.8 },
      items: [
        {
          cst: "200",
          classification: "200003",
          base: 50,
          rate_state: 1,
          rate_city: 2,
          rate_federal: 3,
          reduction_ibs: 60,
          reduction_cbs: 60,
        },
      ],
    });
  });

  it("leaves out empty rates and null fields", async () => {
    await reference().calculateIbsCbs({
      ...MINIMAL,
      rates: {},
      items: [
        {
          cst: "000",
          classification: "000001",
          amount: 100,
          rateState: undefined,
          reductionIbs: null as unknown as undefined,
        },
      ],
    });

    expect(calls[0].body).toEqual(MINIMAL_BODY);
  });

  it("decodes the typed response and keeps unknown fields", async () => {
    const result = await reference().calculateIbsCbs(MINIMAL);

    expect(result.simulated).toBe(true);
    expect(result.items[0].rates_source).toBe("official_2026");
    expect(result.items[0].amounts.ibs).toBe("0.10");
    expect(result.items[0].indicators.group).toBe(1);
    expect(result.items[0].added_later).toBe(true);
    expect(result.total.cbs).toBe("0.90");
  });

  it("sends the company header only when asked", async () => {
    await reference().calculateIbsCbs(MINIMAL);
    await reference().calculateIbsCbs(MINIMAL, { company: "00000000000191" });

    expect(calls[0].headers[COMPANY_HEADER]).toBeUndefined();
    expect(calls[1].headers[COMPANY_HEADER]).toBe("00000000000191");
  });

  it("raises an ordinary APIError on a 422", async () => {
    const failing = reference(422, {
      detail: { code: "IBS_CBS_RATES_REQUIRED", message: "rates required" },
    });

    await expect(failing.calculateIbsCbs(MINIMAL)).rejects.toBeInstanceOf(
      APIError
    );
  });

  const item = { cst: "000", classification: "000001", amount: 100 };
  const refusals: Array<[string, unknown, RegExp]> = [
    ["no items", { ...MINIMAL, items: [] }, /1 to 990/],
    [
      "991 items",
      { ...MINIMAL, items: Array.from({ length: 991 }, () => item) },
      /1 to 990/,
    ],
    ["a bad date", { ...MINIMAL, operationDate: "10/03/2026" }, /YYYY-MM-DD/],
    [
      "an impossible date",
      { ...MINIMAL, operationDate: "2026-02-31" },
      /date/,
    ],
    ["a bad document type", { ...MINIMAL, documentType: "cte" }, /one of/],
    [
      "a 2-digit cst",
      { ...MINIMAL, items: [{ ...item, cst: "00" }] },
      /cst must be 3 digits/,
    ],
    [
      "a 5-digit classification",
      { ...MINIMAL, items: [{ ...item, classification: "00000" }] },
      /classification must be 6 digits/,
    ],
    [
      "neither amount nor base",
      { ...MINIMAL, items: [{ cst: "000", classification: "000001" }] },
      /amount or base/,
    ],
    [
      "a zero amount",
      { ...MINIMAL, items: [{ ...item, amount: 0 }] },
      /amount must be greater than 0/,
    ],
    [
      "a rate above 100",
      { ...MINIMAL, items: [{ ...item, rateFederal: 100.5 }] },
      /rateFederal/,
    ],
    [
      "a negative reduction",
      { ...MINIMAL, items: [{ ...item, reductionCbs: -1 }] },
      /reductionCbs/,
    ],
    [
      "a shared rate out of range",
      { ...MINIMAL, rates: { rateState: 101 } },
      /rates.rateState/,
    ],
    [
      "an unknown field",
      { ...MINIMAL, items: [{ ...item, rate_state: 1 }] },
      /does not take rate_state/,
    ],
  ];

  for (const [name, request, message] of refusals) {
    it(`refuses ${name} before the call`, async () => {
      await expect(
        reference().calculateIbsCbs(request as IbsCbsCalculationRequest)
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        reference().calculateIbsCbs(request as IbsCbsCalculationRequest)
      ).rejects.toThrow(message);
      expect(calls).toHaveLength(0);
    });
  }
});

const MINIMAL_BODY = {
  operation_date: "2026-03-10",
  items: [{ cst: "000", classification: "000001", amount: 100 }],
};

describe("ibsCbs on a product", () => {
  it("serialises the NFS-e shape with no rates", () => {
    const product = new br.Product({
      description: "Consultoria",
      unitPrice: 100,
      ibsCbs: {
        cst: "000",
        classification: "000001",
        operation_indicator: "010101",
      },
    }).toJSON() as { product: { br: { ibs_cbs: unknown } } };

    expect(product.product.br.ibs_cbs).toEqual({
      cst: "000",
      classification: "000001",
      operation_indicator: "010101",
    });
    expect(JSON.stringify(product)).not.toContain("rate_");
  });

  it("keeps the NF-e shape unchanged", () => {
    const product = new br.Product({
      description: "Arroz",
      unitPrice: 100,
      ncm: "10063021",
      cfop: "5102",
      ibsCbs: {
        cst: "200",
        classification: "200003",
        rate_state: 0.1,
        rate_city: 0,
        rate_federal: 0.9,
        reduction_ibs: 60,
      },
    }).toJSON() as { product: { br: { ibs_cbs: unknown } } };

    expect(product.product.br.ibs_cbs).toEqual({
      cst: "200",
      classification: "200003",
      rate_state: 0.1,
      rate_city: 0,
      rate_federal: 0.9,
      reduction_ibs: 60,
    });
  });

  it("refuses an operation_indicator that is not 6 digits", () => {
    expect(
      () =>
        new br.Product({
          description: "Consultoria",
          unitPrice: 100,
          ibsCbs: {
            cst: "000",
            classification: "000001",
            operation_indicator: "1234",
          },
        })
    ).toThrow(ValidationError);
  });
});

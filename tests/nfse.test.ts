import { beforeEach, describe, expect, it } from "vitest";

import {
  Address,
  Company,
  DocumentType,
  FiscalReference,
  Invoice,
  Items,
  ValidationError,
  br,
  type IssueRequest,
  type NfseDetails,
} from "../src";

type Wire = { [key: string]: Wire };

type Call = {
  method: string;
  url: string;
  body?: Wire;
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
      body:
        init.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
}

const options = (status: number, reply: unknown = {}) => ({
  apiKey: "k",
  baseUrl: "https://sdk.test",
  fetch: fakeFetch(status, reply),
});

const KEY = `351234ABCDEFGH123456${"0".repeat(30)}`;
const NFE_KEY = "3".repeat(44);

const service = (fields: Record<string, unknown> = {}) =>
  new br.Product({
    description: "Consultoria",
    unitPrice: 100,
    serviceCode: "1.07",
    ...fields,
  });

const request = (fields: Record<string, unknown> = {}) => ({
  documentType: DocumentType.NFSE,
  clientName: "Tomador",
  taxId: "11222333000181",
  items: [service()],
  ...fields,
});

async function sent(fields: Record<string, unknown> = {}, method = "issue") {
  const invoice = new Invoice(
    options(200, method === "validate" ? { valid: true } : { result: {} })
  );
  const given = request(fields) as unknown as IssueRequest;
  await (method === "validate"
    ? invoice.validate(given)
    : invoice.issue(given));
  return calls[0].body as Wire;
}

describe("the fields left unset", () => {
  it("are not in the body", async () => {
    const body = await sent();

    for (const key of [
      "nfse",
      "recipient_municipal_registration",
      "foreign_id_missing_reason",
    ]) {
      expect(body).not.toHaveProperty(key);
    }
    for (const key of [
      "nbs",
      "municipal_service_code",
      "internal_code",
      "conditional_discount",
    ]) {
      expect(body.items[0]).not.toHaveProperty(key);
    }
  });

  it("leave out an empty nfse", async () => {
    expect(await sent({ nfse: {} })).not.toHaveProperty("nfse");
  });
});

describe("line and recipient fields", () => {
  it("go out by their API names", async () => {
    const body = await sent({
      items: [
        service({
          municipalServiceCode: "001",
          internalCode: "SRV01",
          conditionalDiscount: 5.5,
        }),
      ],
      recipientMunicipalRegistration: "12345",
      foreignIdMissingReason: 2,
    });

    expect(body.items[0].municipal_service_code).toBe("001");
    expect(body.items[0].internal_code).toBe("SRV01");
    expect(body.items[0].conditional_discount).toBe("5.5");
    expect(body.recipient_municipal_registration).toBe("12345");
    expect(body.foreign_id_missing_reason).toBe(2);
  });

  it("go out on validate too", async () => {
    const body = await sent(
      { nfse: { competenceDate: "2026-11-01" } },
      "validate"
    );

    expect(body.nfse).toEqual({ competence_date: "2026-11-01" });
  });

  it("carry the complement and the foreign address fields", async () => {
    const body = await sent({
      taxId: undefined,
      foreignIdMissingReason: 1,
      recipientAddress: new Address({
        state: "EX",
        countryIso2: "US",
        postalCode: "10001",
        province: "NY",
        complement: "Suite 4",
        street: "5th Avenue",
        number: "1",
        neighborhood: "Midtown",
        city: "New York",
      }),
    });

    expect(body.recipient_address).toMatchObject({
      country_iso2: "US",
      postal_code: "10001",
      province: "NY",
      complement: "Suite 4",
    });
    expect(body).not.toHaveProperty("tax_id");
  });

  it("need no CEP for a retained NFS-e to a recipient abroad", async () => {
    const body = await sent({
      taxId: undefined,
      foreignId: "PT12345678",
      items: [service({ taxRetained: true })],
      recipientAddress: new Address({
        state: "EX",
        countryIso2: "PT",
        postalCode: "1000",
        province: "Lisboa",
        street: "Rua",
        number: "1",
        neighborhood: "Centro",
        city: "Lisboa",
      }),
    });

    expect(body.items[0].tax_retained).toBe(true);
  });

  it("are refused when malformed", () => {
    for (const fields of [
      { municipalServiceCode: "12" },
      { municipalServiceCode: "1234" },
      { internalCode: "has space" },
      { internalCode: "x".repeat(21) },
      { conditionalDiscount: 0 },
      { conditionalDiscount: "1.234" },
    ]) {
      expect(() => service(fields)).toThrow(ValidationError);
    }
    for (const fields of [
      { countryIso2: "usa" },
      { postalCode: "" },
      { postalCode: "x".repeat(12) },
      { province: "x".repeat(61) },
    ]) {
      expect(() => new Address(fields)).toThrow(ValidationError);
    }
  });

  it("refuse a foreignIdMissingReason outside 1 and 2", async () => {
    await expect(
      new Invoice(options(200)).issue(
        request({ foreignIdMissingReason: 0 }) as unknown as IssueRequest
      )
    ).rejects.toThrow(ValidationError);
  });
});

describe("the nfse object", () => {
  const full: NfseDetails = {
    approximateTaxes: { federalPercent: 4.5, statePercent: 0 },
    competenceDate: "2026-11-01",
    serviceCityCode: "3550308",
    iss: {
      taxation: "taxable",
      rate: 2.5,
      retention: "none",
      suspension: { type: "judicial", processNumber: "1".repeat(30) },
    },
    federal: {
      pisCofins: { cst: "01", base: 100, pisRate: "0.65" },
      irrfWithheld: "1.50",
    },
    deductions: {
      documents: [
        {
          type: 2,
          nfseKey: KEY,
          issueDate: "2026-10-01",
          totalAmount: 50,
          deductedAmount: 40,
        },
        {
          type: 7,
          municipalNfse: {
            cityCode: "3550308",
            number: "12",
            verificationCode: "AB1",
          },
          issueDate: "2026-10-02",
          totalAmount: 10,
          deductedAmount: 5,
          supplier: {
            taxId: "11222333000181",
            name: "Fornecedor",
            address: {
              street: "Rua",
              number: "1",
              neighborhood: "Centro",
              cityCode: "3550308",
              zipCode: "01001000",
            },
          },
        },
      ],
    },
    substitution: {
      accessKey: KEY,
      reasonCode: "99",
      reason: "Correcao do valor do servico",
    },
    construction: { workIdType: "cno", workId: "123" },
    event: {
      name: "Festival",
      startDate: "2026-11-01",
      endDate: "2026-11-02",
      address: {
        zipCode: "01001000",
        street: "Rua",
        number: "1",
        neighborhood: "Centro",
      },
    },
    references: { orderNumber: "PO-1", orderItems: ["a", "b"] },
    intermediary: {
      foreignId: "NIF123",
      name: "Agent Ltd",
      address: {
        street: "Road",
        number: "2",
        neighborhood: "Soho",
        countryCode: "GB",
        postalCode: "W1",
        city: "London",
        state: "England",
      },
    },
    foreignTrade: {
      serviceMode: 1,
      relationship: 0,
      currencyCode: "220",
      foreignAmount: "20.00",
      providerSupport: 1,
      recipientSupport: 1,
      temporaryGoods: 1,
      shareWithMdic: false,
    },
  };

  it("goes out in snake_case with decimals as strings", async () => {
    const nfse = (await sent({ nfse: full })).nfse;

    expect(nfse.approximate_taxes).toEqual({
      federal_percent: "4.5",
      state_percent: "0",
    });
    expect(nfse.competence_date).toBe("2026-11-01");
    expect(nfse.service_city_code).toBe("3550308");
    expect(nfse.iss.rate).toBe("2.5");
    expect(nfse.iss.suspension.process_number).toBe("1".repeat(30));
    expect(nfse.federal.pis_cofins).toEqual({
      cst: "01",
      base: "100",
      pis_rate: "0.65",
    });
    expect(nfse.federal.irrf_withheld).toBe("1.50");
    expect(nfse.deductions.documents[0]).toEqual({
      type: 2,
      nfse_key: KEY,
      issue_date: "2026-10-01",
      total_amount: "50",
      deducted_amount: "40",
    });
    expect(nfse.deductions.documents[1].municipal_nfse.verification_code).toBe(
      "AB1"
    );
    expect(nfse.deductions.documents[1].supplier.address.city_code).toBe(
      "3550308"
    );
    expect(nfse.substitution).toEqual({
      access_key: KEY,
      reason_code: "99",
      reason: "Correcao do valor do servico",
    });
    expect(nfse.construction).toEqual({ work_id_type: "cno", work_id: "123" });
    expect(nfse.event.start_date).toBe("2026-11-01");
    expect(nfse.event.address.zip_code).toBe("01001000");
    expect(nfse.references.order_items).toEqual(["a", "b"]);
    expect(nfse.intermediary.address.country_code).toBe("GB");
    expect(nfse.foreign_trade.foreign_amount).toBe("20.00");
    expect(nfse.foreign_trade.share_with_mdic).toBe(false);
    expect(nfse).not.toHaveProperty("service_country_code");
  });

  it("leaves unset fields out of each group", async () => {
    const nfse = (await sent({ nfse: { iss: { rate: 2 } } })).nfse;

    expect(nfse).toEqual({ iss: { rate: "2" } });
  });

  it("refuses unknown fields", () => {
    const issue = (nfse: unknown) =>
      new Invoice(options(200)).issue(
        request({ nfse }) as unknown as IssueRequest
      );

    return Promise.all([
      expect(issue({ unknown: 1 })).rejects.toThrow(ValidationError),
      expect(issue({ iss: { rate: 1, other: 2 } })).rejects.toThrow(
        ValidationError
      ),
    ]);
  });

  it("refuses shapes outside the layout", async () => {
    const refused = [
      { iss: { taxation: "free" } },
      { iss: { retention: "both" } },
      { iss: { immunityType: 6 } },
      { iss: { rate: 5.01 } },
      { iss: { rate: 0 } },
      { federal: { pisCofins: { cst: "10" } } },
      { federal: { irrfWithheld: 0 } },
      { approximateTaxes: { simplesPercent: 100 } },
      { approximateTaxes: { federalPercent: "1.234" } },
      { approximateTaxes: { federalAmount: -1 } },
      { serviceCityCode: "123" },
      { serviceCountryCode: "br" },
      { competenceDate: "2026-02-30" },
      { competenceDate: "01/11/2026" },
      { references: { orderItems: [] } },
      { references: { orderNumber: "" } },
      { substitution: { accessKey: "1", reasonCode: "01" } },
      { substitution: { accessKey: KEY, reasonCode: "06" } },
      { substitution: { accessKey: KEY, reasonCode: "99", reason: "short" } },
      { substitution: { reasonCode: "01" } },
      { iss: { suspension: { type: "judicial", processNumber: "1" } } },
      { intermediary: { name: "x", foreignIdMissingReason: 0 } },
      { intermediary: {} },
      {
        deductions: {
          documents: [
            {
              type: 10,
              nfeKey: NFE_KEY,
              issueDate: "2026-01-01",
              totalAmount: 1,
              deductedAmount: 1,
            },
          ],
        },
      },
      {
        deductions: {
          documents: [
            {
              type: 1,
              nfeKey: "1",
              issueDate: "2026-01-01",
              totalAmount: 1,
              deductedAmount: 1,
            },
          ],
        },
      },
    ];
    for (const nfse of refused) {
      await expect(
        new Invoice(options(200)).issue(
          request({ nfse }) as unknown as IssueRequest
        ),
        JSON.stringify(nfse)
      ).rejects.toThrow(ValidationError);
    }
  });

  it("refuses foreign trade codes outside their sets", async () => {
    const base = {
      serviceMode: 1,
      relationship: 0,
      currencyCode: "220",
      foreignAmount: 1,
      providerSupport: 1,
      recipientSupport: 1,
      temporaryGoods: 1,
    };
    await sent({ nfse: { foreignTrade: base } });
    for (const change of [
      { serviceMode: 0 },
      { relationship: 7 },
      { providerSupport: 9 },
      { recipientSupport: 27 },
      { temporaryGoods: 4 },
      { currencyCode: "US" },
    ]) {
      await expect(
        new Invoice(options(200)).issue(
          request({
            nfse: { foreignTrade: { ...base, ...change } },
          }) as unknown as IssueRequest
        )
      ).rejects.toThrow(ValidationError);
    }
  });

  it("leaves the rules between groups to the API", async () => {
    await sent({
      nfse: {
        serviceCityCode: "3550308",
        serviceCountryCode: "US",
        approximateTaxes: { simplesPercent: 1, federalPercent: 1 },
        deductions: { percent: 1, amount: 1 },
        construction: {},
        intermediary: { name: "x" },
        event: { name: "x", startDate: "2026-01-01", endDate: "2026-01-02" },
      },
    });

    expect(calls).toHaveLength(1);
  });
});

describe("the NFS-e IBS/CBS group", () => {
  const group = {
    cst: "000",
    classification: "000001",
    operation_indicator: "100301",
    personal_use: true,
    government: { operation_type: "1", entity_type: "4" },
    referenced_nfse: [KEY],
    recipient: { tax_id: "11222333000181", name: "Destino" },
    real_estate: {
      lease: {
        co_ownership_percent: 100,
        total_amount: 1000,
        original_due_date: "2026-12-05",
      },
      units: [{ cib: "1234567A" }],
    },
    regular_taxation: { cst: "000", classification: "000001" },
    deferral: { state_percent: 1, city_percent: 2, cbs_percent: 3 },
    presumed_credit: "01",
  };

  it("goes out under br with the group's own names", async () => {
    const body = await sent({
      items: [service({ nbs: "115021000", ibsCbs: group })],
    });

    expect(body.items[0].product.br.ibs_cbs).toEqual(group);
  });

  it("keeps an NF-e group as it was", async () => {
    const body = await sent({
      items: [
        service({
          ibsCbs: { cst: "000", classification: "000001", rate_state: 0.1 },
        }),
      ],
    });

    expect(body.items[0].product.br.ibs_cbs).toEqual({
      cst: "000",
      classification: "000001",
      rate_state: 0.1,
    });
  });

  it("refuses shapes outside the layout", () => {
    const base = { cst: "000", classification: "000001" };
    for (const extra of [
      { presumed_credit: "1" },
      { referenced_nfse: ["1"] },
      { movable_goods: [] },
      { government: { operation_type: "6" } },
      { recipient: { name: "x", phone: "12" } },
      { recipient: { name: "x", no_nif_reason: "3" } },
      { recipient: { name: "x", tax_id: "1" } },
      { unknown_group: 1, deferral: { state_percent: 1 } },
    ]) {
      expect(
        () => service({ ibsCbs: { ...base, ...extra } }),
        JSON.stringify(extra)
      ).toThrow(ValidationError);
    }
  });
});

describe("the catalog and the company", () => {
  it("send the service codes on an item", async () => {
    const catalog = new Items(options(200));
    await catalog.upsert({
      kind: "service",
      description: "Consultoria",
      serviceCode: "1.07",
      municipalServiceCode: "001",
      internalCode: "SRV01",
    });
    await catalog.update("id1", {
      municipalServiceCode: null,
      internalCode: "X1",
    });

    expect(calls[0].body).toMatchObject({
      municipal_service_code: "001",
      internal_code: "SRV01",
    });
    expect(calls[1].body).toEqual({
      municipal_service_code: null,
      internal_code: "X1",
    });
  });

  it("takes the NFS-e fiscal fields", async () => {
    await new Company(options(200)).update({
      fiscalFields: {
        approximateTaxSimplesPercent: "3.50",
        approximateTaxFederalPercent: "13.45",
        approximateTaxStatePercent: "0",
        approximateTaxMunicipalPercent: "2",
        municipalRegistration: "12345",
        specialTaxRegime: "0",
        issRate: "2.50",
      },
    });

    expect(calls[0].body).toEqual({
      fiscal_fields: {
        approximate_tax_simples_percent: "3.50",
        approximate_tax_federal_percent: "13.45",
        approximate_tax_state_percent: "0",
        approximate_tax_municipal_percent: "2",
        municipal_registration: "12345",
        special_tax_regime: "0",
        iss_rate: "2.50",
      },
    });
  });

  it("refuses a special tax regime outside the set", async () => {
    await expect(
      new Company(options(200)).update({
        fiscalFields: { specialTaxRegime: "7" },
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe("nbsSuggestions", () => {
  const ANSWER = {
    service_code: "010700",
    suggestions: [
      {
        nbs: "115021000",
        description: "Servicos de TI",
        operation_indicator: "100301",
        ibs_cbs_classification: "000001",
        classification_name: "Padrao",
      },
    ],
    source: { path: "nfse/anexo-viii.csv", date: "2026-01-01" },
  };

  it("gets the route and answers the body", async () => {
    const result = await new FiscalReference(
      options(200, ANSWER)
    ).nbsSuggestions("1.07");

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(
      "https://sdk.test/api/v1/service-codes/1.07/nbs"
    );
    expect(result.service_code).toBe("010700");
    expect(result.suggestions[0].nbs).toBe("115021000");
    expect(result.suggestions[0].operation_indicator).toBe("100301");
    expect(result.source.path).toBe("nfse/anexo-viii.csv");
  });

  it("answers an empty list as an answer", async () => {
    const result = await new FiscalReference(
      options(200, { ...ANSWER, suggestions: [] })
    ).nbsSuggestions("010302");

    expect(result.suggestions).toEqual([]);
  });

  it("keeps a code inside its path segment", async () => {
    const reference = new FiscalReference(options(200, ANSWER));
    for (const code of ["", ".", ".."]) {
      await expect(reference.nbsSuggestions(code)).rejects.toThrow();
    }
    await reference.nbsSuggestions("1/07");

    expect(calls[0].url).toBe(
      "https://sdk.test/api/v1/service-codes/1%2F07/nbs"
    );
  });

  it("refuses a code over twelve characters", async () => {
    await expect(
      new FiscalReference(options(200, ANSWER)).nbsSuggestions("1".repeat(13))
    ).rejects.toThrow(ValidationError);
  });
});

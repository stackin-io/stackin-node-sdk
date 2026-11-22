import { beforeEach, describe, expect, it } from "vitest";

import {
  Address,
  APIError,
  COMPANY_HEADER,
  DocumentType,
  Invoice,
  ItemAlreadyExistsError,
  ItemInactiveError,
  ItemKindMismatchError,
  ItemNotFoundError,
  ItemTaxRegimeMismatchError,
  ItemTaxRequiredError,
  Items,
  ValidationError,
  br,
} from "../src";

const BASE = "https://sdk.test/api/v1";
const ITEM_ID = "5c1f0a52-3b7e-4d18-8a26-9e4b7c2d1f03";

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

function fakeFetch(status = 200, reply: unknown = {}): typeof fetch {
  return (async (input: string, init: RequestInit) => {
    calls.push({
      method: String(init.method),
      url: String(input),
      headers: init.headers as Record<string, string>,
      body:
        init.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    const text = status === 204 ? "" : JSON.stringify(reply);
    return new Response(status === 204 ? null : text, { status });
  }) as unknown as typeof fetch;
}

function items(status = 200, reply: unknown = {}, company?: string): Items {
  return new Items({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: fakeFetch(status, reply),
    company,
  });
}

const ITEM = {
  id: ITEM_ID,
  company_id: "c1",
  kind: "product",
  description: "Cafe torrado 500g",
  code: "CAF-500",
  unit_price: 18.9,
  is_active: true,
};

describe("Items.list", () => {
  it("sends no params without a filter", async () => {
    await items().list();

    expect(calls[0].method).toBe("GET");
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/items`);
    expect([...url.searchParams]).toEqual([]);
    expect(calls[0].body).toBeUndefined();
  });

  it("sends every filter by its API name", async () => {
    await items().list({
      kind: "service",
      search: "cafe",
      source: "nuvemshop",
      isActive: false,
      limit: 10,
      offset: 20,
      sortBy: "unit_price",
      orderBy: "desc",
    });

    const url = new URL(calls[0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      kind: "service",
      search: "cafe",
      source: "nuvemshop",
      is_active: "false",
      limit: "10",
      offset: "20",
      sort_by: "unit_price",
      order_by: "desc",
    });
  });

  it("returns the page as sent", async () => {
    const page = { data: [ITEM], total: 1 };
    const result = await items(200, page).list();

    expect(result).toEqual(page);
  });
});

describe("Items.get", () => {
  it("reads one item by id", async () => {
    const result = await items(200, ITEM).get(ITEM_ID);

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/items/${ITEM_ID}`);
    expect(result.unit_price).toBe(18.9);
  });

  it("refuses an id that would leave its segment", async () => {
    await expect(items().get("..")).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it("escapes the id as one path segment in every call", async () => {
    const client = items();
    await client.get("a b/c");
    await client.update("a b/c", { notes: "x" });
    await client.deactivate("a b/c");
    await client.reactivate("a b/c");

    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.url).toBe(`${BASE}/items/a%20b%2Fc`);
    }
  });
});

describe("Items.create", () => {
  it("sends only the fields given, by their API names", async () => {
    await items().create({ kind: "product", description: "Cafe" });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/items`);
    expect(calls[0].body).toEqual({ kind: "product", description: "Cafe" });
  });

  it("sends every field by its API name", async () => {
    await items().create({
      kind: "product",
      description: "Cafe",
      code: "CAF-500",
      unitPrice: 18.9,
      unit: "UN",
      externalReference: "ns-variant-1",
      notes: "n",
      source: "nuvemshop",
      ncm: "09012100",
      cfop: "5102",
      taxSituation: "102",
      origin: "0",
      cest: "1709600",
      gtin: "7891000315507",
    });
    await items().create({
      kind: "service",
      description: "Consultoria",
      serviceCode: "1.07",
      issRetained: false,
    });

    expect(calls[0].body).toEqual({
      kind: "product",
      description: "Cafe",
      code: "CAF-500",
      unit_price: 18.9,
      unit: "UN",
      external_reference: "ns-variant-1",
      notes: "n",
      source: "nuvemshop",
      ncm: "09012100",
      cfop: "5102",
      tax_situation: "102",
      origin: "0",
      cest: "1709600",
      gtin: "7891000315507",
    });
    expect(calls[1].body).toEqual({
      kind: "service",
      description: "Consultoria",
      service_code: "1.07",
      iss_retained: false,
    });
  });

  it("reports a 201 as created", async () => {
    const result = await items(201, ITEM).upsert({
      kind: "product",
      description: "Cafe",
    });

    expect(result.created).toBe(true);
    expect(result.item).toEqual(ITEM);
  });

  it("create answers the item alone", async () => {
    const item = await items(201, ITEM).create({
      kind: "product",
      description: "Cafe",
    });

    expect(item).toEqual(ITEM);
  });

  it("reports a 200 as an existing item updated", async () => {
    const result = await items(200, ITEM).upsert({
      kind: "product",
      description: "Cafe",
      externalReference: "ns-variant-1",
    });

    expect(result.created).toBe(false);
    expect(result.item.id).toBe(ITEM_ID);
  });
});

describe("Items.update", () => {
  it("sends only the fields given", async () => {
    await items().update(ITEM_ID, { unitPrice: 20 });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}/items/${ITEM_ID}`);
    expect(calls[0].body).toEqual({ unit_price: 20 });
  });

  it("sends null to clear a field", async () => {
    await items().update(ITEM_ID, { notes: null, ncm: null });

    expect(calls[0].body).toEqual({ notes: null, ncm: null });
  });
});

describe("Items.deactivate and reactivate", () => {
  it("deactivates with a DELETE and decodes nothing", async () => {
    const result = await items(204).deactivate(ITEM_ID);

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/items/${ITEM_ID}`);
    expect(calls[0].body).toBeUndefined();
    expect(result).toBeUndefined();
  });

  it("reactivates with is_active true", async () => {
    const reply = { ...ITEM, is_active: true };
    const result = await items(200, reply).reactivate(ITEM_ID);

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].body).toEqual({ is_active: true });
    expect(result).toEqual(reply);
  });
});

describe("Items company selection", () => {
  it("sends the client's company on every call", async () => {
    const client = items(200, {}, "11222333000181");

    await client.list();
    await client.get(ITEM_ID);
    await client.create({ kind: "product", description: "Cafe" });
    await client.update(ITEM_ID, { notes: "x" });
    await client.deactivate(ITEM_ID);
    await client.reactivate(ITEM_ID);

    expect(calls).toHaveLength(6);
    for (const call of calls) {
      expect(call.headers[COMPANY_HEADER]).toBe("11222333000181");
    }
  });

  it("takes a per-call company over the client's", async () => {
    await items(200, {}, "mine").get(ITEM_ID, { company: "other" });

    expect(calls[0].headers[COMPANY_HEADER]).toBe("other");
  });

  it("sends no header without a company", async () => {
    await items().list();

    expect(calls[0].headers).not.toHaveProperty(COMPANY_HEADER);
  });
});

function problem(status: number, code: string, extra: object = {}) {
  return {
    detail: { code, message: `${code} message`, item_id: ITEM_ID, ...extra },
  };
}

describe("item errors", () => {
  it("maps a 409 ITEM_EXISTS, with the item and the field", async () => {
    const error = await items(
      409,
      problem(409, "ITEM_EXISTS", { field: "code" })
    )
      .create({ kind: "product", description: "Cafe", code: "CAF-500" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ItemAlreadyExistsError);
    expect(error).toBeInstanceOf(APIError);
    expect((error as ItemAlreadyExistsError).itemId).toBe(ITEM_ID);
    expect((error as ItemAlreadyExistsError).field).toBe("code");
    expect((error as ItemAlreadyExistsError).statusCode).toBe(409);
  });

  it("raises ITEM_EXISTS from an update too", async () => {
    await expect(
      items(409, problem(409, "ITEM_EXISTS", { field: "code" })).update(
        ITEM_ID,
        { code: "TAKEN" }
      )
    ).rejects.toBeInstanceOf(ItemAlreadyExistsError);
  });

  it("maps a 404 ITEM_NOT_FOUND", async () => {
    const error = await items(404, problem(404, "ITEM_NOT_FOUND"))
      .get(ITEM_ID)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ItemNotFoundError);
    expect(error).toBeInstanceOf(APIError);
    expect((error as ItemNotFoundError).itemId).toBe(ITEM_ID);
  });

  it("maps a 422 ITEM_INACTIVE", async () => {
    const error = await invoice(422, problem(422, "ITEM_INACTIVE"))
      .issue({
        documentType: DocumentType.NFSE,
        clientName: "ACME",
        taxId: "11222333000181",
        items: [new br.Product({ itemId: ITEM_ID })],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ItemInactiveError);
    expect((error as ItemInactiveError).itemId).toBe(ITEM_ID);
  });

  it("maps a 422 ITEM_KIND_MISMATCH with the line", async () => {
    const error = await invoice(
      422,
      problem(422, "ITEM_KIND_MISMATCH", { index: 1 })
    )
      .issue({
        documentType: DocumentType.NFSE,
        clientName: "ACME",
        taxId: "11222333000181",
        items: [new br.Product({ itemId: ITEM_ID })],
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ItemKindMismatchError);
    expect((error as ItemKindMismatchError).index).toBe(1);
  });

  it("maps a 422 ITEM_TAX_REQUIRED with the line", async () => {
    const error = await invoice(
      422,
      problem(422, "ITEM_TAX_REQUIRED", { index: 0 })
    )
      .issue({
        documentType: DocumentType.NFE,
        clientName: "ACME",
        taxId: "11222333000181",
        items: [new br.Product({ itemId: ITEM_ID })],
        recipientAddress: fullAddress(),
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ItemTaxRequiredError);
    expect((error as ItemTaxRequiredError).index).toBe(0);
    expect((error as ItemTaxRequiredError).statusCode).toBe(422);
  });

  it("reads a 422 ITEM_TAX_REGIME_MISMATCH", async () => {
    const error = await invoice(
      422,
      problem(422, "ITEM_TAX_REGIME_MISMATCH", { index: 1 })
    )
      .issue({
        documentType: DocumentType.NFE,
        clientName: "ACME",
        taxId: "11222333000181",
        items: [new br.Product({ itemId: ITEM_ID })],
        recipientAddress: fullAddress(),
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ItemTaxRegimeMismatchError);
    expect((error as ItemTaxRegimeMismatchError).itemId).toBe(ITEM_ID);
    expect((error as ItemTaxRegimeMismatchError).index).toBe(1);
    expect((error as ItemTaxRegimeMismatchError).statusCode).toBe(422);
  });

  it("leaves another 409 or 422 a plain APIError", async () => {
    const e409 = await items(409, { detail: "conflict" })
      .create({ kind: "product", description: "Cafe" })
      .catch((e: unknown) => e);
    const e422 = await items(422, problem(422, "OTHER"))
      .get(ITEM_ID)
      .catch((e: unknown) => e);

    for (const error of [e409, e422]) {
      expect(error).toBeInstanceOf(APIError);
      expect(error).not.toBeInstanceOf(ItemAlreadyExistsError);
      expect(error).not.toBeInstanceOf(ItemInactiveError);
    }
  });
});

function invoice(status = 200, reply: unknown = {}): Invoice {
  return new Invoice({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: fakeFetch(status, reply),
  });
}

function fullAddress() {
  return new Address({
    street: "Rua A",
    number: "1",
    neighborhood: "Centro",
    city: "Sao Paulo",
    state: "SP",
    zipCode: "01001000",
    cityCode: "3550308",
  });
}

describe("issue lines with itemId", () => {
  it("sends only the item_id and the quantity", async () => {
    await invoice().issue({
      documentType: DocumentType.NFSE,
      clientName: "ACME",
      taxId: "11222333000181",
      items: [new br.Product({ itemId: ITEM_ID })],
    });

    const line = (calls[0].body as { items: Record<string, unknown>[] })
      .items[0];
    expect(line.item_id).toBe(ITEM_ID);
    expect(line).not.toHaveProperty("description");
    expect(line).not.toHaveProperty("tax_retained");
    expect(line.product).toEqual({ quantity: 1, used_movable_asset: false });
  });

  it("does not require ncm and cfop locally on an NF-e line", async () => {
    await invoice().issue({
      documentType: DocumentType.NFE,
      clientName: "ACME",
      taxId: "11222333000181",
      recipientAddress: fullAddress(),
      items: [new br.Product({ itemId: ITEM_ID })],
    });

    expect(calls).toHaveLength(1);
  });

  it("still requires ncm and cfop on a line without itemId", async () => {
    await expect(
      invoice().issue({
        documentType: DocumentType.NFE,
        clientName: "ACME",
        taxId: "11222333000181",
        recipientAddress: fullAddress(),
        items: [new br.Product({ description: "x", amount: 1 })],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("sends what the line sets, so it wins over the item", async () => {
    await invoice().issue({
      documentType: DocumentType.NFSE,
      clientName: "ACME",
      taxId: "11222333000181",
      items: [
        new br.Product({
          itemId: ITEM_ID,
          description: "Custom",
          unitPrice: 5,
          unit: "KG",
          quantity: 2,
          taxRetained: false,
          serviceCode: "1.07",
        }),
      ],
    });

    const line = (calls[0].body as { items: Record<string, unknown>[] })
      .items[0];
    expect(line).toMatchObject({
      item_id: ITEM_ID,
      description: "Custom",
      unit_price: "5",
      service_code: "1.07",
      tax_retained: false,
    });
    expect(line.product).toEqual({
      unit: "KG",
      quantity: 2,
      used_movable_asset: false,
    });
  });

  it("keeps a line without itemId as before", async () => {
    await invoice().issue({
      documentType: DocumentType.NFSE,
      clientName: "ACME",
      taxId: "11222333000181",
      items: [new br.Product({ description: "svc", amount: 10 })],
    });

    const line = (calls[0].body as { items: Record<string, unknown>[] })
      .items[0];
    expect(line).not.toHaveProperty("item_id");
    expect(line.tax_retained).toBe(false);
    expect(line.product).toEqual({
      unit: "UN",
      quantity: 1,
      used_movable_asset: false,
    });
  });

  it("needs a description without itemId", () => {
    expect(() => new br.Product({ amount: 1 })).toThrow();
  });

  it("refuses an empty itemId", () => {
    expect(() => new br.Product({ itemId: "" })).toThrow();
  });
});

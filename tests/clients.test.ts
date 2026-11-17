import { beforeEach, describe, expect, it } from "vitest";

import {
  Address,
  APIError,
  ClientAlreadyExistsError,
  Clients,
  COMPANY_HEADER,
  DocumentType,
  Invoice,
  ValidationError,
  br,
} from "../src";

const BASE = "https://sdk.test/api/v1";
const CLIENT_ID = "0b6c3d1e-7a2f-4e59-9c10-5d8e2f3a4b6c";

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

function clients(
  status = 200,
  reply: unknown = {},
  company?: string
): Clients {
  return new Clients({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: fakeFetch(status, reply),
    company,
  });
}

describe("Clients.list", () => {
  it("sends no params without a filter", async () => {
    await clients().list();

    expect(calls[0].method).toBe("GET");
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/clients`);
    expect([...url.searchParams]).toEqual([]);
    expect(calls[0].body).toBeUndefined();
  });

  it("sends every filter by its API name", async () => {
    await clients().list({
      search: "acme",
      source: "issued",
      isActive: false,
      limit: 10,
      offset: 20,
      sortBy: "last_used_at",
      orderBy: "asc",
    });

    const url = new URL(calls[0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: "acme",
      source: "issued",
      is_active: "false",
      limit: "10",
      offset: "20",
      sort_by: "last_used_at",
      order_by: "asc",
    });
  });

  it("returns the page as sent", async () => {
    const page = { data: [{ id: CLIENT_ID }], total: 1 };

    expect(await clients(200, page).list()).toEqual(page);
  });
});

describe("Clients.get", () => {
  it("reads one client by id", async () => {
    await clients().get(CLIENT_ID);

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/clients/${CLIENT_ID}`);
  });

  it("refuses an id that would leave its segment", async () => {
    await expect(clients().get("..")).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });
});

describe("Clients.create", () => {
  it("sends only the fields given, by their API names", async () => {
    await clients().create({ name: "ACME", taxId: "11.222.333/0001-81" });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/clients`);
    expect(calls[0].body).toEqual({
      name: "ACME",
      tax_id: "11.222.333/0001-81",
    });
  });

  it("sends every field by its API name", async () => {
    const address = new Address({
      street: "Rua A",
      number: "1",
      neighborhood: "Centro",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "01001000",
    });

    await clients().create({
      name: "ACME",
      taxId: "11222333000181",
      stateRegistration: "ISENTO",
      municipalRegistration: "123",
      email: "a@acme.test",
      phone: "+5511999999999",
      address,
      notes: "vip",
    });

    expect(calls[0].body).toEqual({
      name: "ACME",
      tax_id: "11222333000181",
      state_registration: "ISENTO",
      municipal_registration: "123",
      email: "a@acme.test",
      phone: "+5511999999999",
      address: address.toJSON(),
      notes: "vip",
    });
  });

  it("identifies a buyer abroad by foreignId", async () => {
    await clients().create({
      name: "Globex",
      foreignId: "P1234567",
      address: new Address({ state: "EX", countryCode: "2496" }),
    });

    expect(calls[0].body).toEqual({
      name: "Globex",
      foreign_id: "P1234567",
      address: { state: "EX", country_code: "2496" },
    });
  });
});

describe("Clients.update", () => {
  it("sends only the fields given", async () => {
    await clients().update(CLIENT_ID, { email: "new@acme.test" });

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}/clients/${CLIENT_ID}`);
    expect(calls[0].body).toEqual({ email: "new@acme.test" });
  });

  it("sends null to clear a field", async () => {
    await clients().update(CLIENT_ID, { phone: null, notes: null });

    expect(calls[0].body).toEqual({ phone: null, notes: null });
  });
});

describe("Clients.deactivate and reactivate", () => {
  it("deactivates with a DELETE and returns nothing", async () => {
    const result = await clients(204).deactivate(CLIENT_ID);

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/clients/${CLIENT_ID}`);
    expect(calls[0].body).toBeUndefined();
    expect(result).toBeUndefined();
  });

  it("reactivates with is_active true", async () => {
    const reply = { id: CLIENT_ID, is_active: true };
    const result = await clients(200, reply).reactivate(CLIENT_ID);

    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}/clients/${CLIENT_ID}`);
    expect(calls[0].body).toEqual({ is_active: true });
    expect(result).toEqual(reply);
  });
});

describe("Clients company selection", () => {
  it("sends the client's company on every call", async () => {
    const client = clients(200, {}, "11222333000181");

    await client.list();
    await client.get(CLIENT_ID);
    await client.create({ name: "ACME", taxId: "11222333000181" });
    await client.update(CLIENT_ID, { name: "ACME" });
    await client.deactivate(CLIENT_ID);
    await client.reactivate(CLIENT_ID);

    expect(calls).toHaveLength(6);
    for (const call of calls) {
      expect(call.headers[COMPANY_HEADER]).toBe("11222333000181");
    }
  });

  it("takes a per-call company over the client's", async () => {
    await clients(200, {}, "mine").get(CLIENT_ID, { company: "other" });

    expect(calls[0].headers[COMPANY_HEADER]).toBe("other");
  });

  it("sends no header without a company", async () => {
    await clients().list();

    expect(calls[0].headers).not.toHaveProperty(COMPANY_HEADER);
  });
});

const DUPLICATE = {
  detail: {
    code: "CLIENT_EXISTS",
    message: "This company already has a client with tax_id 11222333000181.",
    client_id: CLIENT_ID,
  },
};

describe("ClientAlreadyExistsError", () => {
  it("carries the existing client's id on a 409 duplicate", async () => {
    const error = await clients(409, DUPLICATE)
      .create({ name: "ACME", taxId: "11222333000181" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ClientAlreadyExistsError);
    expect(error).toBeInstanceOf(APIError);
    expect((error as ClientAlreadyExistsError).clientId).toBe(CLIENT_ID);
    expect((error as ClientAlreadyExistsError).statusCode).toBe(409);
    expect((error as ClientAlreadyExistsError).detail).toBe(
      DUPLICATE.detail.message
    );
  });

  it("is raised by an update that takes another client's tax id", async () => {
    await expect(
      clients(409, DUPLICATE).update(CLIENT_ID, { taxId: "11222333000181" })
    ).rejects.toBeInstanceOf(ClientAlreadyExistsError);
  });

  it("leaves another 409 a plain APIError", async () => {
    const error = await clients(409, { detail: "conflict" })
      .create({ name: "ACME", taxId: "11222333000181" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(APIError);
    expect(error).not.toBeInstanceOf(ClientAlreadyExistsError);
  });
});

function invoice(): Invoice {
  return new Invoice({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: fakeFetch(),
  });
}

function nfeItem() {
  return new br.Product({
    description: "Teclado",
    amount: 10,
    ncm: "84716052",
    cfop: "5102",
  });
}

function nfseItem(taxRetained = false) {
  return new br.Product({ description: "svc", amount: 10, taxRetained });
}

describe("Invoice.issue with clientId", () => {
  it("names the recipient by clientId alone", async () => {
    await invoice().issue({
      documentType: DocumentType.NFE,
      clientId: CLIENT_ID,
      items: [nfeItem()],
    });

    expect(calls[0].body).toEqual({
      document_type: "nfe",
      client_id: CLIENT_ID,
      items: [JSON.parse(JSON.stringify(nfeItem().toJSON()))],
    });
  });

  it("takes the client's address on an NFS-e with retained ISS", async () => {
    await invoice().issue({
      documentType: DocumentType.NFSE,
      clientId: CLIENT_ID,
      items: [nfseItem(true)],
    });

    expect(calls[0].body).not.toHaveProperty("recipient_address");
  });

  it("sends the fields given with clientId, so they win", async () => {
    await invoice().issue({
      documentType: DocumentType.NFSE,
      clientId: CLIENT_ID,
      clientName: "ACME Filial",
      taxId: "11222333000181",
      items: [nfseItem()],
    });

    expect(calls[0].body).toMatchObject({
      client_id: CLIENT_ID,
      client_name: "ACME Filial",
      tax_id: "11222333000181",
    });
  });

  it("still refuses a partial address given with clientId", async () => {
    await expect(
      invoice().issue({
        documentType: DocumentType.NFE,
        clientId: CLIENT_ID,
        items: [nfeItem()],
        recipientAddress: new Address({ state: "SP" }),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("sends update_client only when true", async () => {
    const client = invoice();
    await client.issue({
      documentType: DocumentType.NFE,
      clientId: CLIENT_ID,
      items: [nfeItem()],
      updateClient: true,
    });
    await client.issue({
      documentType: DocumentType.NFE,
      clientId: CLIENT_ID,
      items: [nfeItem()],
      updateClient: false,
    });

    expect(calls[0].body).toMatchObject({ update_client: true });
    expect(calls[1].body).not.toHaveProperty("update_client");
  });

  it("still requires clientName without clientId", async () => {
    await expect(
      invoice().issue({
        documentType: DocumentType.NFSE,
        taxId: "11222333000181",
        items: [nfseItem()],
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it("still requires taxId without clientId", async () => {
    await expect(
      invoice().issue({
        documentType: DocumentType.NFSE,
        clientName: "ACME",
        items: [nfseItem()],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("sends the same body as before without clientId", async () => {
    await invoice().issue({
      documentType: DocumentType.NFSE,
      clientName: "ACME",
      taxId: "11222333000181",
      items: [nfseItem()],
    });

    expect(Object.keys(calls[0].body as object)).toEqual([
      "document_type",
      "client_name",
      "tax_id",
      "items",
    ]);
  });
});

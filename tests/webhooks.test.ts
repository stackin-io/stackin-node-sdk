import { beforeEach, describe, expect, it } from "vitest";

import {
  APIError,
  COMPANY_HEADER,
  ValidationError,
  WEBHOOK_EVENTS,
  Webhooks,
} from "../src";

const BASE = "https://sdk.test/api/v1";
const ENDPOINT_ID = "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const SECRET = "s".repeat(16);

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

function hooks(status = 200, reply: unknown = {}, company?: string) {
  return new Webhooks({
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
      return new Response(status === 204 ? null : JSON.stringify(reply), {
        status,
      });
    }) as unknown as typeof fetch,
  });
}

describe("WEBHOOK_EVENTS", () => {
  it("lists the invoice and received invoice events", () => {
    expect(WEBHOOK_EVENTS).toEqual([
      "invoice.authorized",
      "invoice.rejected",
      "invoice.cancelled",
      "invoice.corrected",
      "received_invoice.stored",
      "received_invoice.full_document",
    ]);
  });
});

describe("Webhooks.create", () => {
  it("posts the url and secret, every event when none is named", async () => {
    const reply = { id: ENDPOINT_ID, url: "https://shop.example/hook" };
    const result = await hooks(201, reply).create({
      url: "https://shop.example/hook",
      secret: SECRET,
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/webhooks`);
    expect(calls[0].body).toEqual({
      url: "https://shop.example/hook",
      secret: SECRET,
    });
    expect(result).toEqual(reply);
  });

  it("sends the events named and the company", async () => {
    await hooks().create({
      url: "HTTPS://shop.example/hook",
      secret: SECRET,
      events: ["invoice.authorized", "invoice.rejected"],
      company: "acme",
    });

    expect((calls[0].body as Record<string, unknown>).events).toEqual([
      "invoice.authorized",
      "invoice.rejected",
    ]);
    expect(calls[0].headers[COMPANY_HEADER]).toBe("acme");
  });

  it("refuses a url that is not https", async () => {
    await expect(
      hooks().create({ url: "http://shop.example/hook", secret: SECRET })
    ).rejects.toThrow(/https/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a url over 500 characters", async () => {
    const url = `https://shop.example/${"a".repeat(500)}`;
    await expect(hooks().create({ url, secret: SECRET })).rejects.toThrow(
      /500/
    );
  });

  it("refuses a secret outside 16 to 255 characters", async () => {
    for (const secret of ["short", "x".repeat(256)]) {
      await expect(
        hooks().create({ url: "https://shop.example/hook", secret })
      ).rejects.toThrow(/secret/);
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses an unknown event, naming the known ones", async () => {
    await expect(
      hooks().create({
        url: "https://shop.example/hook",
        secret: SECRET,
        events: ["invoice.authorized", "invoice.paid"],
      })
    ).rejects.toThrow(
      /unknown events: invoice\.paid\. Known: invoice\.authorized/
    );
    expect(calls).toHaveLength(0);
  });

  it("refuses events that are not a list", async () => {
    await expect(
      hooks().create({
        url: "https://shop.example/hook",
        secret: SECRET,
        events: "invoice.authorized" as unknown as string[],
      })
    ).rejects.toThrow(ValidationError);
  });
});

describe("Webhooks.list", () => {
  it("returns the plain list", async () => {
    const rows = [{ id: ENDPOINT_ID, events: [] }];
    const result = await hooks(200, rows, "acme").list();

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/webhooks`);
    expect(calls[0].headers[COMPANY_HEADER]).toBe("acme");
    expect(result).toEqual(rows);
  });

  it("refuses an answer that is not a list", async () => {
    await expect(hooks(200, { items: [] }).list()).rejects.toThrow(
      /expected a list/
    );
  });
});

describe("Webhooks.delete", () => {
  it("deletes by id and returns nothing", async () => {
    const result = await hooks(204).delete(ENDPOINT_ID, { company: "acme" });

    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/webhooks/${ENDPOINT_ID}`);
    expect(calls[0].headers[COMPANY_HEADER]).toBe("acme");
    expect(result).toBeUndefined();
  });

  it("keeps the id one path segment and refuses dot segments", async () => {
    await hooks(204).delete("a/b");
    expect(calls[0].url).toBe(`${BASE}/webhooks/a%2Fb`);

    await expect(hooks(204).delete("..")).rejects.toThrow(ValidationError);
    expect(calls).toHaveLength(1);
  });

  it("surfaces a 404", async () => {
    await expect(
      hooks(404, { detail: "webhook not found" }).delete(ENDPOINT_ID)
    ).rejects.toBeInstanceOf(APIError);
  });
});

describe("Webhooks.deliveries", () => {
  it("reads a page", async () => {
    const reply = { items: [], total: 0 };
    const result = await hooks(200, reply).deliveries();

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/webhooks/deliveries`);
    expect(result).toEqual(reply);
  });

  it("sends the page in snake_case", async () => {
    await hooks().deliveries({
      limit: 10,
      offset: 5,
      sortBy: "created_at",
      orderBy: "desc",
    });

    expect(calls[0].url).toBe(
      `${BASE}/webhooks/deliveries?limit=10&offset=5&sort_by=created_at&order_by=desc`
    );
  });
});

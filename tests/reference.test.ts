import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  Dispatcher,
} from "undici";

import { APIError, FiscalReference, KINDS, Kind, Taxpayer } from "../src";

const BASE = "https://sdk.test";

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

function client(): FiscalReference {
  return new FiscalReference({ baseUrl: BASE, apiKey: "k" });
}

/** Captures the query string the SDK actually sent. */
function capture(path: string, status = 200, body: unknown = {}) {
  const seen: { query?: URLSearchParams } = {};

  agent
    .get(BASE)
    .intercept({
      path: (value) => value.split("?")[0] === path,
      method: "GET",
    })
    .reply(status, (req) => {
      seen.query = new URLSearchParams(String(req.path).split("?")[1] ?? "");
      return body;
    });

  return seen;
}

describe("accessors", () => {
  it("gives every documented kind one", () => {
    const ref = client();
    const accessors: Record<string, Kind> = {
      cfop: ref.cfop,
      ncm: ref.ncm,
      cest: ref.cest,
      cst: ref.cst,
      csosn: ref.csosn,
      iss_service: ref.issService,
      icms_fuel: ref.icmsFuel,
      ibs_cbs_class: ref.ibsCbsClass,
    };

    expect(Object.keys(accessors).sort()).toEqual([...KINDS].sort());
    for (const [name, kind] of Object.entries(accessors)) {
      expect(kind.name).toBe(name);
    }
  });

  it("still reaches a kind that has none", () => {
    expect(client().kind("published_tomorrow").name).toBe(
      "published_tomorrow"
    );
  });
});

describe("get", () => {
  it("asks for the one code", async () => {
    const seen = capture("/api/v1/fiscal-references/ncm/84716052", 200, {
      code: "84716052",
    });

    await client().ncm.get("84716052");

    expect(seen.query?.get("country")).toBe("BR");
  });

  it("raises APIError on a missing code, not a new error type", async () => {
    capture("/api/v1/fiscal-references/cfop/9999", 404, { detail: "no" });

    await expect(client().cfop.get("9999")).rejects.toBeInstanceOf(APIError);
  });
});

describe("search", () => {
  it("pins the kind it was reached through", async () => {
    const seen = capture("/api/v1/fiscal-references", 200, { data: [] });

    await client().ncm.search({ term: "teclado" });

    expect(seen.query?.get("kind")).toBe("ncm");
    expect(seen.query?.get("search")).toBe("teclado");
  });

  it("treats an empty term as no term — the route 422s on it", async () => {
    const seen = capture("/api/v1/fiscal-references", 200, { data: [] });

    await client().cfop.search({ term: "" });

    expect(seen.query?.has("search")).toBe(false);
  });

  it("pins no kind when searching the client itself", async () => {
    const seen = capture("/api/v1/fiscal-references", 200, { data: [] });

    await client().search({ term: "teclado" });

    expect(seen.query?.has("kind")).toBe(false);
  });

  it("sends no ordering the route would discard", async () => {
    const seen = capture("/api/v1/fiscal-references", 200, { data: [] });

    await client().ncm.search({ limit: 10, offset: 20 });

    expect(seen.query?.get("limit")).toBe("10");
    expect(seen.query?.get("offset")).toBe("20");
    expect(seen.query?.has("sort_by")).toBe(false);
    expect(seen.query?.has("order_by")).toBe(false);
  });
});

describe("country", () => {
  it("defaults to BR and reaches every accessor", () => {
    expect(client().country).toBe("BR");
    expect(
      new FiscalReference({ baseUrl: BASE, apiKey: "k", country: "AR" }).ncm
        .country
    ).toBe("AR");
  });

  it("can be overridden for one call", async () => {
    const seen = capture("/api/v1/fiscal-references/ncm/1");

    await client().ncm.get("1", "PY");

    expect(seen.query?.get("country")).toBe("PY");
  });
});

describe("kinds", () => {
  it("asks the API rather than answering from KINDS", async () => {
    capture("/api/v1/fiscal-references/kinds", 200, ["ncm", "brand_new"]);

    await expect(client().kinds()).resolves.toContain("brand_new");
  });
});

describe("Taxpayer", () => {
  function taxpayer(): Taxpayer {
    return new Taxpayer({ baseUrl: BASE, apiKey: "k" });
  }

  it("looks up the exact tax id", async () => {
    const seen = capture("/api/v1/taxpayers/00000000000191", 200, {
      name: "ACME",
    });

    await taxpayer().get("00000000000191");

    expect(seen.query?.get("country")).toBe("BR");
  });

  it("raises APIError on an unknown tax id", async () => {
    capture("/api/v1/taxpayers/00000000000000", 404, { detail: "no" });

    await expect(taxpayer().get("00000000000000")).rejects.toBeInstanceOf(
      APIError
    );
  });

  /**
   * A search here would be a bulk export of real people. The API
   * refuses it at the route, but that is the smaller reason: this type
   * is thin on purpose, and this test is what keeps a well-meaning
   * "parity with FiscalReference" out.
   */
  it("declares exactly one method of its own", () => {
    const own = Object.getOwnPropertyNames(Taxpayer.prototype).filter(
      (name) => name !== "constructor"
    );

    expect(own).toEqual(["get"]);
  });
});

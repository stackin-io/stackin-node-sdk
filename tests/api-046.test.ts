import { beforeEach, describe, expect, it } from "vitest";

import {
  APIError,
  ClientNotFoundError,
  DocumentType,
  Invoice,
  PaymentRequiredError,
  RateLimitedError,
  ReceivedXmlNotAvailableError,
  ValidationError,
  WEBHOOK_EVENTS,
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

function fakeFetch(
  status: number,
  reply: BodyInit | null,
  headers: Record<string, string> = {}
): typeof fetch {
  return (async (input: string, init: RequestInit) => {
    calls.push({
      method: String(init.method),
      url: String(input),
      headers: init.headers as Record<string, string>,
      body:
        init.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return new Response(reply, { status, headers });
  }) as unknown as typeof fetch;
}

function invoice(
  status = 200,
  reply: unknown = {},
  headers: Record<string, string> = {}
) {
  const payload =
    typeof reply === "string" || reply instanceof Uint8Array
      ? (reply as BodyInit)
      : JSON.stringify(reply);
  return new Invoice({
    apiKey: "k",
    baseUrl: "https://sdk.test",
    fetch: fakeFetch(status, payload, headers),
  });
}

async function failure(
  status: number,
  reply: unknown,
  headers: Record<string, string> = {}
): Promise<APIError> {
  try {
    await invoice(status, reply, headers).consult("k", {
      documentType: DocumentType.NFE,
    });
  } catch (error) {
    return error as APIError;
  }
  throw new Error("expected a failure");
}

const request = () => ({
  documentType: DocumentType.NFSE,
  clientName: "Buyer Ltda",
  taxId: "11111111111111",
  items: [new br.Product({ description: "Consultoria", amount: 100 })],
});

describe("error fields", () => {
  it("reads a structured pre-SEFAZ 422", async () => {
    const error = await failure(422, {
      detail: {
        code: "NCM_NOT_FULL_CODE",
        field: "items[0].product.br.ncm",
        message: "ncm must have 8 digits",
        sefaz_rejection: "778",
        expected: "8 digits",
        received: "8471",
      },
    });

    expect(error.code).toBe("NCM_NOT_FULL_CODE");
    expect(error.field).toBe("items[0].product.br.ncm");
    expect(error.sefazRejection).toBe("778");
    expect(error.expected).toBe("8 digits");
    expect(error.received).toBe("8471");
    expect(error.message).toBe("[422] ncm must have 8 digits");
    expect(error.detail).toBe("ncm must have 8 digits");
    expect(error.statusCode).toBe(422);
  });

  it("reads the authority block of a 422", async () => {
    const error = await failure(422, {
      detail: "Rejected by the authority",
      code: "AUTHORITY_REJECTED",
      error: {
        code: "539",
        source: "sefaz",
        message: "Duplicidade",
        retryable: false,
        invoice_id: "i-1",
      },
    });

    expect(error.code).toBe("539");
    expect(error.retryable).toBe(false);
    expect(error.documentId).toBeUndefined();
    expect(error.detail).toBe("Rejected by the authority");
  });

  it("reads an unknown outcome of a 502", async () => {
    const error = await failure(502, {
      detail: "The authority did not answer",
      error: {
        code: "OUTCOME_UNKNOWN",
        retryable: false,
        document_id: "DPS3550308",
        status_url: "/api/v1/invoices/dps/DPS3550308",
      },
    });

    expect(error.code).toBe("OUTCOME_UNKNOWN");
    expect(error.retryable).toBe(false);
    expect(error.documentId).toBe("DPS3550308");
  });

  it("keeps a retryable true", async () => {
    const error = await failure(503, {
      detail: "Unavailable",
      error: { code: "CONNECTION_FAILED", retryable: true },
    });

    expect(error.code).toBe("CONNECTION_FAILED");
    expect(error.retryable).toBe(true);
  });

  it("falls back to the top-level code without an error block", async () => {
    const error = await failure(422, {
      detail: "Rejected",
      code: "AUTHORITY_REJECTED",
    });

    expect(error.code).toBe("AUTHORITY_REJECTED");
    expect(error.retryable).toBeUndefined();
  });

  it("reads the code of another object detail", async () => {
    const error = await failure(409, {
      detail: { code: "SOMETHING_ELSE", message: "Nope" },
    });

    expect(error).toBeInstanceOf(APIError);
    expect(error.code).toBe("SOMETHING_ELSE");
    expect(error.message).toBe("[409] Nope");
  });

  it("leaves code empty on a pydantic 422", async () => {
    const error = await failure(422, {
      detail: [{ loc: ["body", "items"], msg: "field required" }],
    });

    expect(error.code).toBeUndefined();
    expect(error.field).toBeUndefined();
    expect(error.statusCode).toBe(422);
  });

  it("keeps a plain string detail working", async () => {
    const error = await failure(404, { detail: "Not found" });

    expect(error.message).toBe("[404] Not found");
    expect(error.code).toBeUndefined();
  });

  it("reaches the typed subclasses", async () => {
    const payment = await failure(402, {
      detail: { code: "RECEIVED_PAYMENT_REQUIRED", message: "Add credit" },
    });
    expect(payment).toBeInstanceOf(PaymentRequiredError);
    expect(payment.code).toBe("RECEIVED_PAYMENT_REQUIRED");

    const limited = await failure(
      429,
      { code: "DISTRIBUTION_COOLDOWN", retry_at: "2026-11-23T10:00:00Z" },
      { "Retry-After": "120" }
    );
    expect(limited).toBeInstanceOf(RateLimitedError);
    expect(limited.code).toBe("DISTRIBUTION_COOLDOWN");
    expect((limited as RateLimitedError).retryAfter).toBe(120);

    const client = await failure(404, {
      detail: {
        code: "CLIENT_NOT_FOUND",
        message: "No such client",
        client_id: "c-1",
      },
    });
    expect(client).toBeInstanceOf(ClientNotFoundError);
    expect(client.code).toBe("CLIENT_NOT_FOUND");
  });
});

describe("receivedXml", () => {
  const KEY = "35260100000000000000550010000000011000000011";

  it("returns the raw bytes without decoding them", async () => {
    const xml = new Uint8Array([0x3c, 0x3f, 0xff, 0xfe, 0x00, 0x80, 0x3e]);
    const result = await invoice(200, xml, {
      "Content-Type": "application/xml",
    }).receivedXml(KEY);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual(Array.from(xml));
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(
      `https://sdk.test/api/v1/received-invoices/${KEY}/xml`
    );
  });

  it("escapes the access key as one path segment", async () => {
    await invoice(200, "<x/>").receivedXml("a/b c");

    expect(calls[0].url).toBe(
      "https://sdk.test/api/v1/received-invoices/a%2Fb%20c/xml"
    );
  });

  it("refuses dot segments before the call", async () => {
    await expect(invoice().receivedXml("..")).rejects.toThrow(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it("raises ReceivedXmlNotAvailableError on a 409 with its code", async () => {
    const error = await invoice(409, {
      detail: {
        code: "RECEIVED_XML_NOT_AVAILABLE",
        message: "Only the summary is held",
        manifestation: {
          method: "POST",
          path: `/api/v1/received-invoices/${KEY}/manifestation`,
        },
      },
    })
      .receivedXml(KEY)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ReceivedXmlNotAvailableError);
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).code).toBe("RECEIVED_XML_NOT_AVAILABLE");
    expect((error as APIError).statusCode).toBe(409);
  });

  it("raises PaymentRequiredError on a 402 with its code", async () => {
    const error = await invoice(402, {
      detail: { code: "RECEIVED_PAYMENT_REQUIRED", message: "Add credit" },
    })
      .receivedXml(KEY)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentRequiredError);
    expect((error as APIError).code).toBe("RECEIVED_PAYMENT_REQUIRED");
  });

  it("raises APIError on a 404", async () => {
    await expect(
      invoice(404, { detail: "Not found" }).receivedXml(KEY)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("consultByDps", () => {
  it("reads the note by DPS id and unwraps the result", async () => {
    const result = await invoice(200, {
      result: { status: "cancelled", access_key: "k" },
    }).consultByDps("DPS355030821234567800019900001000000000000001");

    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(
      "https://sdk.test/api/v1/invoices/dps/DPS355030821234567800019900001000000000000001"
    );
    expect(result.status).toBe("cancelled");
  });

  it("escapes the id as one path segment", async () => {
    await invoice().consultByDps("a/b");

    expect(calls[0].url).toBe("https://sdk.test/api/v1/invoices/dps/a%2Fb");
  });

  it("refuses dot segments", async () => {
    await expect(invoice().consultByDps("..")).rejects.toThrow(
      ValidationError
    );
    expect(calls).toHaveLength(0);
  });

  it("raises on a 400 and a 404", async () => {
    await expect(
      invoice(400, { detail: "not this company" }).consultByDps("x")
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      invoice(404, { detail: "no note" }).consultByDps("x")
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("validate", () => {
  it("posts the issue body without an idempotency key", async () => {
    const result = await invoice(200, {
      valid: true,
      warnings: [{ code: "DEFAULT_SERIES", message: "series 1" }],
    }).validate({ ...request(), idempotencyKey: "abc" });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://sdk.test/api/v1/invoices/validate");
    expect(calls[0].headers["Idempotency-Key"]).toBeUndefined();
    const body = calls[0].body as Record<string, unknown>;
    expect(body.document_type).toBe("nfse");
    expect(body.idempotency_key).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      { code: "DEFAULT_SERIES", message: "series 1" },
    ]);
  });

  it("sends exactly what issue sends", async () => {
    await invoice().issue(request());
    await invoice().validate(request());

    expect(calls[1].body).toEqual(calls[0].body);
  });

  it("answers a 422 with valid false as a result", async () => {
    const finding = {
      code: "NCM_NOT_FULL_CODE",
      field: "items[0].product.br.ncm",
      message: "ncm must have 8 digits",
      sefaz_rejection: "778",
    };
    const blocker = {
      code: "CERTIFICATE_MISSING",
      field: null,
      message: "no certificate",
      fix_url: "/company",
    };
    const result = await invoice(422, {
      valid: false,
      detail: finding,
      errors: [finding, blocker],
      warnings: [],
    }).validate(request());

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([finding, blocker]);
    expect(result.errors[1].field).toBeNull();
  });

  it("raises on a pydantic 422", async () => {
    await expect(
      invoice(422, { detail: [{ loc: ["body"], msg: "required" }] }).validate(
        request()
      )
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("raises on a structured 422 that is not a validation result", async () => {
    const error = await invoice(422, {
      detail: { code: "CLIENT_INACTIVE", message: "inactive", client_id: "c" },
    })
      .validate(request())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).code).toBe("CLIENT_INACTIVE");
  });

  it("raises on 401, 404 and 429", async () => {
    for (const status of [401, 404, 429]) {
      await expect(
        invoice(status, { detail: "x" }).validate(request())
      ).rejects.toMatchObject({ statusCode: status });
    }
  });

  it("refuses an invalid request locally like issue", async () => {
    await expect(
      invoice().validate({ ...request(), items: [] })
    ).rejects.toThrow(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it("keeps the NF-e address rule", async () => {
    await expect(
      invoice().validate({
        documentType: DocumentType.NFE,
        clientName: "B",
        taxId: "11111111111111",
        items: [
          new br.Product({
            description: "x",
            amount: 1,
            ncm: "84716052",
            cfop: "5102",
          }),
        ],
      })
    ).rejects.toThrow(ValidationError);
    expect(calls).toHaveLength(0);
  });
});

describe("webhook events", () => {
  it("lists the received invoice events", () => {
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

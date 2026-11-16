import { ABROAD_STATE, Address } from "./address";
import { decimalString, Product } from "./br/product";
import {
  APIError,
  ConnectionFailedError,
  InvoiceError,
  ValidationError,
} from "./errors";
import {
  Direction,
  DocumentType,
  Environment,
  Manifestation,
  Purpose,
} from "./types";

export const DEFAULT_BASE_URL = "https://sdk.stackin.io";

const ENVIRONMENT_URLS: Record<Environment, string> = {
  [Environment.LOCAL]: "http://localhost:8000",
  [Environment.TEST]: DEFAULT_BASE_URL,
  [Environment.PRODUCTION]: DEFAULT_BASE_URL,
};

/**
 * Every address field the API needs. cityCode is not among them: on
 * either document type the API resolves it from city + state, and
 * answers CITY_NOT_FOUND (422) when it can't.
 */
const REQUIRED_ADDRESS_FIELDS: Array<keyof Address> = [
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
  "zipCode",
];

/**
 * A buyer abroad (state EX) has no CEP, and names its country instead:
 * the API requires countryCode there and writes 9999999 / EXTERIOR for
 * the municipality.
 */
const REQUIRED_ABROAD_ADDRESS_FIELDS: Array<keyof Address> = [
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
  "countryCode",
];

export interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
  environment?: Environment;
  timeoutMs?: number;
  fetch?: typeof fetch;

  /**
   * ISO 3166-1 alpha-2 code FiscalReference and Taxpayer look codes up
   * under. Defaults to BR. Invoice ignores it: a fiscal document
   * carries its issuer's country already.
   */
  country?: string;
}

export type InvoiceOptions = ClientOptions;

/** Where the goods leave Brazil: the NF-e exporta group. */
export interface ExportInfo {
  /** The Brazilian state the goods leave from (UFSaidaPais); never EX. */
  exitState: string;
  /** Place of shipment or border crossing (xLocExporta), up to 60 characters. */
  place: string;
  /** Customs facility of dispatch (xLocDespacho), up to 60 characters. */
  dispatchPlace?: string;
}

export interface IssueRequest {
  documentType: DocumentType;
  clientName: string;
  /**
   * CPF or CNPJ. Required, except on an NF-e to a buyer abroad
   * (recipientAddress.state EX), who is identified by foreignId instead.
   */
  taxId?: string;
  items: Product[];
  recipientAddress?: Address;
  series?: string;
  number?: string;
  /**
   * Makes a retry safe: repeating the same key with the same body
   * replays the first response instead of issuing a second document.
   * Keys live 24 hours. Never generated for you — only the caller
   * knows which two requests are meant to be the same one.
   */
  idempotencyKey?: string;
  /**
   * The caller's own id for the document, an order number say. Stored
   * as sent (up to 255 characters), returned on every read and
   * webhook, and filterable on the list. Left out of the body when
   * unset.
   */
  externalReference?: string;
  /**
   * A discount on the whole document, in BRL, at least 0. The API
   * spreads it over the lines in proportion to each line's amount.
   */
  discount?: number;
  /**
   * The emission moment. A Date is sent as its UTC instant; a string
   * must be ISO 8601 with a timezone offset (Z or ±hh:mm), and one
   * without is refused locally. NF-e: at most 30 days back and 5
   * minutes ahead; NFS-e: never ahead. The API defaults it to now.
   */
  issuedAt?: Date | string;
  /** Why the NF-e is issued (finNFe). NF-e only. */
  purpose?: Purpose;
  /** Outgoing or incoming NF-e (tpNF). NF-e only. */
  direction?: Direction;
  /**
   * Access keys (44 characters) of the NF-e, NFC-e or CF-e this one
   * refers to: required for Purpose.COMPLEMENTARY (exactly one) and,
   * but for a few CFOPs, for Purpose.RETURN. NF-e only.
   */
  referencedKeys?: string[];
  /**
   * Passport or other document of a buyer abroad (idEstrangeiro): 5 to
   * 20 letters, digits or :.+-/(). NF-e to state EX only.
   */
  foreignId?: string;
  /** Where the goods leave Brazil. Required on an outgoing NF-e abroad. */
  export?: ExportInfo;
}

/** An ISO 8601 date-time that carries its timezone: Z or ±hh:mm. */
const AWARE_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;

function issuedAtValue(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ValidationError("issuedAt is not a valid date");
    }
    return value.toISOString();
  }
  if (typeof value !== "string" || !AWARE_DATETIME.test(value)) {
    throw new ValidationError(
      "issuedAt must be ISO 8601 with a timezone offset, e.g. 2026-11-15T10:30:00-03:00; a value without one is refused"
    );
  }
  return value;
}

function requireOneOf<T extends string>(
  field: string,
  value: T,
  allowed: Record<string, T>
): void {
  const values = Object.values(allowed);
  if (!values.includes(value)) {
    throw new ValidationError(
      `${field} must be one of ${values.join(", ")}, got ${String(value)}`
    );
  }
}

function exportValue(info: ExportInfo): Record<string, string> {
  if (!info || !info.exitState || !info.place) {
    throw new ValidationError("export needs exitState and place");
  }
  const out: Record<string, string> = {
    exit_state: info.exitState,
    place: info.place,
  };
  if (info.dispatchPlace) out.dispatch_place = info.dispatchPlace;
  return out;
}

function isAbroad(address: Address | undefined): boolean {
  return address?.state?.toUpperCase() === ABROAD_STATE;
}

function resolveBaseUrl(
  baseUrl: string | undefined,
  environment: Environment | undefined
): string {
  if (baseUrl) return baseUrl;
  const envUrl = process.env.STACKIN_BASE_URL;
  if (envUrl) return envUrl;
  if (environment !== undefined) return ENVIRONMENT_URLS[environment];
  const envName = process.env.STACKIN_ENVIRONMENT as Environment | undefined;
  if (envName && ENVIRONMENT_URLS[envName]) return ENVIRONMENT_URLS[envName];
  return DEFAULT_BASE_URL;
}

const NFE_DESCRIPTION_MAX = 120;

function validateNfeDescriptions(items: Product[]): void {
  items.forEach((item, index) => {
    if ([...item.description].length > NFE_DESCRIPTION_MAX) {
      throw new ValidationError(
        `items[${index}].description exceeds ${NFE_DESCRIPTION_MAX} characters (NF-e xProd limit)`
      );
    }
  });
}

/**
 * Typographic characters the API converts before its own latin1 check
 * (quotes, dashes, ellipsis, bullet, euro, trademark), so they are not
 * refused here. The SDK sends them as given; the API translates them.
 */
const API_CONVERTED = new Set([
  "\u2018",
  "\u2019",
  "\u201A",
  "\u201C",
  "\u201D",
  "\u201E",
  "\u2013",
  "\u2014",
  "\u2212",
  "\u2026",
  "\u2022",
  "\u20AC",
  "\u2122",
]);

/**
 * NF-e 4.00 is ISO-8859-1. Matches what the API accepts, no stricter:
 * anything up to U+00FF passes (tab, newline and CR included, which
 * the API folds into a space), as do the characters in API_CONVERTED;
 * any other code point above U+00FF is refused. Walks what is actually
 * sent, so the path names the payload key — items[0].description,
 * client_name, recipient_address.street — and the first offender is
 * reported.
 */
function validateLatin1(value: unknown, path: string): void {
  if (typeof value === "string") {
    for (const char of value) {
      const code = char.codePointAt(0) as number;
      if (code > 0xff && !API_CONVERTED.has(char)) {
        throw new ValidationError(
          `${path} contains a character outside ISO-8859-1 (latin1), which NF-e does not accept: '${char}'`
        );
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validateLatin1(entry, `${path}[${index}]`)
    );
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      validateLatin1(entry, path ? `${path}.${key}` : key);
    }
  }
}

/**
 * An NF-e access key: 44 characters, digits except the issuer CNPJ's
 * first 12 positions, which may be uppercase letters once the CNPJ is
 * alphanumeric (from July 2026). Same pattern the API checks.
 */
const NFE_ACCESS_KEY = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;

function missingAddressFields(
  address: Address,
  fields: Array<keyof Address>
): Array<keyof Address> {
  return fields.filter(
    (field) => !(address as unknown as Record<string, unknown>)[field]
  );
}

/**
 * ISSQN retained by the tomador: the city authorizer refuses the
 * NFS-e without the tomador's address (E0237), and the API needs every
 * field of it except cityCode.
 */
function validateNfseRetainedAddress(request: IssueRequest): void {
  if (!request.items.some((item) => item.taxRetained)) return;
  const address = request.recipientAddress;
  if (!address) {
    throw new ValidationError(
      "recipient_address is required on an NFS-e when any item has tax_retained=true (ISSQN retained by the tomador)"
    );
  }
  const missing = missingAddressFields(address, REQUIRED_ADDRESS_FIELDS);
  if (missing.length > 0) {
    throw new ValidationError(
      `recipientAddress is missing required fields for NFSE with tax_retained=true: ${missing.join(", ")}`
    );
  }
}

function validateNfeAddress(address: Address | undefined): void {
  if (!address) {
    throw new ValidationError("recipientAddress is required for NFE");
  }
  const missing = missingAddressFields(
    address,
    isAbroad(address)
      ? REQUIRED_ABROAD_ADDRESS_FIELDS
      : REQUIRED_ADDRESS_FIELDS
  );
  if (missing.length > 0) {
    throw new ValidationError(
      `recipientAddress is missing required fields for NFE: ${missing.join(", ")}`
    );
  }
}

/**
 * Where an api key becomes an HTTP call, for every entry point.
 *
 * Not re-exported from the package index: a caller instantiates
 * Invoice, FiscalReference or Taxpayer, never this.
 */
export class Client {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly timeoutMs: number;
  readonly country: string;
  protected readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = resolveBaseUrl(
      options.baseUrl,
      options.environment
    ).replace(/\/+$/, "");
    this.apiKey = options.apiKey ?? process.env.STACKIN_API_KEY;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.country = options.country ?? "BR";
    this.fetchImpl = options.fetch ?? fetch;
  }

  protected headers(idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    return headers;
  }

  protected async request(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      query?: Record<string, string>;
      idempotencyKey?: string;
    } = {}
  ): Promise<Record<string, unknown>> {
    const response = await this.send(method, path, opts);

    let body: Record<string, unknown> = {};
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }

    return (body.result as Record<string, unknown>) ?? body;
  }

  protected async send(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      query?: Record<string, string>;
      idempotencyKey?: string;
    } = {}
  ): Promise<Response> {
    let url = `${this.baseUrl}/api/v1${path}`;
    if (opts.query) {
      const params = new URLSearchParams(opts.query);
      url += `?${params.toString()}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: this.headers(opts.idempotencyKey),
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw new ConnectionFailedError(
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text();
      let body: Record<string, unknown> = {};
      if (text) {
        try {
          body = JSON.parse(text) as Record<string, unknown>;
        } catch {
          body = {};
        }
      }
      const detail =
        typeof body.detail === "string" ? (body.detail as string) : text;
      throw new APIError(response.status, detail);
    }

    return response;
  }
}

export class Invoice extends Client {
  async issue(request: IssueRequest): Promise<Record<string, unknown>> {
    if (!request.items || request.items.length === 0) {
      throw new ValidationError("items can't be empty");
    }

    if (request.documentType === DocumentType.NFE) {
      request.items.forEach((item, index) => {
        if (!item.ncm) {
          throw new ValidationError(`items[${index}].ncm is required for NFE`);
        }
        if (!item.cfop) {
          throw new ValidationError(
            `items[${index}].cfop is required for NFE`
          );
        }
      });
      validateNfeAddress(request.recipientAddress);
      validateNfeDescriptions(request.items);
    }

    if (request.documentType === DocumentType.NFSE) {
      validateNfseRetainedAddress(request);
    }

    const abroad =
      request.documentType === DocumentType.NFE &&
      isAbroad(request.recipientAddress);
    if (!abroad && (request.taxId === undefined || request.taxId === null)) {
      throw new ValidationError(
        "taxId is required, except on an NF-e to a buyer abroad (recipientAddress.state EX)"
      );
    }

    const payload: Record<string, unknown> = {
      document_type: request.documentType,
      client_name: request.clientName,
      tax_id: request.taxId,
      items: request.items.map((item) => item.toJSON()),
    };
    if (request.recipientAddress) {
      payload.recipient_address = request.recipientAddress.toJSON();
    }
    if (request.series) payload.series = request.series;
    if (request.number) payload.number = request.number;
    if (request.discount !== undefined) {
      if (!Number.isFinite(request.discount) || request.discount < 0) {
        throw new ValidationError("discount must be a number of at least 0");
      }
      payload.discount = decimalString(request.discount);
    }
    if (request.issuedAt !== undefined) {
      payload.issued_at = issuedAtValue(request.issuedAt);
    }
    if (request.purpose !== undefined) {
      requireOneOf("purpose", request.purpose, Purpose);
      payload.purpose = request.purpose;
    }
    if (request.direction !== undefined) {
      requireOneOf("direction", request.direction, Direction);
      payload.direction = request.direction;
    }
    if (request.referencedKeys !== undefined) {
      if (
        !Array.isArray(request.referencedKeys) ||
        request.referencedKeys.some((key) => typeof key !== "string")
      ) {
        throw new ValidationError(
          "referencedKeys must be an array of access keys"
        );
      }
      payload.referenced_keys = [...request.referencedKeys];
    }
    if (request.foreignId) payload.foreign_id = request.foreignId;
    if (request.export !== undefined) {
      payload.export = exportValue(request.export);
    }

    if (request.documentType === DocumentType.NFE) {
      validateLatin1(payload, "");
    }

    if (request.externalReference) {
      payload.external_reference = request.externalReference;
    }

    return this.request("POST", "/invoices", {
      body: payload,
      idempotencyKey: request.idempotencyKey,
    });
  }

  async consult(
    accessKey: string,
    options: { documentType: DocumentType }
  ): Promise<Record<string, unknown>> {
    return this.request("GET", `/invoices/${accessKey}`, {
      query: { document_type: options.documentType },
    });
  }

  /**
   * Voids an authorized document.
   *
   * Pass idempotencyKey to make a retry safe: repeating the same key
   * with the same body replays the first answer instead of cancelling
   * twice. This is the one irreversible operation here, with a legal
   * window and no undo, so a dropped connection is the case it exists
   * for. Never generated for you — only the caller knows which two
   * requests are meant to be the same one.
   */
  async cancel(
    accessKey: string,
    options: {
      documentType: DocumentType;
      reason: string;
      idempotencyKey?: string;
    }
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/invoices/${accessKey}/cancel`, {
      body: {
        document_type: options.documentType,
        reason: options.reason,
      },
      idempotencyKey: options.idempotencyKey,
    });
  }

  async invalidate(options: {
    series: string;
    numberStart: number;
    numberEnd: number;
    reason: string;
  }): Promise<Record<string, unknown>> {
    const length = options.reason?.length ?? 0;
    if (length < 15 || length > 255) {
      throw new ValidationError("reason must be 15 to 255 characters");
    }
    if (options.numberEnd < options.numberStart) {
      throw new ValidationError("numberEnd can't be below numberStart");
    }

    return this.request("POST", "/invoices/invalidations", {
      body: {
        series: options.series,
        number_start: options.numberStart,
        number_end: options.numberEnd,
        reason: options.reason,
      },
    });
  }

  /**
   * Files a correction letter (CC-e) against an authorized NF-e.
   *
   * NF-e only. A key that is not an NF-e access key (44 characters;
   * an NFS-e key has 50 digits) is refused locally with a
   * ValidationError, before the call. An NF-e key sent with
   * documentType NFSE, or one for a document the API does not hold,
   * still comes back from the API as a 409 APIError.
   */
  async correct(
    accessKey: string,
    options: { documentType: DocumentType; correction: string }
  ): Promise<Record<string, unknown>> {
    if (!NFE_ACCESS_KEY.test(accessKey ?? "")) {
      throw new ValidationError(
        "correct is NFe only. NFSe has no correction letter — cancel and reissue instead."
      );
    }
    const length = options.correction?.length ?? 0;
    if (length < 15 || length > 1000) {
      throw new ValidationError("correction must be 15 to 1000 characters");
    }

    return this.request("POST", `/invoices/${accessKey}/correction`, {
      body: {
        document_type: options.documentType,
        correction: options.correction,
      },
    });
  }

  async reissue(
    invoiceId: string,
    options: { idempotencyKey?: string } = {}
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/invoices/${invoiceId}/reissue`, {
      idempotencyKey: options.idempotencyKey,
    });
  }

  /**
   * Documents other companies issued against this one.
   *
   * Reads what the API already collected; it does not call the
   * authorizer. Collecting runs on a schedule there, because the SEFAZ
   * caps how many times a CNPJ may ask per day.
   */
  async received(
    options: { limit?: number; offset?: number } = {}
  ): Promise<Record<string, unknown>> {
    const query: Record<string, string> = {};
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.offset !== undefined) query.offset = String(options.offset);

    return this.request("GET", "/received-invoices", { query });
  }

  /**
   * What this company issued, newest first.
   *
   * The counterpart of received(): that one lists what was issued
   * against the company, this one what the company issued.
   */
  async history(
    options: {
      documentType?: DocumentType;
      status?: string;
      limit?: number;
      offset?: number;
      sortBy?: string;
      orderBy?: string;
    } = {}
  ): Promise<Record<string, unknown>> {
    const query: Record<string, string> = {};
    if (options.documentType !== undefined)
      query.document_type = options.documentType;
    if (options.status !== undefined) query.status = options.status;
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.offset !== undefined) query.offset = String(options.offset);
    if (options.sortBy !== undefined) query.sort_by = options.sortBy;
    if (options.orderBy !== undefined) query.order_by = options.orderBy;

    return this.request("GET", "/invoices", { query });
  }

  /**
   * The recipient's formal answer to a received document.
   *
   * Only OPERACAO_NAO_REALIZADA takes a reason, and it requires one.
   * Both are fixed rules, checked here rather than spending a round
   * trip to be told.
   */
  async manifest(
    accessKey: string,
    options: { manifestation: Manifestation; reason?: string }
  ): Promise<Record<string, unknown>> {
    const needsReason =
      options.manifestation === Manifestation.OPERACAO_NAO_REALIZADA;
    if (needsReason && !options.reason) {
      throw new ValidationError(
        "manifestation 210240 (operação não realizada) requires a reason"
      );
    }
    if (!needsReason && options.reason) {
      throw new ValidationError(
        `manifestation ${options.manifestation} does not take a reason`
      );
    }

    const body: Record<string, unknown> = {
      manifestation: options.manifestation,
    };
    if (options.reason) body.reason = options.reason;

    return this.request(
      "POST",
      `/received-invoices/${accessKey}/manifestation`,
      { body }
    );
  }

  /**
   * The authorizer's own rendering of an authorized document, as raw
   * bytes — the only method that does not return a parsed object.
   *
   * The XML is the legally valid document; this is a convenience, and
   * the authorizer's endpoint for it is unstable, so an APIError with
   * status 502 means the authorizer is unavailable, not that the
   * invoice is wrong. NFS-e only.
   */
  async pdf(
    accessKey: string,
    options: { documentType: DocumentType }
  ): Promise<Uint8Array> {
    const response = await this.send("GET", `/invoices/${accessKey}/pdf`, {
      query: { document_type: options.documentType },
    });
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Every attempt made for one invoice, with what the authorizer answered.
   *
   * consult() gives the status; this gives the reason. Takes the invoiceId,
   * like reissue() and unlike everything else, because a rejected document
   * has no access key to look it up by.
   */
  async submissions(
    invoiceId: string
  ): Promise<Array<Record<string, unknown>>> {
    const response = await this.send(
      "GET",
      `/invoices/${invoiceId}/submissions`,
      {}
    );

    const text = await response.text();
    if (!text) return [];

    const body: unknown = JSON.parse(text);
    if (!Array.isArray(body)) {
      throw new InvoiceError("unexpected response shape: expected a list");
    }
    return body as Array<Record<string, unknown>>;
  }
}

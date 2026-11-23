import { ABROAD_STATE, Address } from "./address";
import { decimalString, Product } from "./br/product";
import {
  APIError,
  ClientAlreadyExistsError,
  ClientInactiveError,
  ClientNotFoundError,
  CompanyNotInScopeError,
  CompanyRequiredError,
  ConnectionFailedError,
  InsufficientPermissionError,
  InvoiceError,
  ItemAlreadyExistsError,
  ItemInactiveError,
  ItemKindMismatchError,
  ItemNotFoundError,
  ItemTaxRegimeMismatchError,
  ItemTaxRequiredError,
  PaymentRequiredError,
  RateLimitedError,
  ReceivedXmlNotAvailableError,
  ValidationError,
  withInfo,
  type ErrorInfo,
} from "./errors";
import { segment } from "./segment";
import {
  termsPayload,
  type Intermediary,
  type Payment,
  type Presence,
  type Transport,
} from "./terms";
import {
  AuthorizedCompanies,
  AuthorizedCompany,
  Direction,
  DocumentType,
  Environment,
  Manifestation,
  InvoiceValidation,
  Purpose,
  ReceivedSync,
  Usage,
  ValidationFinding,
  ValidationWarning,
} from "./types";

export const DEFAULT_BASE_URL = "https://sdk.stackin.io";

export const COMPANY_HEADER = "X-Stackin-Company";

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

  /**
   * The company every call acts on, by id (UUID) or CNPJ; the API
   * ignores punctuation. Sent as X-Stackin-Company. Only a credential
   * that covers several companies needs it: an API key is one company
   * already. Unset, no header is sent. A call's own company overrides
   * it.
   */
  company?: string;
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
  /** The recipient's name. Required unless clientId is given. */
  clientName?: string;
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
  /** The company this call acts on; overrides the client's company. */
  company?: string;
  /**
   * A saved client of the company (see Clients). Its name, taxId,
   * foreignId and address fill whichever of clientName, taxId,
   * foreignId and recipientAddress are left out; the ones given win.
   * Those four are then not required here: the API checks the merged
   * request. Its e-mail and phone likewise fill clientEmail and
   * clientPhone when left out.
   */
  clientId?: string;
  /**
   * After a successful issuance a new recipient is saved as a client.
   * true also rewrites an existing one with this request's recipient
   * data; left out, its use is only counted. Sent only when true.
   */
  updateClient?: boolean;
  /**
   * The recipient's e-mail, a valid address. Saved on the Stackin
   * client created after a successful issuance; on an existing client
   * only with updateClient: true. Also kept on the invoice and sent
   * again on a reissue (which does not touch the client), and written
   * into the fiscal document: NF-e dest/email (up to 60 characters),
   * NFS-e toma/email (up to 80). A value the layout cannot carry (too
   * long, characters beyond Latin-1) is left out of the document and
   * the issuance goes on. Left out of the body when unset.
   */
  clientEmail?: string;
  /**
   * The recipient's phone, 8 to 15 digits with an optional leading +;
   * the API drops spaces, dots, dashes and parentheses. Saved on the
   * client like clientEmail: a new one after issuance, an existing one
   * only with updateClient: true. Also kept on the invoice and written
   * into the fiscal document like clientEmail: NF-e dest/enderDest/fone
   * (digits only, up to 14, only with a recipientAddress), NFS-e
   * toma/fone (up to 20 digits). Digits only, area code first; a +55 is
   * dropped unless the recipient is abroad. A value the layout cannot
   * carry is left out of the document. Left out of the body when unset.
   */
  clientPhone?: string;
  /**
   * NF-e only: true sends the document through the UF's contingency
   * authorizer (SVC-AN or SVC-RS, tpEmis 6/7) for when its own is down.
   * Sent only when true.
   */
  contingency?: boolean;
  /** indPres, how the buyer took part. NF-e only; the API defaults to 9. */
  presence?: Presence;
  /** The marketplace the sale went through. NF-e only; presence 1, 2, 3 or 9. */
  intermediary?: Intermediary;
  /** The freight mode and volumes. NF-e only. */
  transport?: Transport;
  /** The payments, 1 to 100. NF-e only; left out, one payment of method 90. */
  payments?: Payment[];
  /** vTroco, at most 300000.00. NF-e only. */
  change?: number | string;
}

/** Per-call company selection, overriding the client's. */
export interface CompanyOption {
  /** The company id (UUID) or CNPJ, sent as X-Stackin-Company. */
  company?: string;
}

/** A page of a listing, as the API paginates it. Every field optional. */
export interface PageQuery extends CompanyOption {
  limit?: number;
  offset?: number;
  sortBy?: string;
  orderBy?: string;
}

/** One item's description to classify, and the context that changes its codes. */
export interface ClassifyRequest extends CompanyOption {
  /** 3 to 500 characters. */
  description: string;
  documentType: DocumentType;
  /** The recipient's two-letter UF; it decides the CFOP. */
  recipientState?: string;
  /**
   * Answers to the suggestion's missing_information, by key:
   * operation_scope, purpose, contains_alcohol, service_city_code,
   * tax_retained. Left out when empty.
   */
  answers?: Record<string, unknown>;
}

/** The API's pagination query, leaving out what was not passed. */
export function pageQuery(options: PageQuery): Record<string, string> {
  const query: Record<string, string> = {};
  if (options.limit !== undefined) query.limit = String(options.limit);
  if (options.offset !== undefined) query.offset = String(options.offset);
  if (options.sortBy !== undefined) query.sort_by = options.sortBy;
  if (options.orderBy !== undefined) query.order_by = options.orderBy;
  return query;
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
    if ([...(item.description ?? "")].length > NFE_DESCRIPTION_MAX) {
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
function saleTerms(request: IssueRequest): Record<string, unknown> {
  return termsPayload(request);
}

function validateNfseRetainedAddress(request: IssueRequest): void {
  if (!request.items.some((item) => item.taxRetained)) return;
  const address = request.recipientAddress;
  if (!address && request.clientId !== undefined) return;
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

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string>;
  idempotencyKey?: string;
  company?: string;
}

function companyListing(value: unknown): AuthorizedCompany[] {
  return Array.isArray(value) ? (value as AuthorizedCompany[]) : [];
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Retry-After in seconds: the header is either a count of seconds or
 * an HTTP date, which becomes the seconds left until it.
 */
function retryAfterSeconds(
  value: string | null | undefined,
  now: number = Date.now()
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function objectDetail(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function errorInfo(
  body: Record<string, unknown>,
  detail: Record<string, unknown> | undefined
): ErrorInfo {
  const block = objectDetail(body.error);
  return {
    code:
      optionalString(block?.code) ??
      optionalString(detail?.code) ??
      optionalString(body.code),
    field: optionalString(detail?.field),
    retryable: optionalBoolean(block?.retryable),
    documentId: optionalString(block?.document_id),
    sefazRejection: optionalString(detail?.sefaz_rejection),
    expected: optionalString(detail?.expected),
    received: optionalString(detail?.received),
  };
}

/**
 * The typed error for a failed response. A 402 and a 429 are typed
 * whatever their body; the company, permission and client refusals
 * carry an object detail; everything else is a plain APIError. Every
 * one carries what the body says in code, field, retryable, documentId
 * and sefazRejection.
 */
function errorFor(
  status: number,
  body: Record<string, unknown>,
  text: string,
  headers?: Headers
): APIError {
  const detail = objectDetail(body.detail);
  return withInfo(
    typedError(status, body, text, headers),
    errorInfo(body, detail)
  );
}

function typedError(
  status: number,
  body: Record<string, unknown>,
  text: string,
  headers?: Headers
): APIError {
  const raw = body.detail;
  const detail = objectDetail(raw);
  const message =
    typeof raw === "string" ? raw : stringOr(detail?.message, text);

  if (status === 402) return new PaymentRequiredError(status, message);
  if (status === 429) {
    return new RateLimitedError(status, message, {
      retryAfter: retryAfterSeconds(headers?.get("Retry-After")),
      retryAt:
        optionalString(body.retry_at) ?? optionalString(detail?.retry_at),
      code: optionalString(body.code) ?? optionalString(detail?.code),
    });
  }

  if (typeof raw === "string") return new APIError(status, raw);
  if (!detail) return new APIError(status, text);

  const description = stringOr(detail.error_description, text);
  if (status === 422 && detail.error === "company_required") {
    return new CompanyRequiredError(
      status,
      description,
      companyListing(detail.companies)
    );
  }
  if (status === 403 && detail.error === "company_not_in_scope") {
    return new CompanyNotInScopeError(
      status,
      description,
      companyListing(detail.companies)
    );
  }
  if (status === 403 && detail.code === "INSUFFICIENT_PERMISSION") {
    return new InsufficientPermissionError(status, description);
  }
  const clientId = stringOr(detail.client_id, "");
  if (status === 409 && detail.code === "CLIENT_EXISTS") {
    return new ClientAlreadyExistsError(status, message, clientId);
  }
  if (status === 422 && detail.code === "CLIENT_INACTIVE") {
    return new ClientInactiveError(status, message, clientId);
  }
  if (status === 404 && detail.code === "CLIENT_NOT_FOUND") {
    return new ClientNotFoundError(status, message, clientId);
  }
  const itemId = stringOr(detail.item_id, "");
  const index = typeof detail.index === "number" ? detail.index : undefined;
  if (status === 409 && detail.code === "ITEM_EXISTS") {
    return new ItemAlreadyExistsError(
      status,
      message,
      itemId,
      stringOr(detail.field, "")
    );
  }
  if (status === 404 && detail.code === "ITEM_NOT_FOUND") {
    return new ItemNotFoundError(status, message, itemId);
  }
  if (status === 422 && detail.code === "ITEM_INACTIVE") {
    return new ItemInactiveError(status, message, itemId);
  }
  if (status === 422 && detail.code === "ITEM_KIND_MISMATCH") {
    return new ItemKindMismatchError(status, message, itemId, index);
  }
  if (status === 422 && detail.code === "ITEM_TAX_REQUIRED") {
    return new ItemTaxRequiredError(status, message, itemId, index);
  }
  if (status === 422 && detail.code === "ITEM_TAX_REGIME_MISMATCH") {
    return new ItemTaxRegimeMismatchError(status, message, itemId, index);
  }
  if (status === 409 && detail.code === "RECEIVED_XML_NOT_AVAILABLE") {
    return new ReceivedXmlNotAvailableError(status, message);
  }
  return new APIError(
    status,
    typeof detail.message === "string" ? message : text
  );
}

/**
 * Where an api key becomes an HTTP call, for every entry point.
 *
 * Not re-exported from the package index: a caller instantiates
 * Invoice, Clients, Items, FiscalReference or Taxpayer, never this.
 */
export class Client {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly timeoutMs: number;
  readonly country: string;
  readonly company?: string;
  protected readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = resolveBaseUrl(
      options.baseUrl,
      options.environment
    ).replace(/\/+$/, "");
    this.apiKey = options.apiKey ?? process.env.STACKIN_API_KEY;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.country = options.country ?? "BR";
    this.company = options.company;
    this.fetchImpl = options.fetch ?? fetch;
  }

  protected headers(
    idempotencyKey?: string,
    company?: string
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    const selected = company || this.company;
    if (selected) {
      headers[COMPANY_HEADER] = selected;
    }
    return headers;
  }

  protected async request(
    method: string,
    path: string,
    opts: RequestOptions = {}
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

  /** A call whose answer is a bare JSON array; an empty body is []. */
  protected async requestList<T = Record<string, unknown>>(
    method: string,
    path: string,
    opts: RequestOptions = {}
  ): Promise<T[]> {
    const response = await this.send(method, path, opts);

    const text = await response.text();
    if (!text) return [];

    const body: unknown = JSON.parse(text);
    if (!Array.isArray(body)) {
      throw new InvoiceError("unexpected response shape: expected a list");
    }
    return body as T[];
  }

  protected async send(
    method: string,
    path: string,
    opts: RequestOptions = {}
  ): Promise<Response> {
    const response = await this.perform(method, path, opts);
    if (!response.ok) throw await this.failure(response);
    return response;
  }

  protected async perform(
    method: string,
    path: string,
    opts: RequestOptions = {}
  ): Promise<Response> {
    let url = `${this.baseUrl}/api/v1${path}`;
    if (opts.query && Object.keys(opts.query).length > 0) {
      const params = new URLSearchParams(opts.query);
      url += `?${params.toString()}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(url, {
        method,
        headers: this.headers(opts.idempotencyKey, opts.company),
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
  }

  protected async failure(response: Response): Promise<APIError> {
    const text = await response.text();
    return errorFor(
      response.status,
      parseObject(text),
      text,
      response.headers
    );
  }
}

function parseObject(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return objectDetail(parsed) ?? {};
  } catch {
    return {};
  }
}

export class Invoice extends Client {
  private issuePayload(request: IssueRequest): Record<string, unknown> {
    if (!request.items || request.items.length === 0) {
      throw new ValidationError("items can't be empty");
    }

    if (request.documentType === DocumentType.NFE) {
      request.items.forEach((item, index) => {
        // A line with an itemId takes its codes from the catalog; the API checks the merged line.
        if (item.itemId !== undefined) return;
        if (!item.ncm) {
          throw new ValidationError(`items[${index}].ncm is required for NFE`);
        }
        if (!item.cfop) {
          throw new ValidationError(
            `items[${index}].cfop is required for NFE`
          );
        }
      });
      if (request.recipientAddress || request.clientId === undefined) {
        validateNfeAddress(request.recipientAddress);
      }
      validateNfeDescriptions(request.items);
    }

    if (request.documentType === DocumentType.NFSE) {
      validateNfseRetainedAddress(request);
    }

    const fromClient = request.clientId !== undefined;
    if (
      !fromClient &&
      (request.clientName === undefined || request.clientName === null)
    ) {
      throw new ValidationError(
        "clientName is required unless clientId is given"
      );
    }
    const abroad =
      request.documentType === DocumentType.NFE &&
      isAbroad(request.recipientAddress);
    if (
      !abroad &&
      !fromClient &&
      (request.taxId === undefined || request.taxId === null)
    ) {
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
    if (fromClient) payload.client_id = request.clientId;
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

    Object.assign(payload, saleTerms(request));

    if (request.documentType === DocumentType.NFE) {
      validateLatin1(payload, "");
    }

    if (request.externalReference) {
      payload.external_reference = request.externalReference;
    }
    if (request.updateClient === true) payload.update_client = true;
    if (request.clientEmail) payload.client_email = request.clientEmail;
    if (request.clientPhone) payload.client_phone = request.clientPhone;
    if (request.contingency === true) payload.contingency = true;

    return payload;
  }

  async issue(request: IssueRequest): Promise<Record<string, unknown>> {
    const payload = this.issuePayload(request);
    return this.request("POST", "/invoices", {
      body: payload,
      idempotencyKey: request.idempotencyKey,
      company: request.company,
    });
  }

  /**
   * Runs every check issue() runs before sending, and stops there.
   *
   * Takes the same request as issue(). Nothing is transmitted, no número
   * is taken, nothing is stored or charged; idempotencyKey is ignored.
   * Answers { valid, errors, warnings } both when the issuance would pass
   * (valid true, errors empty) and when the rules refuse it (valid false,
   * every refusal in errors, each with code, field, message and, when
   * there is one, sefaz_rejection, expected, received and fix_url).
   * Anything else, a malformed body, a client or item the company does
   * not have, an expired key or a rate limit, raises as usual. The
   * authorizer can still reject what passes here on what only it knows.
   */
  async validate(request: IssueRequest): Promise<InvoiceValidation> {
    const payload = this.issuePayload(request);
    const response = await this.perform("POST", "/invoices/validate", {
      body: payload,
      company: request.company,
    });
    const text = await response.text();
    const body = parseObject(text);
    if (
      response.ok ||
      (response.status === 422 && typeof body.valid === "boolean")
    ) {
      return {
        ...body,
        valid: body.valid === true,
        errors: Array.isArray(body.errors)
          ? (body.errors as ValidationFinding[])
          : [],
        warnings: Array.isArray(body.warnings)
          ? (body.warnings as ValidationWarning[])
          : [],
      };
    }
    throw errorFor(response.status, body, text, response.headers);
  }

  async consult(
    accessKey: string,
    options: { documentType: DocumentType } & CompanyOption
  ): Promise<Record<string, unknown>> {
    return this.request("GET", `/invoices/${accessKey}`, {
      query: { document_type: options.documentType },
      company: options.company,
    });
  }

  /**
   * Looks an NFS-e up by the id of its DPS, the document_id an
   * OUTCOME_UNKNOWN error carries.
   *
   * Answers what consult() does, and the result may be status
   * "cancelled". 400 when the id is not this company's, 404 when the
   * authority holds no note for it: nothing was issued.
   */
  async consultByDps(
    dpsId: string,
    options: CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    return this.request("GET", `/invoices/dps/${segment(dpsId)}`, {
      company: options.company,
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
    } & CompanyOption
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/invoices/${accessKey}/cancel`, {
      body: {
        document_type: options.documentType,
        reason: options.reason,
      },
      idempotencyKey: options.idempotencyKey,
      company: options.company,
    });
  }

  async invalidate(
    options: {
      series: string;
      numberStart: number;
      numberEnd: number;
      reason: string;
    } & CompanyOption
  ): Promise<Record<string, unknown>> {
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
      company: options.company,
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
    options: { documentType: DocumentType; correction: string } & CompanyOption
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
      company: options.company,
    });
  }

  async reissue(
    invoiceId: string,
    options: { idempotencyKey?: string } & CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/invoices/${invoiceId}/reissue`, {
      idempotencyKey: options.idempotencyKey,
      company: options.company,
    });
  }

  /**
   * Documents other companies issued against this one.
   *
   * Reads what the API already collected; it does not call the
   * authorizer. The API collects every six hours, and syncReceived()
   * asks it to collect now. The first 50 received documents a month
   * are included in every plan; each one after that takes R$ 0,05 from
   * the account credit, unless usage().received_free says the account
   * is exempt.
   */
  async received(
    options: { limit?: number; offset?: number } & CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    const query: Record<string, string> = {};
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.offset !== undefined) query.offset = String(options.offset);

    return this.request("GET", "/received-invoices", {
      query,
      company: options.company,
    });
  }

  /**
   * Collects the documents issued against this company from the SEFAZ
   * now, instead of waiting for the six-hour schedule.
   *
   * After a read that finds nothing more, the SEFAZ makes the CNPJ
   * wait one hour before asking again. Inside that wait the API answers
   * 429 DISTRIBUTION_COOLDOWN, raised as a RateLimitedError whose
   * retryAt and retryAfter say when to come back. next_sync_at on the
   * result says the same after a successful call. Documents past the
   * 50 a month included take R$ 0,05 each from the account credit.
   */
  async syncReceived(options: CompanyOption = {}): Promise<ReceivedSync> {
    const result = await this.request("POST", "/received-invoices/sync", {
      company: options.company,
    });
    return {
      ...result,
      stored: numberOr(result.stored, 0),
      pages: numberOr(result.pages, 0),
      last_nsu: stringOr(result.last_nsu, ""),
      max_nsu: optionalString(result.max_nsu) ?? null,
      next_sync_at: optionalString(result.next_sync_at) ?? null,
    };
  }

  /**
   * What this company issued, newest first.
   *
   * The counterpart of received(): that one lists what was issued
   * against the company, this one what the company issued.
   *
   * externalReference matches the caller's own id exactly. fields
   * "summary" answers a lighter item per invoice.
   */
  async history(
    options: {
      documentType?: DocumentType;
      status?: string;
      externalReference?: string;
      fields?: "summary";
      limit?: number;
      offset?: number;
      sortBy?: string;
      orderBy?: string;
    } & CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    const query: Record<string, string> = {};
    if (options.documentType !== undefined)
      query.document_type = options.documentType;
    if (options.status !== undefined) query.status = options.status;
    if (options.externalReference !== undefined)
      query.external_reference = options.externalReference;
    if (options.fields !== undefined) query.fields = options.fields;
    if (options.limit !== undefined) query.limit = String(options.limit);
    if (options.offset !== undefined) query.offset = String(options.offset);
    if (options.sortBy !== undefined) query.sort_by = options.sortBy;
    if (options.orderBy !== undefined) query.order_by = options.orderBy;

    return this.request("GET", "/invoices", {
      query,
      company: options.company,
    });
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
    options: { manifestation: Manifestation; reason?: string } & CompanyOption
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
      { body, company: options.company }
    );
  }

  /**
   * The printable rendering of an authorized document, as raw bytes —
   * the only method that does not return a parsed object.
   *
   * The API draws it itself from the authorized XML: the DANFE for an
   * NF-e, the DANFSe for an NFS-e. The XML stays the legally valid
   * document; the PDF is its representation.
   */
  async pdf(
    accessKey: string,
    options: { documentType: DocumentType } & CompanyOption
  ): Promise<Uint8Array> {
    const response = await this.send("GET", `/invoices/${accessKey}/pdf`, {
      query: { document_type: options.documentType },
      company: options.company,
    });
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * The XML of a received NF-e (procNFe), as raw bytes, not decoded.
   *
   * Only a document the SEFAZ released in full has one: a summary is an
   * APIError 409 RECEIVED_XML_NOT_AVAILABLE (ReceivedXmlNotAvailableError),
   * answered by manifesting it first. 402 RECEIVED_PAYMENT_REQUIRED is a
   * PaymentRequiredError. Reading it is never billed.
   */
  async receivedXml(
    accessKey: string,
    options: CompanyOption = {}
  ): Promise<Uint8Array> {
    const response = await this.send(
      "GET",
      `/received-invoices/${segment(accessKey)}/xml`,
      { company: options.company }
    );
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
    invoiceId: string,
    options: CompanyOption = {}
  ): Promise<Array<Record<string, unknown>>> {
    return this.requestList(
      "GET",
      `/invoices/${segment(invoiceId)}/submissions`,
      { company: options.company }
    );
  }

  /**
   * Why a rejected document was refused, and what to change.
   *
   * submissions() has the authorizer's own answer; this reads it for
   * someone who does not speak SEFAZ: code, message, explanation,
   * steps, the field to fix and, when there is one, a suggested value.
   * Takes the invoiceId, like submissions(). A document that is not
   * rejected is an APIError 409.
   */
  async rejection(
    invoiceId: string,
    options: CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    return this.request("GET", `/invoices/${segment(invoiceId)}/rejection`, {
      company: options.company,
    });
  }

  /**
   * A suggested fiscal classification for one item's description.
   *
   * A suggestion, never a decision: primary_candidate and
   * alternative_candidates carry the NCM, CFOP, CST/CSOSN, CEST or
   * service code, each read from the published tables, with a
   * confidence, and missing_information lists what would settle it
   * (pass those back in answers). Someone confirms it before it goes on
   * an item; the codes decide the tax owed.
   */
  async classify(request: ClassifyRequest): Promise<Record<string, unknown>> {
    const length = [...(request.description ?? "")].length;
    if (length < 3 || length > 500) {
      throw new ValidationError("description must be 3 to 500 characters");
    }
    requireOneOf("documentType", request.documentType, DocumentType);
    if (
      request.recipientState !== undefined &&
      request.recipientState.length !== 2
    ) {
      throw new ValidationError("recipientState must be a two-letter UF");
    }

    const body: Record<string, unknown> = {
      description: request.description,
      document_type: request.documentType,
    };
    if (request.recipientState !== undefined) {
      body.recipient_state = request.recipientState.toUpperCase();
    }
    if (request.answers && Object.keys(request.answers).length > 0) {
      body.answers = { ...request.answers };
    }

    return this.request("POST", "/ai/classify", {
      body,
      company: request.company,
    });
  }

  /**
   * Counts of this company's documents, and the last days of them.
   *
   * total, by_document_type and by_status cover every document;
   * current_period/previous_period compare the last days (1 to 365, the
   * API's default 30) with the ones before, and daily_series has one
   * row per day.
   */
  async stats(
    options: { days?: number } & CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    const query: Record<string, string> = {};
    if (options.days !== undefined) {
      if (
        !Number.isInteger(options.days) ||
        options.days < 1 ||
        options.days > 365
      ) {
        throw new ValidationError("days must be 1 to 365");
      }
      query.days = String(options.days);
    }

    return this.request("GET", "/invoices/stats", {
      query,
      company: options.company,
    });
  }

  /**
   * Whether the company can issue right now, and if not, why.
   *
   * ready (at least one document type can be issued) is false with
   * missing naming the cause: certificate, certificate_expired,
   * certificate_unreadable, address, state_registration (NF-e) or plan.
   * by_document_type breaks it down per nfe/nfse (ready, missing,
   * warnings; an address issue lists its fields) and fix_url is the
   * dashboard screen for the first blocker, null when nothing blocks.
   * Also has_certificate, certificate_expires_at, tax_regime (CRT),
   * state, default_series per document type and
   * suggested_fiscal_fields, what the CNPJ registry suggests where it
   * differs — never applied. Company.update() fixes the address and
   * fiscal fields. Ask before a first document instead of failing it.
   */
  async readiness(
    options: CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    return this.request("GET", "/company", { company: options.company });
  }

  /**
   * The numbering ranges this company already invalidated, a page.
   *
   * Each row carries the range, the reason, the SEFAZ status and its
   * protocol. Read it before invalidate() to avoid reporting the same
   * range twice.
   */
  async invalidations(
    options: PageQuery = {}
  ): Promise<Record<string, unknown>> {
    return this.request("GET", "/invoices/invalidations", {
      query: pageQuery(options),
      company: options.company,
    });
  }

  /**
   * Which companies this credential reaches, and with what permissions,
   * in the environment it belongs to.
   *
   * The way to learn the ids a multi-company credential may pass as
   * company. It needs no company itself. An API key is one company with
   * every permission, and lists as such.
   */
  async companies(): Promise<AuthorizedCompanies> {
    const result = await this.request("GET", "/me/companies");
    return {
      environment: String(result.environment ?? ""),
      companies: companyListing(result.companies),
    };
  }

  /**
   * The company's plan and what it has used in the current period:
   * issued and received documents against what the plan includes, the
   * prices past that, and the account credit, all in cents.
   *
   * Fields the API adds later come through as they are. An API that
   * predates received-invoice billing leaves the received_* fields out;
   * they default to 50 included, 0 used, 5 cents each and not exempt.
   */
  async usage(options: CompanyOption = {}): Promise<Usage> {
    const result = await this.request("GET", "/company/usage", {
      company: options.company,
    });
    return {
      ...result,
      plan_name: stringOr(result.plan_name, ""),
      plan_slug: stringOr(result.plan_slug, ""),
      included_invoices: numberOr(result.included_invoices, 0),
      used_invoices: numberOr(result.used_invoices, 0),
      overage_price_cents:
        typeof result.overage_price_cents === "number"
          ? result.overage_price_cents
          : null,
      included_received: numberOr(result.included_received, 50),
      used_received: numberOr(result.used_received, 0),
      received_price_cents: numberOr(result.received_price_cents, 5),
      received_free: result.received_free === true,
      current_period_start: stringOr(result.current_period_start, ""),
      current_period_end: optionalString(result.current_period_end) ?? null,
      credit_balance: numberOr(result.credit_balance, 0),
      companies_on_account: numberOr(result.companies_on_account, 0),
    };
  }
}

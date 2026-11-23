import type { AuthorizedCompany } from "./types";

export class InvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceError";
  }
}

/** What the API says about a failure beyond its status; each part is undefined when absent. */
export interface ErrorInfo {
  code?: string;
  field?: string;
  retryable?: boolean;
  documentId?: string;
  sefazRejection?: string;
  expected?: string;
  received?: string;
}

/**
 * Any non-2xx answer. code is the API's stable code (a rule such as
 * NCM_NOT_FULL_CODE, an authority outcome such as OUTCOME_UNKNOWN or a
 * SEFAZ cStat); field the request path it points at; retryable whether
 * repeating the call can help; documentId the authority's id for an
 * issuance whose outcome is unknown; sefazRejection the cStat a
 * pre-SEFAZ check spares the caller.
 */
export class APIError extends InvoiceError {
  readonly statusCode: number;
  readonly detail: string;
  readonly code?: string;
  readonly field?: string;
  readonly retryable?: boolean;
  readonly documentId?: string;
  readonly sefazRejection?: string;
  readonly expected?: string;
  readonly received?: string;

  constructor(statusCode: number, detail: string, info: ErrorInfo = {}) {
    super(`[${statusCode}] ${detail}`);
    this.name = "APIError";
    this.statusCode = statusCode;
    this.detail = detail;
    this.code = info.code;
    this.field = info.field;
    this.retryable = info.retryable;
    this.documentId = info.documentId;
    this.sefazRejection = info.sefazRejection;
    this.expected = info.expected;
    this.received = info.received;
  }
}

/** Sets the parsed fields on an error built by a subclass constructor. */
export function withInfo<T extends APIError>(error: T, info: ErrorInfo): T {
  const defined = Object.fromEntries(
    Object.entries(info).filter(([, value]) => value !== undefined)
  );
  return Object.assign(error, defined);
}

export class ConnectionFailedError extends InvoiceError {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionFailedError";
  }
}

export class ValidationError extends InvoiceError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * A 422 with detail.error company_required: the credential covers
 * several companies and the call named none. companies lists them;
 * pick one and pass it as company. Never retried.
 */
export class CompanyRequiredError extends APIError {
  readonly companies: AuthorizedCompany[];

  constructor(
    statusCode: number,
    detail: string,
    companies: AuthorizedCompany[]
  ) {
    super(statusCode, detail);
    this.name = "CompanyRequiredError";
    this.companies = companies;
  }
}

/**
 * A 403 with detail.error company_not_in_scope: the company named is
 * not one this credential covers. companies lists the ones it does.
 * Never retried.
 */
export class CompanyNotInScopeError extends APIError {
  readonly companies: AuthorizedCompany[];

  constructor(
    statusCode: number,
    detail: string,
    companies: AuthorizedCompany[]
  ) {
    super(statusCode, detail);
    this.name = "CompanyNotInScopeError";
    this.companies = companies;
  }
}

/**
 * A 403 with detail.code INSUFFICIENT_PERMISSION: the credential
 * reaches the company but lacks the permission this call needs. detail
 * reads "needs X, has Y, company=<id>". Never retried.
 */
export class InsufficientPermissionError extends APIError {
  constructor(statusCode: number, detail: string) {
    super(statusCode, detail);
    this.name = "InsufficientPermissionError";
  }
}

/**
 * A 409 with detail.code CLIENT_EXISTS: the company already has a
 * client with this taxId or foreignId. clientId names it, to read or
 * reactivate instead of searching for it.
 */
export class ClientAlreadyExistsError extends APIError {
  readonly clientId: string;

  constructor(statusCode: number, detail: string, clientId: string) {
    super(statusCode, detail);
    this.name = "ClientAlreadyExistsError";
    this.clientId = clientId;
  }
}

/**
 * A 402: the account's plan or credit does not cover this call. detail
 * says why.
 */
export class PaymentRequiredError extends APIError {
  constructor(statusCode: number, detail: string) {
    super(statusCode, detail);
    this.name = "PaymentRequiredError";
  }
}

/**
 * A 429: the call came too soon. retryAfter is the Retry-After header
 * in seconds, retryAt the moment the body names (an ISO 8601 string),
 * and code the reason the API gives, DISTRIBUTION_COOLDOWN for a
 * received-invoices sync inside the SEFAZ one-hour wait. Each is
 * undefined when the response does not carry it.
 */
export class RateLimitedError extends APIError {
  readonly retryAfter?: number;
  readonly retryAt?: string;

  constructor(
    statusCode: number,
    detail: string,
    options: { retryAfter?: number; retryAt?: string; code?: string } = {}
  ) {
    super(statusCode, detail, { code: options.code });
    this.name = "RateLimitedError";
    this.retryAfter = options.retryAfter;
    this.retryAt = options.retryAt;
  }
}

/**
 * A 422 with detail.code CLIENT_INACTIVE: the clientId names a
 * deactivated client. Reactivate it (Clients.reactivate) or issue
 * without it.
 */
export class ClientInactiveError extends APIError {
  readonly clientId: string;

  constructor(statusCode: number, detail: string, clientId: string) {
    super(statusCode, detail);
    this.name = "ClientInactiveError";
    this.clientId = clientId;
  }
}

/**
 * A 404 with detail.code CLIENT_NOT_FOUND: the clientId names no
 * client of this company.
 */
export class ClientNotFoundError extends APIError {
  readonly clientId: string;

  constructor(statusCode: number, detail: string, clientId: string) {
    super(statusCode, detail);
    this.name = "ClientNotFoundError";
    this.clientId = clientId;
  }
}

/**
 * A 409 with detail.code ITEM_EXISTS: the company already has an item
 * with this code or externalReference (a deactivated one still holds
 * it). itemId names it and field says which of the two collided, to
 * read or reactivate it instead of searching.
 */
export class ItemAlreadyExistsError extends APIError {
  readonly itemId: string;
  readonly field: string;

  constructor(
    statusCode: number,
    detail: string,
    itemId: string,
    field: string
  ) {
    super(statusCode, detail);
    this.name = "ItemAlreadyExistsError";
    this.itemId = itemId;
    this.field = field;
  }
}

/**
 * A 404 with detail.code ITEM_NOT_FOUND: the itemId names no item of
 * this company (another company's counts as none).
 */
export class ItemNotFoundError extends APIError {
  readonly itemId: string;

  constructor(statusCode: number, detail: string, itemId: string) {
    super(statusCode, detail);
    this.name = "ItemNotFoundError";
    this.itemId = itemId;
  }
}

/**
 * A 422 with detail.code ITEM_INACTIVE: the itemId on an issue line
 * names a deactivated item. Reactivate it (Items.reactivate) or issue
 * the line without it.
 */
export class ItemInactiveError extends APIError {
  readonly itemId: string;

  constructor(statusCode: number, detail: string, itemId: string) {
    super(statusCode, detail);
    this.name = "ItemInactiveError";
    this.itemId = itemId;
  }
}

/**
 * A 422 with detail.code ITEM_KIND_MISMATCH: an issue line names a
 * service on an NF-e or a product on an NFS-e. index is the line.
 */
export class ItemKindMismatchError extends APIError {
  readonly itemId: string;
  readonly index?: number;

  constructor(
    statusCode: number,
    detail: string,
    itemId: string,
    index?: number
  ) {
    super(statusCode, detail);
    this.name = "ItemKindMismatchError";
    this.itemId = itemId;
    this.index = index;
  }
}

/**
 * A 422 with detail.code ITEM_TAX_REQUIRED: the item's taxSituation
 * carries ICMS amounts the catalog does not keep, so the issue line
 * must send its own product.br.tax. index is the line.
 */
export class ItemTaxRequiredError extends APIError {
  readonly itemId: string;
  readonly index?: number;

  constructor(
    statusCode: number,
    detail: string,
    itemId: string,
    index?: number
  ) {
    super(statusCode, detail);
    this.name = "ItemTaxRequiredError";
    this.itemId = itemId;
    this.index = index;
  }
}

/**
 * A 422 with detail.code ITEM_TAX_REGIME_MISMATCH: the item's
 * taxSituation does not fit the company's tax regime (a CSOSN is for
 * Simples Nacional, a CST for the rest), or is not allowed on an export
 * CFOP. Send tax on that line, or fix the item. index is the line.
 */
export class ItemTaxRegimeMismatchError extends APIError {
  readonly itemId: string;
  readonly index?: number;

  constructor(
    statusCode: number,
    detail: string,
    itemId: string,
    index?: number
  ) {
    super(statusCode, detail);
    this.name = "ItemTaxRegimeMismatchError";
    this.itemId = itemId;
    this.index = index;
  }
}

/**
 * A 409 with detail.code RECEIVED_XML_NOT_AVAILABLE: the company holds
 * only the summary of this received document. Manifest it
 * (Invoice.manifest) so the SEFAZ releases the full document, then
 * read again.
 */
export class ReceivedXmlNotAvailableError extends APIError {
  constructor(statusCode: number, detail: string) {
    super(statusCode, detail);
    this.name = "ReceivedXmlNotAvailableError";
  }
}

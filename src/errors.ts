import type { AuthorizedCompany } from "./types";

export class InvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceError";
  }
}

export class APIError extends InvoiceError {
  readonly statusCode: number;
  readonly detail: string;

  constructor(statusCode: number, detail: string) {
    super(`[${statusCode}] ${detail}`);
    this.name = "APIError";
    this.statusCode = statusCode;
    this.detail = detail;
  }
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
  readonly code?: string;

  constructor(
    statusCode: number,
    detail: string,
    options: { retryAfter?: number; retryAt?: string; code?: string } = {}
  ) {
    super(statusCode, detail);
    this.name = "RateLimitedError";
    this.retryAfter = options.retryAfter;
    this.retryAt = options.retryAt;
    this.code = options.code;
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

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

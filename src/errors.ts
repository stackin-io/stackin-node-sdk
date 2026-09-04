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

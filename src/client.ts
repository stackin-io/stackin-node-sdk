import { Address } from "./address";
import { Product } from "./br/product";
import {
  APIError,
  ConnectionFailedError,
  InvoiceError,
  ValidationError,
} from "./errors";
import { DocumentType, Environment, Manifestation } from "./types";

export const DEFAULT_BASE_URL = "https://sdk.stackin.io";

const ENVIRONMENT_URLS: Record<Environment, string> = {
  [Environment.LOCAL]: "http://localhost:8000",
  [Environment.TEST]: DEFAULT_BASE_URL,
  [Environment.PRODUCTION]: DEFAULT_BASE_URL,
};

const NFE_ADDRESS_FIELDS: Array<keyof Address> = [
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
  "zipCode",
  "cityCode",
];

export interface InvoiceOptions {
  apiKey?: string;
  baseUrl?: string;
  environment?: Environment;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface IssueRequest {
  documentType: DocumentType;
  clientName: string;
  taxId: string;
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

function validateNfeAddress(address: Address | undefined): void {
  if (!address) {
    throw new ValidationError("recipientAddress is required for NFE");
  }
  const missing = NFE_ADDRESS_FIELDS.filter(
    (field) => !(address as unknown as Record<string, unknown>)[field]
  );
  if (missing.length > 0) {
    throw new ValidationError(
      `recipientAddress is missing required fields for NFE: ${missing.join(", ")}`
    );
  }
}

export class Invoice {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: InvoiceOptions = {}) {
    this.baseUrl = resolveBaseUrl(
      options.baseUrl,
      options.environment
    ).replace(/\/+$/, "");
    this.apiKey = options.apiKey ?? process.env.STACKIN_API_KEY;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

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

  async cancel(
    accessKey: string,
    options: { documentType: DocumentType; reason: string }
  ): Promise<Record<string, unknown>> {
    return this.request("POST", `/invoices/${accessKey}/cancel`, {
      body: {
        document_type: options.documentType,
        reason: options.reason,
      },
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

  async correct(
    accessKey: string,
    options: { documentType: DocumentType; correction: string }
  ): Promise<Record<string, unknown>> {
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

  private headers(idempotencyKey?: string): Record<string, string> {
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

  private async request(
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

  private async send(
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

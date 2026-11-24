export enum DocumentType {
  NFE = "nfe",
  NFSE = "nfse",
}

/** The recipient's four possible answers to a received document. */
export enum Manifestation {
  CONFIRMACAO = "210200",
  CIENCIA = "210210",
  DESCONHECIMENTO = "210220",
  OPERACAO_NAO_REALIZADA = "210240",
}

/** Why an NF-e is issued (finNFe). NF-e only; the API defaults to NORMAL. */
export enum Purpose {
  NORMAL = "normal",
  COMPLEMENTARY = "complementary",
  ADJUSTMENT = "adjustment",
  RETURN = "return",
}

/**
 * Which way the goods go (tpNF). IN is an incoming NF-e the company
 * issues itself, a sale returned by the buyer say. NF-e only; the API
 * defaults to OUT.
 */
export enum Direction {
  OUT = "out",
  IN = "in",
}

export enum Environment {
  LOCAL = "local",
  TEST = "test",
  PRODUCTION = "production",
}

/** One company a credential covers, and what it may do there. */
export interface AuthorizedCompany {
  company_id: string;
  name: string;
  tax_id: string;
  permissions: string[];
}

/** What GET /me/companies answers: every company in one environment. */
export interface AuthorizedCompanies {
  environment: string;
  companies: AuthorizedCompany[];
}

/**
 * What GET /company/usage answers. Amounts are in cents; dates are ISO
 * 8601 strings as the API sends them. Fields the API adds later come
 * through untyped.
 */
export interface Usage {
  plan_name: string;
  plan_slug: string;
  included_invoices: number;
  used_invoices: number;
  /** Price of each issuance past the plan; null when the plan has none. */
  overage_price_cents: number | null;
  /** Received documents included each month. */
  included_received: number;
  used_received: number;
  /** Price of each received document past the included ones. */
  received_price_cents: number;
  /** true when the account is exempt from received-document charges. */
  received_free: boolean;
  current_period_start: string;
  current_period_end: string | null;
  /** Account credit, in cents. */
  credit_balance: number;
  companies_on_account: number;
  [field: string]: unknown;
}

/** What POST /received-invoices/sync answers. */
export interface ReceivedSync {
  /** Documents stored by this sync. */
  stored: number;
  /** Distribution pages read from the SEFAZ. */
  pages: number;
  last_nsu: string;
  max_nsu: string | null;
  /** The earliest moment another sync is accepted, ISO 8601. */
  next_sync_at: string | null;
  [field: string]: unknown;
}

/** One refusal of POST /invoices/validate, as every pre-SEFAZ 422 has it. */
export interface ValidationFinding {
  code: string;
  /** Path of the offending value in the request; null for a company blocker. */
  field: string | null;
  message: string;
  /** The SEFAZ cStat this check spares the caller. */
  sefaz_rejection?: string | null;
  expected?: string | null;
  received?: string | null;
  /** Dashboard screen where the owner fixes a company blocker. */
  fix_url?: string | null;
}

/** A default the issuance would declare for the company. */
export interface ValidationWarning {
  code: string;
  message: string;
  field?: string | null;
}

/** One activity finding on an issued document; field is null when there is none. */
export interface IssueWarning {
  code: string;
  message: string;
  field: string | null;
}

/** What validate() answers. */
export interface InvoiceValidation {
  valid: boolean;
  errors: ValidationFinding[];
  warnings: ValidationWarning[];
  [field: string]: unknown;
}

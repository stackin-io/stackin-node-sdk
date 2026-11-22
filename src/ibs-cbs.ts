import { ValidationError } from "./errors";

export type IbsCbsDocumentType = "nfe" | "nfce" | "nfse";

/** Rates in percent, 0 to 100; each one optional. */
export interface IbsCbsRates {
  /** pIBSUF. */
  rateState?: number;
  /** pIBSMun. */
  rateCity?: number;
  /** pCBS. */
  rateFederal?: number;
}

export interface IbsCbsCalculationItem extends IbsCbsRates {
  /** 3 digits. */
  cst: string;
  /** cClassTrib, 6 digits. */
  classification: string;
  /** Greater than 0; the base when base is left out. */
  amount?: number;
  /** vBC, greater than 0; defaults to amount. */
  base?: number;
  /** pRedAliq of the IBS, percent. */
  reductionIbs?: number;
  /** pRedAliq of the CBS, percent. */
  reductionCbs?: number;
}

export interface IbsCbsCalculationRequest {
  /** 1 to 990 items. */
  items: IbsCbsCalculationItem[];
  /** YYYY-MM-DD. */
  operationDate: string;
  /** Defaults to "nfe" on the API. */
  documentType?: IbsCbsDocumentType;
  /** Rates for every item; an item's own rate wins. */
  rates?: IbsCbsRates;
}

export interface IbsCbsIndicators {
  group: number | null;
  reduction: number | null;
  deferral: number | null;
}

/** Decimal strings, as the API sends them. */
export interface IbsCbsAppliedRates {
  rate_state: string;
  rate_city: string;
  rate_federal: string;
}

/** Decimal strings, as the API sends them. */
export interface IbsCbsAmounts {
  base: string;
  ibs_state: string;
  ibs_city: string;
  ibs: string;
  cbs: string;
  deferred_ibs_state: string;
  deferred_ibs_city: string;
  deferred_cbs: string;
}

export interface IbsCbsCalculatedItem {
  cst: string;
  classification: string;
  indicators: IbsCbsIndicators;
  has_group: boolean;
  rates: IbsCbsAppliedRates | null;
  rates_source: "caller" | "official_2026" | null;
  reduction_ibs: string | null;
  reduction_cbs: string | null;
  effective_rates: IbsCbsAppliedRates | null;
  deferral: string | null;
  amounts: IbsCbsAmounts;
  [field: string]: unknown;
}

export interface IbsCbsCalculation {
  simulated: boolean;
  notice: string;
  document_type: string;
  operation_date: string;
  items: IbsCbsCalculatedItem[];
  total: IbsCbsAmounts;
  [field: string]: unknown;
}

const DOCUMENT_TYPES: readonly string[] = ["nfe", "nfce", "nfse"];
const MAX_ITEMS = 990;

const RATE_KEYS: Record<string, string> = {
  rateState: "rate_state",
  rateCity: "rate_city",
  rateFederal: "rate_federal",
};

const ITEM_KEYS: Record<string, string> = {
  cst: "cst",
  classification: "classification",
  amount: "amount",
  base: "base",
  ...RATE_KEYS,
  reductionIbs: "reduction_ibs",
  reductionCbs: "reduction_cbs",
};

const PERCENT_KEYS = [
  "rateState",
  "rateCity",
  "rateFederal",
  "reductionIbs",
  "reductionCbs",
];

function percent(name: string, value: unknown): void {
  if (typeof value !== "number" || !(value >= 0 && value <= 100)) {
    throw new ValidationError(`${name} must be a number from 0 to 100`);
  }
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function refuseUnknown(
  name: string,
  fields: Record<string, unknown>,
  known: readonly string[]
): void {
  const unknown = Object.keys(fields)
    .filter((key) => !known.includes(key))
    .sort();
  if (unknown.length > 0) {
    throw new ValidationError(
      `${name} does not take ${unknown.join(", ")}. Known: ${known.join(", ")}`
    );
  }
}

function ratesBody(
  name: string,
  rates: IbsCbsRates
): Record<string, number> | undefined {
  if (typeof rates !== "object" || rates === null || Array.isArray(rates)) {
    throw new ValidationError(`${name} must be an object`);
  }
  refuseUnknown(
    name,
    rates as Record<string, unknown>,
    Object.keys(RATE_KEYS)
  );
  const out: Record<string, number> = {};
  for (const [key, wire] of Object.entries(RATE_KEYS)) {
    const value = (rates as Record<string, unknown>)[key];
    if (!present(value)) continue;
    percent(`${name}.${key}`, value);
    out[wire] = value as number;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function itemBody(item: IbsCbsCalculationItem, index: number): unknown {
  const name = `items[${index}]`;
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    throw new ValidationError(`${name} must be an object`);
  }
  const given = item as unknown as Record<string, unknown>;
  refuseUnknown(name, given, Object.keys(ITEM_KEYS));
  if (typeof item.cst !== "string" || !/^\d{3}$/.test(item.cst)) {
    throw new ValidationError(`${name}.cst must be 3 digits`);
  }
  if (
    typeof item.classification !== "string" ||
    !/^\d{6}$/.test(item.classification)
  ) {
    throw new ValidationError(`${name}.classification must be 6 digits`);
  }
  if (!present(item.amount) && !present(item.base)) {
    throw new ValidationError(`${name} needs amount or base`);
  }
  for (const key of ["amount", "base"]) {
    const value = given[key];
    if (present(value) && !(typeof value === "number" && value > 0)) {
      throw new ValidationError(`${name}.${key} must be greater than 0`);
    }
  }
  for (const key of PERCENT_KEYS) {
    if (present(given[key])) percent(`${name}.${key}`, given[key]);
  }

  const out: Record<string, unknown> = {};
  for (const [key, wire] of Object.entries(ITEM_KEYS)) {
    if (present(given[key])) out[wire] = given[key];
  }
  return out;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function ibsCbsBody(
  request: IbsCbsCalculationRequest
): Record<string, unknown> {
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new ValidationError("request must be an object");
  }
  refuseUnknown("request", request as unknown as Record<string, unknown>, [
    "items",
    "operationDate",
    "documentType",
    "rates",
  ]);
  if (!validDate(request.operationDate)) {
    throw new ValidationError("operationDate must be a date, YYYY-MM-DD");
  }
  if (
    !Array.isArray(request.items) ||
    request.items.length < 1 ||
    request.items.length > MAX_ITEMS
  ) {
    throw new ValidationError(`items must have 1 to ${MAX_ITEMS} entries`);
  }
  if (
    present(request.documentType) &&
    !DOCUMENT_TYPES.includes(request.documentType as string)
  ) {
    throw new ValidationError(
      `documentType must be one of ${DOCUMENT_TYPES.join(", ")}`
    );
  }

  const body: Record<string, unknown> = {
    operation_date: request.operationDate,
    items: request.items.map(itemBody),
  };
  if (present(request.documentType)) body.document_type = request.documentType;
  if (present(request.rates)) {
    const rates = ratesBody("rates", request.rates as IbsCbsRates);
    if (rates) body.rates = rates;
  }
  return body;
}

import { ValidationError } from "../errors";

const NCM_PATTERN = /^(00|\d{8})$/;
const BARCODE_PATTERN = /^(SEM GTIN|\d{8}|\d{12,14})$/;
const RECOPI_PATTERN = /^\d{20}$/;

/**
 * GS1 modulo-10: from the rightmost digit before the check digit,
 * weights alternate 3, 1, 3, 1...; the check digit closes the sum to
 * the next multiple of 10.
 */
function hasValidGtinCheckDigit(gtin: string): boolean {
  const digits = [...gtin].map(Number);
  const check = digits.pop() as number;
  const sum = digits
    .reverse()
    .reduce(
      (total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1),
      0
    );
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * RECOPI modulo-11 (MOC 7.0 §8.5): each check digit weighs the digits
 * before it from n down to 1, left to right; a remainder of 0 or 1 gives 0,
 * otherwise 11 minus the remainder. DV1 covers the first 18 digits, DV2 the
 * first 19 (DV1 included).
 */
function recopiCheckDigit(digits: number[]): number {
  const sum = digits.reduce(
    (total, digit, index) => total + digit * (digits.length - index),
    0
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function hasValidRecopiCheckDigits(recopi: string): boolean {
  const digits = [...recopi].map(Number);
  return (
    recopiCheckDigit(digits.slice(0, 18)) === digits[18] &&
    recopiCheckDigit(digits.slice(0, 19)) === digits[19]
  );
}

/** A presumed tax credit applied to this item. */
export interface PresumedCredit {
  code: string;
  percentage: number;
  amount: number;
}

export interface IbsCbsFields {
  cst: string;
  classification: string;
  base?: number;
  rate_state?: number;
  rate_city?: number;
  rate_federal?: number;
  reduction_ibs?: number;
  reduction_cbs?: number;
  /** cIndOp, 6 digits. */
  operation_indicator?: string;
}

/**
 * The NF-e fuel group (comb), needed for a CFOP the official table marks
 * as fuel. Groups it does not cover (CIDE, encerrante, origComb) still go
 * through extraGroups.comb, but never both at once.
 */
export interface FuelFields {
  /** cProdANP: 9 digits, from the ANP SIMP table. */
  anpCode: string;
  /** descANP: the ANP description, 2 to 95 characters. */
  anpDescription: string;
  /** UFCons: the state where it is consumed. */
  consumerState: string;
  /** pGLP, GLP only. */
  glpPercent?: number;
  /** pGNn, GLP only. */
  naturalGasNationalPercent?: number;
  /** pGNi, GLP only. */
  naturalGasImportedPercent?: number;
  /** vPart, GLP only. */
  startingValue?: number;
  /** CODIF, up to 21 digits. */
  codif?: string;
  /** qTemp: the quantity at 20 °C. */
  temperatureQuantity?: number;
  /** pBio. */
  biodieselPercent?: number;
}

const FUEL_KEYS: Record<keyof FuelFields, string> = {
  anpCode: "anp_code",
  anpDescription: "anp_description",
  consumerState: "consumer_state",
  glpPercent: "glp_percent",
  naturalGasNationalPercent: "natural_gas_national_percent",
  naturalGasImportedPercent: "natural_gas_imported_percent",
  startingValue: "starting_value",
  codif: "codif",
  temperatureQuantity: "temperature_quantity",
  biodieselPercent: "biodiesel_percent",
};

const FUEL_REQUIRED: Array<keyof FuelFields> = [
  "anpCode",
  "anpDescription",
  "consumerState",
];

function fuelJSON(fuel: FuelFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, wire] of Object.entries(FUEL_KEYS)) {
    const value = fuel[key as keyof FuelFields];
    if (value !== undefined && value !== null) out[wire] = value;
  }
  return out;
}

export interface ProductFields {
  /** Required unless itemId is given: the catalog item fills it in. */
  description?: string;
  /**
   * A catalog item of the company (see Items). It fills whatever the
   * line leaves out (description, unitPrice, unit, barcode, ncm, cfop,
   * cest, tax, serviceCode, taxRetained); what the line sends wins.
   * The SDK then sends unit and taxRetained only when set, so the
   * item's are not overridden by the defaults, and does not require
   * ncm and cfop locally: the API checks the merged line.
   */
  itemId?: string;
  amount?: number;
  unitPrice?: number;
  unit?: string;
  quantity?: number;
  /** cEAN: "SEM GTIN" or a GTIN of 8, 12, 13 or 14 digits with a valid check digit. */
  barcode?: string;
  freight?: number;
  insurance?: number;
  discount?: number;
  otherExpenses?: number;
  usedMovableAsset?: boolean;
  purchaseOrder?: string;
  purchaseOrderItem?: string;
  /** Net weight of one unit in kg, at least 0. NF-e only. */
  netWeight?: number;
  /** Gross weight of one unit in kg, at least 0. NF-e only. */
  grossWeight?: number;

  /** The full 8 digits, or 00 for a service line; SEFAZ rejects any other short code with 777. */
  ncm?: string;
  cfop?: string;
  cest?: string;
  nveCodes?: string[];
  indEscala?: string;
  manufacturerCnpj?: string;
  taxBenefitCode?: string;
  presumedCredits?: PresumedCredit[];
  exTipi?: string;
  importContentControlNumber?: string;
  /** nRECOPI: the 20-digit RECOPI number with valid modulo-11 check digits. */
  recopiNumber?: string;
  ibsCbs?: IbsCbsFields;
  extraGroups?: Record<string, unknown>;
  tax?: Record<string, unknown>;
  /** The NF-e fuel group, sent under product.br.fuel. */
  fuel?: FuelFields;

  serviceCode?: string;
  serviceDiscount?: number;
  taxRetained?: boolean;
  observations?: string;
}

const BR_KEYS: Array<keyof ProductFields> = [
  "ncm",
  "cfop",
  "cest",
  "nveCodes",
  "indEscala",
  "manufacturerCnpj",
  "taxBenefitCode",
  "presumedCredits",
  "exTipi",
  "importContentControlNumber",
  "recopiNumber",
  "extraGroups",
  "ibsCbs",
  "tax",
];

const CAMEL_TO_SNAKE: Record<string, string> = {
  nveCodes: "nve_codes",
  indEscala: "ind_escala",
  manufacturerCnpj: "manufacturer_cnpj",
  taxBenefitCode: "tax_benefit_code",
  presumedCredits: "presumed_credits",
  exTipi: "ex_tipi",
  importContentControlNumber: "import_content_control_number",
  recopiNumber: "recopi_number",
  ibsCbs: "ibs_cbs",
  extraGroups: "extra_groups",
  otherExpenses: "other_expenses",
  usedMovableAsset: "used_movable_asset",
  purchaseOrder: "purchase_order",
  purchaseOrderItem: "purchase_order_item",
  netWeight: "net_weight",
  grossWeight: "gross_weight",
};

const PRODUCT_LEVEL_KEYS: Array<keyof ProductFields> = [
  "unit",
  "quantity",
  "barcode",
  "freight",
  "insurance",
  "discount",
  "otherExpenses",
  "usedMovableAsset",
  "purchaseOrder",
  "purchaseOrderItem",
  "netWeight",
  "grossWeight",
];

function snake(key: string): string {
  return CAMEL_TO_SNAKE[key] ?? key;
}

export function decimalString(value?: number): string | undefined {
  return value === undefined
    ? undefined
    : value.toFixed(10).replace(/\.?0+$/, "");
}

/**
 * A price for the wire: a number through decimalString, a string checked
 * to be a plain decimal (up to 10 places, the vUnCom precision) and sent
 * as it is, so no digit rounds on the way.
 */
export function priceString(value: number | string): string {
  if (typeof value === "number") {
    return decimalString(value) as string;
  }
  const text = value.trim();
  if (!/^\d+(\.\d{1,10})?$/.test(text)) {
    throw new Error(
      "unitPrice must be a decimal with at most 10 places, such as 18.90"
    );
  }
  return text;
}

export class Product {
  description?: string;
  itemId?: string;
  amount?: number;
  unitPrice?: number;
  unit: string;
  quantity: number;
  barcode?: string;
  freight?: number;
  insurance?: number;
  discount?: number;
  otherExpenses?: number;
  usedMovableAsset: boolean;
  purchaseOrder?: string;
  purchaseOrderItem?: string;
  netWeight?: number;
  grossWeight?: number;

  ncm?: string;
  cfop?: string;
  cest?: string;
  nveCodes?: string[];
  indEscala?: string;
  manufacturerCnpj?: string;
  taxBenefitCode?: string;
  presumedCredits?: PresumedCredit[];
  exTipi?: string;
  importContentControlNumber?: string;
  recopiNumber?: string;
  ibsCbs?: IbsCbsFields;
  extraGroups?: Record<string, unknown>;
  tax?: Record<string, unknown>;
  fuel?: FuelFields;

  serviceCode?: string;
  serviceDiscount?: number;
  taxRetained: boolean;
  observations?: string;

  /** With an itemId, whether the line set these, or the catalog's win. */
  private readonly unitGiven: boolean;
  private readonly taxRetainedGiven: boolean;

  constructor(fields: ProductFields) {
    if (
      fields.itemId !== undefined &&
      (typeof fields.itemId !== "string" || fields.itemId.length === 0)
    ) {
      throw new Error("itemId must be a non-empty string");
    }
    if (
      fields.itemId === undefined &&
      (!fields.description || fields.description.length === 0)
    ) {
      throw new Error("description must be a non-empty string");
    }
    if (fields.itemId !== undefined && fields.description === "") {
      throw new Error("description must not be empty when given");
    }
    if (fields.amount !== undefined && !(fields.amount > 0)) {
      throw new Error("amount must be greater than 0");
    }
    if (fields.unitPrice !== undefined && !(fields.unitPrice > 0)) {
      throw new Error("unitPrice must be greater than 0");
    }
    for (const key of ["netWeight", "grossWeight"] as const) {
      const weight = fields[key];
      if (
        weight !== undefined &&
        (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0)
      ) {
        throw new ValidationError(`${key} must be a number of at least 0`);
      }
    }
    if (fields.ncm !== undefined && !NCM_PATTERN.test(fields.ncm)) {
      throw new ValidationError(
        "ncm must be the full 8 digits, or 00 for a service line; SEFAZ rejects any other short code with 777"
      );
    }
    if (
      fields.barcode !== undefined &&
      !BARCODE_PATTERN.test(fields.barcode)
    ) {
      throw new ValidationError(
        'barcode must be "SEM GTIN" or a GTIN of 8, 12, 13 or 14 digits'
      );
    }
    if (
      fields.barcode !== undefined &&
      fields.barcode !== "SEM GTIN" &&
      !hasValidGtinCheckDigit(fields.barcode)
    ) {
      throw new ValidationError("barcode has an invalid GTIN check digit");
    }
    if (fields.recopiNumber !== undefined) {
      if (!RECOPI_PATTERN.test(fields.recopiNumber)) {
        throw new ValidationError("recopiNumber must have exactly 20 digits");
      }
      if (!hasValidRecopiCheckDigits(fields.recopiNumber)) {
        throw new ValidationError("recopiNumber has invalid check digits");
      }
    }
    if (
      fields.ibsCbs?.operation_indicator !== undefined &&
      !/^\d{6}$/.test(fields.ibsCbs.operation_indicator)
    ) {
      throw new ValidationError(
        "ibsCbs.operation_indicator must have exactly 6 digits"
      );
    }
    if (fields.fuel !== undefined) {
      const missing = FUEL_REQUIRED.filter((key) => !fields.fuel?.[key]);
      if (missing.length > 0) {
        throw new ValidationError(
          `fuel is missing required fields: ${missing.join(", ")}`
        );
      }
      if (fields.extraGroups && "comb" in fields.extraGroups) {
        throw new ValidationError(
          "send the fuel group once: fuel or extraGroups.comb"
        );
      }
    }
    this.description = fields.description;
    this.itemId = fields.itemId;
    this.unitGiven = fields.unit !== undefined;
    this.taxRetainedGiven = fields.taxRetained !== undefined;
    this.amount = fields.amount;
    this.unitPrice = fields.unitPrice;
    this.unit = fields.unit ?? "UN";
    this.quantity = fields.quantity ?? 1.0;
    this.barcode = fields.barcode;
    this.freight = fields.freight;
    this.insurance = fields.insurance;
    this.discount = fields.discount;
    this.otherExpenses = fields.otherExpenses;
    this.usedMovableAsset = fields.usedMovableAsset ?? false;
    this.purchaseOrder = fields.purchaseOrder;
    this.purchaseOrderItem = fields.purchaseOrderItem;
    this.netWeight = fields.netWeight;
    this.grossWeight = fields.grossWeight;

    this.ncm = fields.ncm;
    this.cfop = fields.cfop;
    this.cest = fields.cest;
    this.nveCodes = fields.nveCodes;
    this.indEscala = fields.indEscala;
    this.manufacturerCnpj = fields.manufacturerCnpj;
    this.taxBenefitCode = fields.taxBenefitCode;
    this.presumedCredits = fields.presumedCredits;
    this.exTipi = fields.exTipi;
    this.importContentControlNumber = fields.importContentControlNumber;
    this.recopiNumber = fields.recopiNumber;
    this.ibsCbs = fields.ibsCbs;
    this.extraGroups = fields.extraGroups;
    this.tax = fields.tax;
    this.fuel = fields.fuel;

    this.serviceCode = fields.serviceCode;
    this.serviceDiscount = fields.serviceDiscount;
    this.taxRetained = fields.taxRetained ?? false;
    this.observations = fields.observations;
  }

  toJSON(): Record<string, unknown> {
    const product: Record<string, unknown> = { quantity: this.quantity };
    if (this.itemId === undefined || this.unitGiven) product.unit = this.unit;
    for (const key of PRODUCT_LEVEL_KEYS) {
      if (key === "unit" || key === "quantity") continue;
      const value = (this as unknown as Record<string, unknown>)[key];
      if (value !== undefined && value !== null) {
        product[snake(key)] = value;
      }
    }

    const br: Record<string, unknown> = {};
    for (const key of BR_KEYS) {
      const value = (this as unknown as Record<string, unknown>)[key];
      if (value !== undefined && value !== null) {
        br[snake(key)] = value;
      }
    }
    if (this.fuel) br.fuel = fuelJSON(this.fuel);
    if (Object.keys(br).length > 0) {
      product.br = br;
    }

    const fromItem = this.itemId !== undefined;
    return {
      item_id: this.itemId,
      description: this.description,
      amount: decimalString(this.amount),
      unit_price: decimalString(this.unitPrice),
      product,
      service_code: this.serviceCode,
      discount: this.serviceDiscount,
      tax_retained:
        fromItem && !this.taxRetainedGiven ? undefined : this.taxRetained,
      observations: this.observations,
    };
  }
}

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
  rate_state: number;
  rate_city: number;
  rate_federal: number;
}

export interface ProductFields {
  description: string;
  amount?: number;
  unitPrice?: number;
  unit?: string;
  quantity?: number;
  barcode?: string;
  freight?: number;
  insurance?: number;
  discount?: number;
  otherExpenses?: number;
  usedMovableAsset?: boolean;
  purchaseOrder?: string;
  purchaseOrderItem?: string;

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
];

function snake(key: string): string {
  return CAMEL_TO_SNAKE[key] ?? key;
}

function decimalString(value?: number): string | undefined {
  return value === undefined
    ? undefined
    : value.toFixed(10).replace(/\.?0+$/, "");
}

export class Product {
  description: string;
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

  serviceCode?: string;
  serviceDiscount?: number;
  taxRetained: boolean;
  observations?: string;

  constructor(fields: ProductFields) {
    if (!fields.description || fields.description.length === 0) {
      throw new Error("description must be a non-empty string");
    }
    if (fields.amount !== undefined && !(fields.amount > 0)) {
      throw new Error("amount must be greater than 0");
    }
    if (fields.unitPrice !== undefined && !(fields.unitPrice > 0)) {
      throw new Error("unitPrice must be greater than 0");
    }
    this.description = fields.description;
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

    this.serviceCode = fields.serviceCode;
    this.serviceDiscount = fields.serviceDiscount;
    this.taxRetained = fields.taxRetained ?? false;
    this.observations = fields.observations;
  }

  toJSON(): Record<string, unknown> {
    const product: Record<string, unknown> = {
      unit: this.unit,
      quantity: this.quantity,
    };
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
    if (Object.keys(br).length > 0) {
      product.br = br;
    }

    return {
      description: this.description,
      amount: decimalString(this.amount),
      unit_price: decimalString(this.unitPrice),
      product,
      service_code: this.serviceCode,
      discount: this.serviceDiscount,
      tax_retained: this.taxRetained,
      observations: this.observations,
    };
  }
}

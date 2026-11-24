import { Client, ClientOptions, CompanyOption } from "./client";
import { priceString } from "./br/product";
import { segment } from "./reference";
import { checked } from "./terms";

/** Goods (NF-e) or services (NFS-e). */
export type ItemKind = "product" | "service";

/** Where an item came from. Set on creation, never by an update. */
export type ItemSource = "manual" | "import" | "nuvemshop" | "invoice";

/** A catalog item, as the API returns it from every read and write. */
export interface CatalogItem {
  id: string;
  company_id: string;
  kind: ItemKind;
  description: string;
  code: string | null;
  /** A JSON number, stored with up to 10 decimal places. */
  unit_price: number | null;
  unit: string | null;
  source: ItemSource;
  external_reference: string | null;
  notes: string | null;
  /** Product only. */
  ncm: string | null;
  cfop: string | null;
  tax_situation: string | null;
  origin: string | null;
  cest: string | null;
  gtin: string | null;
  /** Service only. */
  service_code: string | null;
  iss_retained: boolean | null;
  /** Product only. One unit's weight in kg, a JSON number. */
  net_weight: number | null;
  gross_weight: number | null;
  /** The IBS/CBS CST (3 digits) and cClassTrib (6 digits) a line takes. */
  ibs_cbs_cst: string | null;
  ibs_cbs_class: string | null;
  /** Service only. */
  nbs: string | null;
  is_active: boolean;
  uses_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Narrows the item listing. Every field is optional. */
export interface ItemListQuery extends CompanyOption {
  kind?: ItemKind;
  /** Part of the description, code or externalReference; digits also match ncm and gtin. */
  search?: string;
  source?: ItemSource;
  /** The API lists active items when left out; false lists the deactivated ones. */
  isActive?: boolean;
  limit?: number;
  offset?: number;
  /** description (the default), code, unit_price, last_used_at, created_at or uses_count. */
  sortBy?: string;
  orderBy?: string;
}

/**
 * An item's fields, as create takes them. Only kind and description are
 * required; the fiscal fields belong to one kind (the other kind's are a
 * 422), and every rule on them, like the limits, is the API's.
 */
export interface ItemFields {
  kind: ItemKind;
  /** At most 120 characters for a product (xProd), 2000 for a service. */
  description: string;
  /** SKU / cProd, at most 60; unique within the company. */
  code?: string;
  /** A number or a decimal string (up to 10 places); sent as a decimal string. */
  unitPrice?: number | string;
  /** At most 6 characters (uCom); the API upper-cases it. */
  unit?: string;
  /** Another system's id, e.g. an e-commerce variant; unique within the company. */
  externalReference?: string;
  notes?: string;
  /** Used only when the item is created; an existing one keeps its source. */
  source?: ItemSource;
  /** Product: 8 digits. */
  ncm?: string;
  /** Product: 4 digits, or the last 3. */
  cfop?: string;
  /** Product: an ICMS CST (2 digits) or CSOSN (3 digits). */
  taxSituation?: string;
  /** Product: 0 to 8, needs taxSituation. */
  origin?: string;
  cest?: string;
  /** Product: 8, 12, 13 or 14 digits with a valid check digit. */
  gtin?: string;
  /** Service: LC 116, such as 1.07 or 1.03.02. */
  serviceCode?: string;
  issRetained?: boolean;
  /** Product: kg of one unit, at least 0. */
  netWeight?: number | string;
  grossWeight?: number | string;
  /** Three digits. */
  ibsCbsCst?: string;
  /** cClassTrib, six digits. */
  ibsCbsClass?: string;
  /** Service: NBS code, nine digits or dotted. */
  nbs?: string;
}

/**
 * The fields update changes. Only the keys present are sent; null clears a
 * field. source cannot be changed.
 */
export interface ItemChanges {
  kind?: ItemKind;
  description?: string;
  code?: string | null;
  /** A number or a decimal string (up to 10 places); null clears. */
  unitPrice?: number | string | null;
  unit?: string | null;
  externalReference?: string | null;
  notes?: string | null;
  ncm?: string | null;
  cfop?: string | null;
  taxSituation?: string | null;
  origin?: string | null;
  cest?: string | null;
  gtin?: string | null;
  serviceCode?: string | null;
  issRetained?: boolean | null;
  netWeight?: number | string | null;
  grossWeight?: number | string | null;
  ibsCbsCst?: string | null;
  ibsCbsClass?: string | null;
  nbs?: string | null;
  /** true brings a deactivated item back; see reactivate. */
  isActive?: boolean;
}

/** What upsert answers: the item, and whether this call created it. */
export interface ItemSaved {
  item: CatalogItem;
  /** true for a 201 (created), false for a 200 (an existing item updated). */
  created: boolean;
}

const WIRE_NAMES: Record<string, string> = {
  kind: "kind",
  description: "description",
  code: "code",
  unitPrice: "unit_price",
  unit: "unit",
  externalReference: "external_reference",
  notes: "notes",
  source: "source",
  ncm: "ncm",
  cfop: "cfop",
  taxSituation: "tax_situation",
  origin: "origin",
  cest: "cest",
  gtin: "gtin",
  serviceCode: "service_code",
  issRetained: "iss_retained",
  netWeight: "net_weight",
  grossWeight: "gross_weight",
  ibsCbsCst: "ibs_cbs_cst",
  ibsCbsClass: "ibs_cbs_class",
  nbs: "nbs",
  isActive: "is_active",
};

function wireBody(fields: object, keepNull: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const wire = WIRE_NAMES[key];
    if (!wire) {
      throw new Error(`unknown item field: ${key}`);
    }
    if (value === undefined) continue;
    if (value === null && !keepNull) continue;
    if (key === "unitPrice" && value !== null) {
      body[wire] = priceString(value as number | string);
    } else if (
      (key === "netWeight" || key === "grossWeight") &&
      value !== null
    ) {
      body[wire] = checked(key, value as number | string, 6);
    } else {
      body[wire] = value;
    }
  }
  return body;
}

/**
 * The company's catalog of products and services: what it sells, kept
 * once and named on an issue line by itemId.
 *
 * Company data, like everything on Invoice, so every call takes a
 * company over the client's own. Reading needs invoice:read; saving,
 * editing and deactivating need invoice:issue.
 */
export class Items extends Client {
  constructor(options: ClientOptions = {}) {
    super(options);
  }

  /** A page of the company's items, by description unless sortBy says otherwise. */
  async list(query: ItemListQuery = {}): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {};
    if (query.kind !== undefined) params.kind = query.kind;
    if (query.search) params.search = query.search;
    if (query.source !== undefined) params.source = query.source;
    if (query.isActive !== undefined)
      params.is_active = String(query.isActive);
    if (query.limit !== undefined) params.limit = String(query.limit);
    if (query.offset !== undefined) params.offset = String(query.offset);
    if (query.sortBy !== undefined) params.sort_by = query.sortBy;
    if (query.orderBy !== undefined) params.order_by = query.orderBy;

    return this.request("GET", "/items", {
      query: params,
      company: query.company,
    });
  }

  /** One item, deactivated or not. Another company's is a 404. */
  async get(
    itemId: string,
    options: CompanyOption = {}
  ): Promise<CatalogItem> {
    return (await this.request("GET", `/items/${segment(itemId)}`, {
      company: options.company,
    })) as unknown as CatalogItem;
  }

  /**
   * Saves an item (POST /items), and it is an upsert. It updates the company's item with the same
   * externalReference (or, when none is sent, the same code) with only
   * the fields given, and otherwise creates one, so the same call twice
   * never makes two items. The item keeps its source and isActive.
   * Answers the item alone; upsert also says whether it was created.
   */
  async create(
    fields: ItemFields,
    options: CompanyOption = {}
  ): Promise<CatalogItem> {
    return (await this.upsert(fields, options)).item;
  }

  /**
   * Like create, but answers { item, created }: created is true for a
   * 201 (a new item) and false for a 200 (an existing one, updated).
   */
  async upsert(
    fields: ItemFields,
    options: CompanyOption = {}
  ): Promise<ItemSaved> {
    const response = await this.send("POST", "/items", {
      body: wireBody(fields, false),
      company: options.company,
    });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    if (text) {
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }
    const item = (body.result as Record<string, unknown>) ?? body;
    return {
      item: item as unknown as CatalogItem,
      created: response.status === 201,
    };
  }

  /**
   * Changes only the fields given. The API checks the item as a whole,
   * so turning a product into a service while it still has an ncm is
   * refused; taking another item's code is an ItemAlreadyExistsError.
   */
  async update(
    itemId: string,
    changes: ItemChanges,
    options: CompanyOption = {}
  ): Promise<CatalogItem> {
    return (await this.request("PATCH", `/items/${segment(itemId)}`, {
      body: wireBody(changes, true),
      company: options.company,
    })) as unknown as CatalogItem;
  }

  /**
   * Deactivates an item: kept, left out of list by default, still
   * holding its code, and refused on issue until reactivate brings it
   * back.
   */
  async deactivate(
    itemId: string,
    options: CompanyOption = {}
  ): Promise<void> {
    await this.send("DELETE", `/items/${segment(itemId)}`, {
      company: options.company,
    });
  }

  /** Brings a deactivated item back, and returns it. */
  async reactivate(
    itemId: string,
    options: CompanyOption = {}
  ): Promise<CatalogItem> {
    return this.update(itemId, { isActive: true }, options);
  }
}

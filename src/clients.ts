import { Address } from "./address";
import { Client, ClientOptions, CompanyOption } from "./client";
import { segment } from "./reference";

/** Where a client came from: typed by hand, imported, or an issuance. */
export type ClientSource = "manual" | "issued" | "issuance";

/** Narrows the client listing. Every field is optional. */
export interface ClientListQuery extends CompanyOption {
  /** Part of the name, the tax id (masked or not) or the foreignId. */
  search?: string;
  source?: ClientSource;
  /** The API lists active clients when left out; false lists the deactivated ones. */
  isActive?: boolean;
  limit?: number;
  offset?: number;
  /** name (the default), last_used_at, created_at or uses_count. */
  sortBy?: string;
  orderBy?: string;
}

/**
 * A client's fields, as create takes them. taxId is required except
 * for a buyer abroad (address.state EX), who has a foreignId instead;
 * that rule, like every other one on these fields, is the API's.
 */
export interface ClientFields {
  name: string;
  /** CPF or CNPJ, numeric or alphanumeric, masked or not. */
  taxId?: string;
  /** A buyer abroad's passport or other document (idEstrangeiro). */
  foreignId?: string;
  /** IE, digits or ISENTO. */
  stateRegistration?: string;
  municipalRegistration?: string;
  email?: string;
  /** 8 to 15 digits, an optional leading +. */
  phone?: string;
  address?: Address;
  notes?: string;
}

/**
 * The fields update changes. Only the keys present are sent; null
 * clears a field, and address replaces the whole address.
 */
export interface ClientChanges {
  name?: string;
  taxId?: string | null;
  foreignId?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: Address | null;
  notes?: string | null;
  /** true brings a deactivated client back; see reactivate. */
  isActive?: boolean;
}

const WIRE_NAMES: Record<string, string> = {
  name: "name",
  taxId: "tax_id",
  foreignId: "foreign_id",
  stateRegistration: "state_registration",
  municipalRegistration: "municipal_registration",
  email: "email",
  phone: "phone",
  address: "address",
  notes: "notes",
  isActive: "is_active",
};

function wireBody(fields: object, keepNull: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const wire = WIRE_NAMES[key];
    if (!wire || value === undefined) continue;
    if (value === null && !keepNull) continue;
    body[wire] = value instanceof Address ? value.toJSON() : value;
  }
  return body;
}

/**
 * The company's saved clients: the recipients it issues to again.
 *
 * Company data, like everything on Invoice, so every call takes a
 * company over the client's own. Reading needs invoice:read; creating,
 * editing and deactivating need invoice:issue.
 */
export class Clients extends Client {
  constructor(options: ClientOptions = {}) {
    super(options);
  }

  /** A page of the company's clients, by name unless sortBy says otherwise. */
  async list(query: ClientListQuery = {}): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {};
    if (query.search) params.search = query.search;
    if (query.source !== undefined) params.source = query.source;
    if (query.isActive !== undefined)
      params.is_active = String(query.isActive);
    if (query.limit !== undefined) params.limit = String(query.limit);
    if (query.offset !== undefined) params.offset = String(query.offset);
    if (query.sortBy !== undefined) params.sort_by = query.sortBy;
    if (query.orderBy !== undefined) params.order_by = query.orderBy;

    return this.request("GET", "/clients", {
      query: params,
      company: query.company,
    });
  }

  /** One client, deactivated or not. Another company's is a 404. */
  async get(
    clientId: string,
    options: CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    return this.request("GET", `/clients/${segment(clientId)}`, {
      company: options.company,
    });
  }

  /**
   * Saves a client by hand. A taxId or foreignId the company already
   * holds is a ClientAlreadyExistsError, whose clientId names it.
   */
  async create(
    fields: ClientFields,
    options: CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    return this.request("POST", "/clients", {
      body: wireBody(fields, false),
      company: options.company,
    });
  }

  /**
   * Changes only the fields given. The API checks the client as a
   * whole, so clearing a Brazilian client's taxId is refused like a
   * create without one; taking another client's taxId is a
   * ClientAlreadyExistsError.
   */
  async update(
    clientId: string,
    changes: ClientChanges,
    options: CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    return this.request("PATCH", `/clients/${segment(clientId)}`, {
      body: wireBody(changes, true),
      company: options.company,
    });
  }

  /**
   * Deactivates a client: kept, left out of list by default, and
   * refused on issue until reactivate brings it back.
   */
  async deactivate(
    clientId: string,
    options: CompanyOption = {}
  ): Promise<void> {
    await this.send("DELETE", `/clients/${segment(clientId)}`, {
      company: options.company,
    });
  }

  /** Brings a deactivated client back, and returns it. */
  async reactivate(
    clientId: string,
    options: CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    return this.update(clientId, { isActive: true }, options);
  }
}

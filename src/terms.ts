import { decimalString } from "./br/product";
import { ValidationError } from "./errors";

export const PRESENCES = ["0", "1", "2", "3", "4", "5", "9"] as const;
export const FREIGHT_MODES = ["0", "1", "2", "3", "4", "9"] as const;

export type Presence = (typeof PRESENCES)[number];
export type FreightMode = (typeof FREIGHT_MODES)[number];

/** The marketplace or platform the sale went through (infIntermed). */
export interface Intermediary {
  /** CNPJ of the intermediary, with or without punctuation. */
  taxId: string;
  /** The seller's user name or profile id there, 2 to 60 characters. */
  identifier: string;
}

/** One transp/vol group. Weights are kg, 0 or more, at most 3 decimal places. */
export interface TransportVolume {
  quantity?: number;
  species?: string;
  brand?: string;
  numbering?: string;
  netWeight?: number | string;
  grossWeight?: number | string;
}

/** The freight mode and the volumes carried. */
export interface Transport {
  /** modFrete: 0 CIF, 1 FOB, 2 third party, 3 own transport (sender), 4 own transport (recipient), 9 none. */
  freightMode: FreightMode;
  /** Left out, the API derives one volume from the lines' weights; an empty array writes none. */
  volumes?: TransportVolume[];
}

/** The processor and authorization of an electronic payment. */
export interface PaymentCard {
  /** tpIntegra: 1 integrated (TEF, e-commerce), 2 not integrated. 1 needs taxId and authorization. */
  integration: string;
  taxId?: string;
  /** Code from the national card brand table, two digits. */
  brand?: string;
  authorization?: string;
}

/** One detPag. */
export interface Payment {
  /** tPag from the national table; 99 needs description. */
  method: string;
  /** In BRL, 0 or more, at most 2 decimal places; 0 for method 90. */
  amount: number | string;
  /** xPag, 2 to 60 characters, for method 99. */
  description?: string;
  /** Electronic payment methods only; the API checks which. */
  card?: PaymentCard;
}

/** The sale terms an NF-e can carry. */
export interface SaleTerms {
  /** indPres: how the buyer took part. */
  presence?: Presence;
  intermediary?: Intermediary;
  transport?: Transport;
  /** 1 to 100 payments. */
  payments?: Payment[];
  /** vTroco: what the payments exceed the total by, at most 2 decimal places. */
  change?: number | string;
}

const MAX_PAYMENTS = 100;

function oneOf(field: string, value: unknown, allowed: readonly string[]) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ValidationError(
      `${field} must be one of ${allowed.join(", ")}, got ${String(value)}`
    );
  }
}

function decimal(
  field: string,
  value: number | string,
  places?: number
): string {
  const limit =
    places === undefined ? "" : ` with at most ${places} decimal places`;
  const fail = () =>
    new ValidationError(`${field} must be a number of at least 0${limit}`);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw fail();
    return decimalString(value) as string;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d+(\.\d+)?$/.test(text)) throw fail();
  return text;
}

export function checked(
  field: string,
  value: number | string,
  places: number
): string {
  const out = decimal(field, value, places);
  const fraction = out.split(".")[1] ?? "";
  if (fraction.length > places) {
    throw new ValidationError(
      `${field} must be a number of at least 0 with at most ${places} decimal places`
    );
  }
  return out;
}

function volume(
  path: string,
  entry: TransportVolume
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (entry.quantity !== undefined) out.quantity = entry.quantity;
  if (entry.species !== undefined) out.species = entry.species;
  if (entry.brand !== undefined) out.brand = entry.brand;
  if (entry.numbering !== undefined) out.numbering = entry.numbering;
  if (entry.netWeight !== undefined) {
    out.net_weight = checked(`${path}.netWeight`, entry.netWeight, 3);
  }
  if (entry.grossWeight !== undefined) {
    out.gross_weight = checked(`${path}.grossWeight`, entry.grossWeight, 3);
  }
  return out;
}

function card(entry: PaymentCard): Record<string, unknown> {
  const out: Record<string, unknown> = { integration: entry.integration };
  if (entry.taxId !== undefined) out.tax_id = entry.taxId;
  if (entry.brand !== undefined) out.brand = entry.brand;
  if (entry.authorization !== undefined) {
    out.authorization = entry.authorization;
  }
  return out;
}

function payment(path: string, entry: Payment): Record<string, unknown> {
  if (typeof entry.method !== "string" || !/^\d{2}$/.test(entry.method)) {
    throw new ValidationError(`${path}.method must be two digits`);
  }
  if (entry.method === "99" && !entry.description) {
    throw new ValidationError(`${path}.description is required for method 99`);
  }
  const out: Record<string, unknown> = {
    method: entry.method,
    amount: checked(`${path}.amount`, entry.amount, 2),
  };
  if (entry.description !== undefined) out.description = entry.description;
  if (entry.card !== undefined) out.card = card(entry.card);
  return out;
}

/** The wire form of the sale terms; only what was set. */
export function termsPayload(terms: SaleTerms): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (terms.presence !== undefined) {
    oneOf("presence", terms.presence, PRESENCES);
    out.presence = terms.presence;
  }
  if (terms.intermediary !== undefined) {
    const { taxId, identifier } = terms.intermediary ?? {};
    if (!taxId) throw new ValidationError("intermediary.taxId is required");
    const length = typeof identifier === "string" ? [...identifier].length : 0;
    if (length < 2 || length > 60) {
      throw new ValidationError(
        "intermediary.identifier must be 2 to 60 characters"
      );
    }
    out.intermediary = { tax_id: taxId, identifier };
  }
  if (terms.transport !== undefined) {
    oneOf(
      "transport.freightMode",
      terms.transport?.freightMode,
      FREIGHT_MODES
    );
    const transport: Record<string, unknown> = {
      freight_mode: terms.transport.freightMode,
    };
    const volumes = terms.transport.volumes;
    if (volumes !== undefined) {
      transport.volumes = volumes.map((entry, index) =>
        volume(`transport.volumes[${index}]`, entry)
      );
    }
    out.transport = transport;
  }
  if (terms.payments !== undefined) {
    if (
      !Array.isArray(terms.payments) ||
      terms.payments.length < 1 ||
      terms.payments.length > MAX_PAYMENTS
    ) {
      throw new ValidationError(
        `payments must be an array of 1 to ${MAX_PAYMENTS} entries`
      );
    }
    out.payments = terms.payments.map((entry, index) =>
      payment(`payments[${index}]`, entry)
    );
  }
  if (terms.change !== undefined) {
    out.change = checked("change", terms.change, 2);
  }
  return out;
}

/**
 * The issuer itself: PATCH /company.
 *
 * Fixes what Invoice.readiness() reports missing. Reading stays
 * Invoice.readiness(); this client only writes. Company data, so update
 * takes company for one call over the client's own.
 */
import { Client, CompanyOption } from "./client";
import { ValidationError } from "./errors";

/**
 * The issuer address fields an API credential may fix. There is no
 * complement, and the state changes only in the dashboard: it decides
 * the authorizer.
 */
export interface CompanyAddress {
  street?: string;
  number?: string;
  neighborhood?: string;
  /** 7-digit IBGE code of a city in the company's state. */
  municipalityCode?: string;
  /**
   * Derived from municipalityCode when left out; resolved to its code
   * when sent alone; must be that city's when both are sent.
   */
  municipalityName?: string;
  /** CEP, 8 digits; a mask (01310-100) is accepted and stripped. */
  zipCode?: string;
}

/** The fiscal fields only the company owner may set. */
export interface FiscalFields {
  /** CRT: 1 Simples, 2 Simples excesso, 3 normal, 4 MEI. */
  taxRegime?: string;
  /** NFS-e opSimpNac: 1 no, 2 MEI, 3 ME/EPP. */
  simplesNacional?: string;
  /** NFS-e regApTribSN for ME/EPP: 1 to 3. */
  simplesApuracao?: string;
  /** Simples Nacional IBS/CBS assessment: 1 or 3 (3 for the NFS-e group). */
  simplesApuracaoIbsCbs?: string;
  /** Inscrição estadual (IE), or ISENTO. */
  stateRegistration?: string;
  /** Default cTribNac, e.g. 1.07 or 01.07.00. */
  serviceCode?: string;
}

/** What update changes; only what is given is sent. */
export interface CompanyUpdate {
  address?: CompanyAddress;
  fiscalFields?: FiscalFields;
}

const ADDRESS_KEYS: Record<string, string> = {
  street: "street",
  number: "number",
  neighborhood: "neighborhood",
  municipalityCode: "municipality_code",
  municipalityName: "municipality_name",
  zipCode: "zip_code",
};

const FISCAL_KEYS: Record<string, string> = {
  taxRegime: "tax_regime",
  simplesNacional: "simples_nacional",
  simplesApuracao: "simples_apuracao",
  simplesApuracaoIbsCbs: "simples_apuracao_ibs_cbs",
  stateRegistration: "state_registration",
  serviceCode: "service_code",
};

const UPDATE_KEYS = ["address", "fiscalFields"];

const ENUMS: Record<string, readonly string[]> = {
  taxRegime: ["1", "2", "3", "4"],
  simplesNacional: ["1", "2", "3"],
  simplesApuracao: ["1", "2", "3"],
  simplesApuracaoIbsCbs: ["1", "3"],
};

function companyBody(given: CompanyUpdate | null): Record<string, unknown> {
  const changes = given ?? {};
  refuseUnknown("update", changes as Record<string, unknown>, UPDATE_KEYS);
  const body: Record<string, unknown> = {};

  const address = group(
    "address",
    changes.address as Record<string, unknown>,
    ADDRESS_KEYS
  );
  if (address) {
    if (address.municipality_code !== undefined) {
      if (!/^[0-9]{7}$/.test(address.municipality_code)) {
        throw new ValidationError(
          "municipalityCode must be the 7-digit IBGE code"
        );
      }
    }
    if (address.zip_code !== undefined) {
      const digits = address.zip_code.replace(/[\s.-]/g, "");
      if (!/^[0-9]{8}$/.test(digits)) {
        throw new ValidationError("zipCode must be the 8-digit CEP");
      }
      address.zip_code = digits;
    }
    body.address = address;
  }

  const fiscal = group(
    "fiscalFields",
    changes.fiscalFields as Record<string, unknown>,
    FISCAL_KEYS
  );
  if (fiscal) {
    for (const [name, allowed] of Object.entries(ENUMS)) {
      const value = fiscal[FISCAL_KEYS[name]];
      if (value !== undefined && !allowed.includes(value)) {
        throw new ValidationError(
          `${name} must be one of ${allowed.join(", ")}`
        );
      }
    }
    body.fiscal_fields = fiscal;
  }

  return body;
}

/** One group on the wire, or undefined when nothing in it is set. */
function group(
  name: string,
  fields: Record<string, unknown> | undefined | null,
  keys: Record<string, string>
): Record<string, string> | undefined {
  if (fields === undefined || fields === null) {
    return undefined;
  }
  if (typeof fields !== "object" || Array.isArray(fields)) {
    throw new ValidationError(`${name} must be an object`);
  }
  refuseUnknown(name, fields, Object.keys(keys));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== "string") {
      throw new ValidationError(`${name}.${key} must be a string`);
    }
    out[keys[key]] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
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

/** Client for the issuer's own address and fiscal fields. */
export class Company extends Client {
  /**
   * Fixes the issuer's address and, for the owner, its fiscal fields,
   * and answers whether the company can issue now.
   *
   * The result is every readiness() field (ready, missing,
   * by_document_type, fix_url, ...) plus address (the six fields and
   * state) and fiscal_fields (where set). A call with nothing sends {}:
   * the API changes nothing and answers the company as it is.
   *
   * fiscalFields are the owner's alone: anyone else gets a 403 APIError,
   * even when the address in the same call would pass. An OAuth token
   * without company:write is an InsufficientPermissionError. A city the
   * IBGE table cannot be read for right now is a 503 with Retry-After;
   * nothing was written.
   */
  async update(
    changes: CompanyUpdate = {},
    options: CompanyOption = {}
  ): Promise<Record<string, unknown>> {
    return this.request("PATCH", "/company", {
      body: companyBody(changes),
      company: options.company,
    });
  }
}

export interface AddressFields {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  /** CEP, 8 digits. Required, except for a buyer abroad (state EX). */
  zipCode?: string;
  cityCode?: string;
  /**
   * BACEN country code, 1 to 4 digits (2496 United States, 0639
   * Argentina). Brazil (1058) when left out; required, and not 1058,
   * for a buyer abroad (state EX). Its check digit is not checked: the
   * official table has countries whose digit does not close.
   */
  countryCode?: string;
  /** The country's name, printed beside countryCode. */
  countryName?: string;
  /** ISO 3166 alpha-2 country code, NFS-e only: what a recipient abroad (state EX) takes instead of countryCode. */
  countryIso2?: string;
  /** Postal code abroad, NFS-e only, 1 to 11 characters. */
  postalCode?: string;
  /** State, province or region abroad, NFS-e only, 1 to 60 characters. */
  province?: string;
  /** Apartment, suite or block. One the document cannot carry is left out by the API with the warning RECIPIENT_COMPLEMENT_OMITTED. */
  complement?: string;
}

import { ValidationError } from "./errors";

/** The state of an NF-e buyer abroad. */
export const ABROAD_STATE = "EX";

function requireMinLength(field: string, value: string | undefined): void {
  if (value !== undefined && value !== null && value.trim().length < 2) {
    throw new ValidationError(`${field} must have at least 2 characters`);
  }
}

function requireLength(
  field: string,
  value: string | undefined,
  max: number
): void {
  if (value !== undefined && (value.length < 1 || value.length > max)) {
    throw new ValidationError(`${field} must have 1 to ${max} characters`);
  }
}

export class Address {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  cityCode?: string;
  countryCode?: string;
  countryName?: string;
  countryIso2?: string;
  postalCode?: string;
  province?: string;
  complement?: string;

  constructor(fields: AddressFields = {}) {
    requireMinLength("street", fields.street);
    requireMinLength("neighborhood", fields.neighborhood);
    if (
      fields.countryIso2 !== undefined &&
      !/^[A-Z]{2}$/.test(fields.countryIso2)
    ) {
      throw new ValidationError(
        "countryIso2 must be a two-letter ISO 3166 alpha-2 code in capitals"
      );
    }
    requireLength("postalCode", fields.postalCode, 11);
    requireLength("province", fields.province, 60);
    this.street = fields.street;
    this.number = fields.number;
    this.neighborhood = fields.neighborhood;
    this.city = fields.city;
    this.state = fields.state;
    this.zipCode = fields.zipCode;
    this.cityCode = fields.cityCode;
    this.countryCode = fields.countryCode;
    this.countryName = fields.countryName;
    this.countryIso2 = fields.countryIso2;
    this.postalCode = fields.postalCode;
    this.province = fields.province;
    this.complement = fields.complement;
  }

  toJSON(): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.street) out.street = this.street;
    if (this.number) out.number = this.number;
    if (this.neighborhood) out.neighborhood = this.neighborhood;
    if (this.city) out.city = this.city;
    if (this.state) out.state = this.state;
    if (this.zipCode) out.zip_code = this.zipCode;
    if (this.cityCode) out.city_code = this.cityCode;
    if (this.countryCode) out.country_code = this.countryCode;
    if (this.countryName) out.country_name = this.countryName;
    if (this.countryIso2) out.country_iso2 = this.countryIso2;
    if (this.postalCode) out.postal_code = this.postalCode;
    if (this.province) out.province = this.province;
    if (this.complement) out.complement = this.complement;
    return out;
  }
}

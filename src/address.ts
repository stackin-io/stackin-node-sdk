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
}

import { ValidationError } from "./errors";

/** The state of an NF-e buyer abroad. */
export const ABROAD_STATE = "EX";

function requireMinLength(field: string, value: string | undefined): void {
  if (value !== undefined && value !== null && value.trim().length < 2) {
    throw new ValidationError(`${field} must have at least 2 characters`);
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

  constructor(fields: AddressFields = {}) {
    requireMinLength("street", fields.street);
    requireMinLength("neighborhood", fields.neighborhood);
    this.street = fields.street;
    this.number = fields.number;
    this.neighborhood = fields.neighborhood;
    this.city = fields.city;
    this.state = fields.state;
    this.zipCode = fields.zipCode;
    this.cityCode = fields.cityCode;
    this.countryCode = fields.countryCode;
    this.countryName = fields.countryName;
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
    return out;
  }
}

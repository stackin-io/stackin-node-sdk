export interface AddressFields {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  cityCode?: string;
}

import { ValidationError } from "./errors";

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
    return out;
  }
}

import { describe, expect, it } from "vitest";
import { Address, ValidationError } from "../src";

describe("the street and neighborhood of an address", () => {
  it("accepts two characters or more", () => {
    const address = new Address({ street: "Rua A", neighborhood: "Centro" });

    expect(address.street).toBe("Rua A");
    expect(address.neighborhood).toBe("Centro");
  });

  it("accepts an address that leaves them out", () => {
    expect(new Address({ city: "Sao Paulo" }).toJSON()).toEqual({
      city: "Sao Paulo",
    });
  });

  it("refuses a street shorter than 2 characters once trimmed", () => {
    for (const street of ["A", " A ", "  ", ""]) {
      expect(() => new Address({ street })).toThrow(
        "street must have at least 2 characters"
      );
    }
  });

  it("refuses a neighborhood shorter than 2 characters once trimmed", () => {
    expect(() => new Address({ neighborhood: "B " })).toThrow(ValidationError);
    expect(() => new Address({ neighborhood: "B " })).toThrow(
      "neighborhood must have at least 2 characters"
    );
  });
});

describe("an address abroad", () => {
  it("sends countryCode and countryName by their wire names", () => {
    expect(
      new Address({
        city: "Buenos Aires",
        state: "EX",
        countryCode: "0639",
        countryName: "Argentina",
      }).toJSON()
    ).toEqual({
      city: "Buenos Aires",
      state: "EX",
      country_code: "0639",
      country_name: "Argentina",
    });
  });

  it("does not check the BACEN code's check digit", () => {
    expect(
      new Address({ state: "EX", countryCode: "1504" }).toJSON().country_code
    ).toBe("1504");
  });

  it("leaves both out when unset", () => {
    const data = new Address({ state: "SP", zipCode: "01000000" }).toJSON();
    expect(data).not.toHaveProperty("country_code");
    expect(data).not.toHaveProperty("country_name");
  });
});

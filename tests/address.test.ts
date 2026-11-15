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

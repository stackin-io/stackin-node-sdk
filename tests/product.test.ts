import { describe, expect, it } from "vitest";
import { ValidationError } from "../src";
import * as br from "../src/br";

describe("what a line item is worth", () => {
  it("sends the unit price when it is given", () => {
    const item = new br.Product({
      description: "Teclado",
      quantity: 2,
      unitPrice: 120.0,
      unit: "UN",
    });

    const data = item.toJSON();

    expect(data.unit_price).toBe("120");
    expect(data.amount).toBeUndefined();
  });

  it("still sends a total for the legacy line", () => {
    const item = new br.Product({
      description: "svc",
      amount: 100.0,
      quantity: 3,
    });

    const data = item.toJSON();

    expect(data.amount).toBe("100");
    expect(data.unit_price).toBeUndefined();
  });

  it("sends both when they agree", () => {
    const item = new br.Product({
      description: "Teclado",
      quantity: 2,
      unitPrice: 120.0,
      amount: 240.0,
    });

    const data = item.toJSON();

    expect(data.unit_price).toBe("120");
    expect(data.amount).toBe("240");
  });

  it("keeps the tenth place a float would print in exponent form", () => {
    const item = new br.Product({
      description: "Granel",
      quantity: 1,
      unitPrice: 0.0000000001,
    });

    expect(item.toJSON().unit_price).toBe("0.0000000001");
  });

  it("lets the API decide when a line carries neither", () => {
    const data = new br.Product({ description: "svc" }).toJSON();

    expect(data.amount).toBeUndefined();
    expect(data.unit_price).toBeUndefined();
  });

  it("refuses a unit price of zero here", () => {
    expect(() => new br.Product({ description: "svc", unitPrice: 0 })).toThrow(
      "unitPrice must be greater than 0"
    );
  });

  it("refuses an amount of zero here", () => {
    expect(() => new br.Product({ description: "svc", amount: 0 })).toThrow(
      "amount must be greater than 0"
    );
  });
});

describe("the Reforma Tributária group", () => {
  const group = {
    cst: "000",
    classification: "000001",
    rate_state: 0.1,
    rate_city: 0.0,
    rate_federal: 0.9,
  };

  it("nests under br like every other fiscal field", () => {
    const item = new br.Product({
      description: "Teclado",
      quantity: 2,
      unitPrice: 120.0,
      ncm: "84716052",
      cfop: "5102",
      ibsCbs: group,
    });

    const data = item.toJSON() as Record<
      string,
      Record<string, Record<string, Record<string, string>>>
    >;

    expect(data.product.br.ibs_cbs.cst).toBe("000");
    expect(data.product.br.ibs_cbs.classification).toBe("000001");
  });

  it("sends nothing for an item without it", () => {
    const item = new br.Product({ description: "Teclado", unitPrice: 10.0 });

    expect(
      (
        item.toJSON() as Record<
          string,
          Record<string, Record<string, Record<string, string>>>
        >
      ).product.br
    ).toBeUndefined();
  });

  it("carries an explicit base when one is given", () => {
    const item = new br.Product({
      description: "Teclado",
      unitPrice: 100.0,
      ibsCbs: { ...group, base: 100.0 },
    });

    const data = item.toJSON() as Record<
      string,
      Record<string, Record<string, Record<string, string>>>
    >;

    expect(data.product.br.ibs_cbs.base).toBe(100.0);
  });
});

describe("the GTIN check digit", () => {
  // Computed the GS1 way, independently of the SDK, so the vectors
  // below are checked rather than copied.
  const checkDigit = (body: string) => {
    const sum = [...body]
      .reverse()
      .reduce((t, d, i) => t + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
    return String((10 - (sum % 10)) % 10);
  };

  it("matches the published GS1 examples", () => {
    expect(checkDigit("400638133393")).toBe("1");
    expect(checkDigit("9638507")).toBe("4");
    expect(checkDigit("03600029145")).toBe("2");
    expect(checkDigit("789123456789")).toBe("5");
    expect(checkDigit("1789123456789")).toBe("2");
  });

  it("accepts a valid GTIN-8, -12, -13 and -14", () => {
    for (const barcode of [
      "96385074",
      "036000291452",
      "4006381333931",
      "7891234567895",
      "17891234567892",
    ]) {
      expect(new br.Product({ description: "Teclado", barcode }).barcode).toBe(
        barcode
      );
    }
  });

  it("refuses a wrong check digit on every length", () => {
    for (const barcode of [
      "96385075",
      "036000291453",
      "4006381333932",
      "7891234567890",
      "17891234567894",
    ]) {
      expect(
        () => new br.Product({ description: "Teclado", barcode })
      ).toThrow(
        new ValidationError("barcode has an invalid GTIN check digit")
      );
    }
  });

  it("skips the check for SEM GTIN", () => {
    expect(
      new br.Product({ description: "Teclado", barcode: "SEM GTIN" }).barcode
    ).toBe("SEM GTIN");
  });
});

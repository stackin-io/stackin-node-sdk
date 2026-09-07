import { describe, expect, it } from "vitest";
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

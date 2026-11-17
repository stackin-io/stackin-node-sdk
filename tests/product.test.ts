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

  it("carries the reductions when they are given", () => {
    const item = new br.Product({
      description: "Arroz",
      unitPrice: 100.0,
      ibsCbs: { ...group, cst: "200", reduction_ibs: 60, reduction_cbs: 40 },
    });

    const data = item.toJSON() as Record<
      string,
      Record<string, Record<string, Record<string, string>>>
    >;

    expect(data.product.br.ibs_cbs.reduction_ibs).toBe(60);
    expect(data.product.br.ibs_cbs.reduction_cbs).toBe(40);
  });

  it("sends no reduction when none is given", () => {
    const item = new br.Product({
      description: "Teclado",
      unitPrice: 100.0,
      ibsCbs: group,
    });

    const body = JSON.parse(JSON.stringify(item)) as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;

    expect(body.product.br.ibs_cbs).toEqual(group);
  });
});

describe("the NCM an item carries", () => {
  it("accepts the full 8-digit code", () => {
    for (const ncm of ["84713012", "84716052"]) {
      expect(new br.Product({ description: "Teclado", ncm }).ncm).toBe(ncm);
    }
  });

  it("accepts 00 for a service line", () => {
    expect(new br.Product({ description: "Frete", ncm: "00" }).ncm).toBe("00");
  });

  it("refuses any other 2-digit chapter, which SEFAZ rejects with 777", () => {
    for (const ncm of ["84", "12"]) {
      expect(() => new br.Product({ description: "Teclado", ncm })).toThrow(
        ValidationError
      );
    }
  });

  it("refuses anything that is not exactly 8 digits", () => {
    for (const ncm of ["8471301", "847130120", "8471.60.52", ""]) {
      expect(() => new br.Product({ description: "Teclado", ncm })).toThrow(
        "ncm must be the full 8 digits, or 00 for a service line"
      );
    }
  });
});

describe("the barcode an item carries", () => {
  it("accepts SEM GTIN and every GTIN length the layout allows", () => {
    for (const barcode of [
      "SEM GTIN",
      "96385074",
      "036000291452",
      "4006381333931",
      "17891234567892",
    ]) {
      expect(new br.Product({ description: "Teclado", barcode }).barcode).toBe(
        barcode
      );
    }
  });

  it("refuses what the cEAN pattern does not match", () => {
    for (const barcode of [
      "",
      "1234567",
      "123456789",
      "12345678901",
      "123456789012345",
      "sem gtin",
      "ABCDEFGH",
    ]) {
      expect(
        () => new br.Product({ description: "Teclado", barcode })
      ).toThrow(
        'barcode must be "SEM GTIN" or a GTIN of 8, 12, 13 or 14 digits'
      );
    }
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

describe("the RECOPI check digits", () => {
  it("accepts the MOC 8.5.3 worked example", () => {
    expect(
      new br.Product({
        description: "Papel",
        recopiNumber: "20131106114609734393",
      }).recopiNumber
    ).toBe("20131106114609734393");
  });

  it("gives 0 when the remainder is 0 or 1", () => {
    expect(
      new br.Product({
        description: "Papel",
        recopiNumber: "00000000000012345600",
      }).recopiNumber
    ).toBe("00000000000012345600");
  });

  it("refuses a wrong first or second check digit", () => {
    for (const recopiNumber of [
      "20131106114609734394",
      "20131106114609734383",
    ]) {
      expect(
        () => new br.Product({ description: "Papel", recopiNumber })
      ).toThrow(new ValidationError("recopiNumber has invalid check digits"));
    }
  });

  it("refuses anything that is not exactly 20 digits", () => {
    for (const recopiNumber of [
      "2013110611460973439",
      "201311061146097343930",
      "2013110611460973439A",
    ]) {
      expect(
        () => new br.Product({ description: "Papel", recopiNumber })
      ).toThrow(
        new ValidationError("recopiNumber must have exactly 20 digits")
      );
    }
  });
});

describe("the fuel group", () => {
  const diesel: br.FuelFields = {
    anpCode: "320102001",
    anpDescription: "OLEO DIESEL B S10",
    consumerState: "SP",
  };

  it("goes under product.br.fuel with snake_case keys", () => {
    const item = new br.Product({
      description: "Diesel S10",
      amount: 500,
      ncm: "27101921",
      cfop: "5656",
      fuel: {
        ...diesel,
        glpPercent: 60,
        naturalGasNationalPercent: 25,
        naturalGasImportedPercent: 15,
        startingValue: 10.5,
        codif: "123456789",
        temperatureQuantity: 1000.25,
        biodieselPercent: 14,
      },
    });

    const product = item.toJSON().product as Record<string, unknown>;
    const brFields = product.br as Record<string, unknown>;

    expect(brFields.fuel).toEqual({
      anp_code: "320102001",
      anp_description: "OLEO DIESEL B S10",
      consumer_state: "SP",
      glp_percent: 60,
      natural_gas_national_percent: 25,
      natural_gas_imported_percent: 15,
      starting_value: 10.5,
      codif: "123456789",
      temperature_quantity: 1000.25,
      biodiesel_percent: 14,
    });
  });

  it("sends only the fields that are set", () => {
    const item = new br.Product({ description: "Diesel", fuel: diesel });
    const product = item.toJSON().product as Record<string, unknown>;
    expect((product.br as Record<string, unknown>).fuel).toEqual({
      anp_code: "320102001",
      anp_description: "OLEO DIESEL B S10",
      consumer_state: "SP",
    });
  });

  it("leaves fuel out when unset", () => {
    const product = new br.Product({
      description: "Teclado",
      ncm: "84716052",
    }).toJSON().product as Record<string, unknown>;
    expect(product.br).not.toHaveProperty("fuel");
  });

  it("refuses a fuel group missing a required field", () => {
    expect(
      () =>
        new br.Product({
          description: "Diesel",
          fuel: { anpCode: "320102001" } as br.FuelFields,
        })
    ).toThrow(
      new ValidationError(
        "fuel is missing required fields: anpDescription, consumerState"
      )
    );
  });

  it("refuses fuel together with extraGroups.comb", () => {
    expect(
      () =>
        new br.Product({
          description: "Diesel",
          fuel: diesel,
          extraGroups: { comb: { cProdANP: "320102001" } },
        })
    ).toThrow(
      new ValidationError("send the fuel group once: fuel or extraGroups.comb")
    );
  });
});

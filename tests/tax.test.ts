import { describe, it, expect } from "vitest";
import {
  Tax,
  icms00,
  icms60,
  icmsSn101,
  icmsSn102,
  icmsSn900,
  ipi,
  ipiTrib,
  ipiNt,
  pisAliq,
  pisNt,
  cofinsAliq,
  cofinsOutr,
  icmsUfDest,
} from "../src/br";
import * as br from "../src/br";

describe("icms groups", () => {
  it("nests the fields under the group tag", () => {
    expect(
      icms00({
        orig: "0",
        modBC: "3",
        vBC: "100.00",
        pICMS: "18.00",
        vICMS: "18.00",
      })
    ).toEqual({
      cst: "00",
      orig: "0",
      mod_bc: "3",
      v_bc: "100.00",
      p_icms: "18.00",
      v_icms: "18.00",
    });
  });

  it("fills the CST each group is fixed to", () => {
    expect(icms60({ orig: "0" })).toEqual({ cst: "60", orig: "0" });
    expect(icmsSn900()).toEqual({ csosn: "900" });
  });

  it("lets the caller override the default CST", () => {
    expect(icms60({ orig: "0", CST: "61" })).toEqual({ cst: "61", orig: "0" });
  });

  it("drops the fields the caller left out", () => {
    expect(icmsSn102({ CSOSN: "102" })).toEqual({ csosn: "102" });
  });

  it("carries the Simples Nacional credit", () => {
    expect(
      icmsSn101({ orig: "0", pCredSN: "2.50", vCredICMSSN: "2.50" })
    ).toEqual({
      csosn: "101",
      orig: "0",
      p_cred_sn: "2.50",
      v_cred_icms_sn: "2.50",
    });
  });
});

describe("ipi", () => {
  it("puts the wrapper fields beside the variant, not inside it", () => {
    expect(
      ipi(
        { c_enq: "999" },
        ipiTrib({ CST: "50", vBC: "100.00", vIPI: "5.00" })
      )
    ).toEqual({
      c_enq: "999",
      trib: { cst: "50", v_bc: "100.00", v_ipi: "5.00" },
    });
  });

  it("carries the stamp fields the schema allows", () => {
    expect(
      ipi(
        {
          cnpj_prod: "11222333000181",
          c_selo: "001",
          q_selo: "10",
          c_enq: "999",
        },
        ipiNt({ CST: "53" })
      )
    ).toEqual({
      cnpj_prod: "11222333000181",
      c_selo: "001",
      q_selo: "10",
      c_enq: "999",
      trib: { cst: "53" },
    });
  });

  it("accepts the untaxed variant", () => {
    expect(ipi({ c_enq: "999" }, ipiNt({ CST: "53" }))).toEqual({
      c_enq: "999",
      trib: { cst: "53" },
    });
  });
});

describe("Tax", () => {
  it("emits only the groups it was given", () => {
    const tax = new Tax({
      vTotTrib: "30.00",
      icms: icms00({
        orig: "0",
        modBC: "3",
        vBC: "100.00",
        pICMS: "18.00",
        vICMS: "18.00",
      }),
      pis: pisAliq({
        CST: "01",
        vBC: "100.00",
        pPIS: "1.65",
        vPIS: "1.65",
      }),
      cofins: cofinsAliq({
        CST: "01",
        vBC: "100.00",
        pCOFINS: "7.60",
        vCOFINS: "7.60",
      }),
    });

    expect(Object.keys(tax.toJSON()).sort()).toEqual([
      "cofins",
      "icms",
      "pis",
      "v_tot_trib",
    ]);
  });

  it("is empty when nothing was given", () => {
    expect(new Tax().toJSON()).toEqual({});
  });

  it("keeps the destination-state share under its own key", () => {
    const tax = new Tax({
      icmsUfDest: icmsUfDest({
        vBCUFDest: "100.00",
        pICMSUFDest: "18.00",
        pICMSInter: "12.00",
        pICMSInterPart: "100.00",
        vICMSUFDest: "18.00",
        vICMSUFRemet: "0.00",
      }),
    });

    expect(tax.toJSON()).toEqual({
      icms_uf_dest: {
        v_bc_uf_dest: "100.00",
        p_icms_uf_dest: "18.00",
        p_icms_inter: "12.00",
        p_icms_inter_part: "100.00",
        v_icms_uf_dest: "18.00",
        v_icms_uf_remet: "0.00",
      },
    });
  });

  it("survives a round trip through the wire format", () => {
    const tax = new Tax({
      pis: pisNt({ CST: "07" }),
      cofins: cofinsOutr({ CST: "99", vCOFINS: "0.00" }),
    });

    expect(JSON.parse(JSON.stringify(tax))).toEqual({
      pis: { cst: "07" },
      cofins: { cst: "99", v_cofins: "0.00" },
    });
  });
});

describe("the groups the leiaute added later", () => {
  it("builds a monofasico group", () => {
    expect(
      br.icms02({ orig: "0", adRemICMS: "0.1234", vICMSMono: "1.23" })
    ).toEqual({
      cst: "02",
      orig: "0",
      ad_rem_icms: "0.1234",
      v_icms_mono: "1.23",
    });
  });

  it("names the destination state on a partilha", () => {
    const group = br.icmsPart({
      orig: "0",
      CST: "10",
      modBC: "3",
      vBC: "100.00",
      pICMS: "18.00",
      vICMS: "18.00",
      modBCST: "4",
      vBCST: "120.00",
      pICMSST: "18.00",
      vICMSST: "21.60",
      pBCOp: "100.0000",
      UFST: "RJ",
    }) as Record<string, string>;

    expect(group.uf_st).toBe("RJ");
    expect(group.p_bc_op).toBe("100.0000");
  });

  it("keeps the substituted taxpayer group separate from ICMS60", () => {
    expect(
      br.icmsSt({
        orig: "0",
        CST: "60",
        vBCSTRet: "100.00",
        vICMSSTRet: "18.00",
        vBCSTDest: "120.00",
        vICMSSTDest: "21.60",
      })
    ).toHaveProperty("cst", "60");
  });

  it("offers the remaining Simples variants", () => {
    expect(
      br.icmsSn201({
        orig: "0",
        modBCST: "4",
        vBCST: "120.00",
        pICMSST: "18.00",
        vICMSST: "21.60",
        pCredSN: "2.50",
        vCredICMSSN: "2.50",
      })
    ).toHaveProperty("csosn", "201");
    expect(br.icmsSn202({ orig: "0", CSOSN: "202" })).toHaveProperty(
      "csosn",
      "202"
    );
    expect(br.icmsSn500({ orig: "0" })).toHaveProperty("csosn", "500");
  });

  it("taxes PIS and COFINS by quantity", () => {
    expect(
      br.pisQtde({
        qBCProd: "10.0000",
        vAliqProd: "0.1000",
        vPIS: "1.00",
      })
    ).toEqual({
      cst: "03",
      q_bc_prod: "10.0000",
      v_aliq_prod: "0.1000",
      v_pis: "1.00",
    });
    expect(
      br.cofinsQtde({
        qBCProd: "10.0000",
        vAliqProd: "0.1000",
        vCOFINS: "1.00",
      })
    ).toHaveProperty("cst", "03");
  });

  it("puts the withheld groups under their own keys", () => {
    const tax = new br.Tax({
      pisSt: br.pisSt({ vBC: "100.00", pPIS: "1.65", vPIS: "1.65" }),
      cofinsSt: br.cofinsSt({
        vBC: "100.00",
        pCOFINS: "7.60",
        vCOFINS: "7.60",
      }),
    });

    expect(tax.toJSON()).toEqual({
      pis_st: { v_bc: "100.00", p_pis: "1.65", v_pis: "1.65" },
      cofins_st: { v_bc: "100.00", p_cofins: "7.60", v_cofins: "7.60" },
    });
  });
});

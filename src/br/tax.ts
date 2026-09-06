/** Tax module — every group in the official leiaute. */

export type TaxGroup = Record<string, unknown>;

function compact(fields: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

const SNAKE: Record<string, string> = {
  CNPJProd: "cnpj_prod",
  CSOSN: "csosn",
  CST: "cst",
  UFST: "uf_st",
  adRemICMS: "ad_rem_icms",
  adRemICMSDif: "ad_rem_icms_dif",
  adRemICMSRet: "ad_rem_icms_ret",
  adRemICMSReten: "ad_rem_icms_reten",
  cBenefRBC: "c_benef_rbc",
  cEnq: "c_enq",
  cSelo: "c_selo",
  indDeduzDeson: "ind_deduz_deson",
  indSomaCOFINSST: "ind_soma_cofins_st",
  indSomaPISST: "ind_soma_pis_st",
  modBC: "mod_bc",
  modBCST: "mod_bc_st",
  motDesICMS: "mot_des_icms",
  motDesICMSST: "mot_des_icms_st",
  motRedAdRem: "mot_red_ad_rem",
  pBCOp: "p_bc_op",
  pCOFINS: "p_cofins",
  pCredSN: "p_cred_sn",
  pDif: "p_dif",
  pFCP: "p_fcp",
  pFCPDif: "p_fcp_dif",
  pFCPST: "p_fcp_st",
  pFCPSTRet: "p_fcp_st_ret",
  pFCPUFDest: "p_fcp_uf_dest",
  pICMS: "p_icms",
  pICMSEfet: "p_icms_efet",
  pICMSInter: "p_icms_inter",
  pICMSInterPart: "p_icms_inter_part",
  pICMSST: "p_icms_st",
  pICMSUFDest: "p_icms_uf_dest",
  pIPI: "p_ipi",
  pMVAST: "p_mva_st",
  pPIS: "p_pis",
  pRedAdRem: "p_red_ad_rem",
  pRedBC: "p_red_bc",
  pRedBCEfet: "p_red_bc_efet",
  pRedBCST: "p_red_bc_st",
  pST: "p_st",
  qBCMono: "q_bc_mono",
  qBCMonoDif: "q_bc_mono_dif",
  qBCMonoRet: "q_bc_mono_ret",
  qBCMonoReten: "q_bc_mono_reten",
  qBCProd: "q_bc_prod",
  qSelo: "q_selo",
  qUnid: "q_unid",
  vAliqProd: "v_aliq_prod",
  vBC: "v_bc",
  vBCEfet: "v_bc_efet",
  vBCFCP: "v_bc_fcp",
  vBCFCPST: "v_bc_fcp_st",
  vBCFCPSTRet: "v_bc_fcp_st_ret",
  vBCFCPUFDest: "v_bc_fcp_uf_dest",
  vBCST: "v_bc_st",
  vBCSTDest: "v_bc_st_dest",
  vBCSTRet: "v_bc_st_ret",
  vBCUFDest: "v_bc_uf_dest",
  vCOFINS: "v_cofins",
  vCredICMSSN: "v_cred_icms_sn",
  vFCP: "v_fcp",
  vFCPDif: "v_fcp_dif",
  vFCPEfet: "v_fcp_efet",
  vFCPST: "v_fcp_st",
  vFCPSTRet: "v_fcp_st_ret",
  vFCPUFDest: "v_fcp_uf_dest",
  vICMS: "v_icms",
  vICMSDeson: "v_icms_deson",
  vICMSDif: "v_icms_dif",
  vICMSEfet: "v_icms_efet",
  vICMSMono: "v_icms_mono",
  vICMSMonoDif: "v_icms_mono_dif",
  vICMSMonoOp: "v_icms_mono_op",
  vICMSMonoRet: "v_icms_mono_ret",
  vICMSMonoReten: "v_icms_mono_reten",
  vICMSOp: "v_icms_op",
  vICMSST: "v_icms_st",
  vICMSSTDeson: "v_icms_st_deson",
  vICMSSTDest: "v_icms_st_dest",
  vICMSSTRet: "v_icms_st_ret",
  vICMSSubstituto: "v_icms_substituto",
  vICMSUFDest: "v_icms_uf_dest",
  vICMSUFRemet: "v_icms_uf_remet",
  vIPI: "v_ipi",
  vPIS: "v_pis",
  vUnid: "v_unid",
};

function snakeKeys(fields: object): TaxGroup {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      out[SNAKE[key] ?? key] = value;
    }
  }
  return out;
}

/** ICMS fully taxed. */
export interface Icms00Fields {
  orig: string;
  CST?: "00";
  modBC: string;
  vBC: string;
  pICMS: string;
  vICMS: string;
  pFCP?: string;
  vFCP?: string;
}

export function icms00(fields: Icms00Fields): TaxGroup {
  return snakeKeys({ CST: "00", ...fields });
}

/** ICMS monofasico, taxed by unit. */
export interface Icms02Fields {
  orig: string;
  CST?: "02";
  qBCMono?: string;
  adRemICMS: string;
  vICMSMono: string;
}

export function icms02(fields: Icms02Fields): TaxGroup {
  return snakeKeys({ CST: "02", ...fields });
}

/** ICMS taxed with substitution. */
export interface Icms10Fields {
  orig: string;
  CST?: "10";
  modBC: string;
  vBC: string;
  pICMS: string;
  vICMS: string;
  vBCFCP?: string;
  pFCP?: string;
  vFCP?: string;
  modBCST: string;
  pMVAST?: string;
  pRedBCST?: string;
  vBCST: string;
  pICMSST: string;
  vICMSST: string;
  vBCFCPST?: string;
  pFCPST?: string;
  vFCPST?: string;
  vICMSSTDeson?: string;
  motDesICMSST?: string;
}

export function icms10(fields: Icms10Fields): TaxGroup {
  return snakeKeys({ CST: "10", ...fields });
}

/** ICMS monofasico with retention. */
export interface Icms15Fields {
  orig: string;
  CST?: "15";
  qBCMono?: string;
  adRemICMS: string;
  vICMSMono: string;
  qBCMonoReten?: string;
  adRemICMSReten: string;
  vICMSMonoReten: string;
  pRedAdRem?: string;
  motRedAdRem?: string;
}

export function icms15(fields: Icms15Fields): TaxGroup {
  return snakeKeys({ CST: "15", ...fields });
}

/** ICMS with a reduced base. */
export interface Icms20Fields {
  orig: string;
  CST?: "20";
  modBC: string;
  pRedBC: string;
  vBC: string;
  pICMS: string;
  vICMS: string;
  vBCFCP?: string;
  pFCP?: string;
  vFCP?: string;
  vICMSDeson?: string;
  motDesICMS?: string;
  indDeduzDeson?: string;
}

export function icms20(fields: Icms20Fields): TaxGroup {
  return snakeKeys({ CST: "20", ...fields });
}

/** ICMS exempt with substitution. */
export interface Icms30Fields {
  orig: string;
  CST?: "30";
  modBCST: string;
  pMVAST?: string;
  pRedBCST?: string;
  vBCST: string;
  pICMSST: string;
  vICMSST: string;
  vBCFCPST?: string;
  pFCPST?: string;
  vFCPST?: string;
  vICMSDeson?: string;
  motDesICMS?: string;
  indDeduzDeson?: string;
}

export function icms30(fields: Icms30Fields): TaxGroup {
  return snakeKeys({ CST: "30", ...fields });
}

/** ICMS exempt or not taxed. */
export interface Icms40Fields {
  orig: string;
  CST: "40" | "41" | "50";
  vICMSDeson?: string;
  motDesICMS?: string;
  indDeduzDeson?: string;
}

export function icms40(fields: Icms40Fields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** ICMS deferred. */
export interface Icms51Fields {
  orig: string;
  CST?: "51";
  modBC?: string;
  pRedBC?: string;
  cBenefRBC?: string;
  vBC?: string;
  pICMS?: string;
  vICMSOp?: string;
  pDif?: string;
  vICMSDif?: string;
  vICMS?: string;
  vBCFCP?: string;
  pFCP?: string;
  vFCP?: string;
  pFCPDif?: string;
  vFCPDif?: string;
  vFCPEfet?: string;
}

export function icms51(fields: Icms51Fields): TaxGroup {
  return snakeKeys({ CST: "51", ...fields });
}

/** ICMS monofasico deferred. */
export interface Icms53Fields {
  orig: string;
  CST?: "53";
  qBCMono?: string;
  adRemICMS?: string;
  vICMSMonoOp?: string;
  pDif?: string;
  vICMSMonoDif?: string;
  vICMSMono?: string;
  qBCMonoDif?: string;
  adRemICMSDif?: string;
}

export function icms53(fields: Icms53Fields): TaxGroup {
  return snakeKeys({ CST: "53", ...fields });
}

/** ICMS already charged by an earlier substitution. */
export interface Icms60Fields {
  orig: string;
  CST?: "60";
  vBCSTRet?: string;
  pST?: string;
  vICMSSubstituto?: string;
  vICMSSTRet?: string;
  vBCFCPSTRet?: string;
  pFCPSTRet?: string;
  vFCPSTRet?: string;
  pRedBCEfet?: string;
  vBCEfet?: string;
  pICMSEfet?: string;
  vICMSEfet?: string;
}

export function icms60(fields: Icms60Fields): TaxGroup {
  return snakeKeys({ CST: "60", ...fields });
}

/** ICMS monofasico already charged earlier. */
export interface Icms61Fields {
  orig: string;
  CST?: "61";
  qBCMonoRet?: string;
  adRemICMSRet: string;
  vICMSMonoRet: string;
}

export function icms61(fields: Icms61Fields): TaxGroup {
  return snakeKeys({ CST: "61", ...fields });
}

/** ICMS with a reduced base and substitution. */
export interface Icms70Fields {
  orig: string;
  CST?: "70";
  modBC: string;
  pRedBC: string;
  vBC: string;
  pICMS: string;
  vICMS: string;
  vBCFCP?: string;
  pFCP?: string;
  vFCP?: string;
  modBCST: string;
  pMVAST?: string;
  pRedBCST?: string;
  vBCST: string;
  pICMSST: string;
  vICMSST: string;
  vBCFCPST?: string;
  pFCPST?: string;
  vFCPST?: string;
  vICMSDeson?: string;
  motDesICMS?: string;
  indDeduzDeson?: string;
  vICMSSTDeson?: string;
  motDesICMSST?: string;
}

export function icms70(fields: Icms70Fields): TaxGroup {
  return snakeKeys({ CST: "70", ...fields });
}

/** ICMS, other cases. */
export interface Icms90Fields {
  orig: string;
  CST?: "90";
  modBC?: string;
  vBC?: string;
  pRedBC?: string;
  cBenefRBC?: string;
  pICMS?: string;
  vICMSOp?: string;
  pDif?: string;
  vICMSDif?: string;
  vICMS?: string;
  vBCFCP?: string;
  pFCP?: string;
  vFCP?: string;
  pFCPDif?: string;
  vFCPDif?: string;
  vFCPEfet?: string;
  modBCST?: string;
  pMVAST?: string;
  pRedBCST?: string;
  vBCST?: string;
  pICMSST?: string;
  vICMSST?: string;
  vBCFCPST?: string;
  pFCPST?: string;
  vFCPST?: string;
  vICMSDeson?: string;
  motDesICMS?: string;
  indDeduzDeson?: string;
  vICMSSTDeson?: string;
  motDesICMSST?: string;
}

export function icms90(fields: Icms90Fields): TaxGroup {
  return snakeKeys({ CST: "90", ...fields });
}

/** ICMS split between the origin and destination states. */
export interface IcmsPartFields {
  orig: string;
  CST: "10" | "20" | "90";
  modBC: string;
  vBC: string;
  pRedBC?: string;
  pICMS: string;
  vICMS: string;
  modBCST: string;
  pMVAST?: string;
  pRedBCST?: string;
  vBCST: string;
  pICMSST: string;
  vICMSST: string;
  vBCFCPST?: string;
  pFCPST?: string;
  vFCPST?: string;
  pBCOp: string;
  UFST: string;
  vICMSDeson?: string;
  motDesICMS?: string;
  indDeduzDeson?: string;
}

export function icmsPart(fields: IcmsPartFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** ICMS charged earlier, for the substituted taxpayer. */
export interface IcmsStFields {
  orig: string;
  CST: "41" | "60";
  vBCSTRet: string;
  pST?: string;
  vICMSSubstituto?: string;
  vICMSSTRet: string;
  vBCFCPSTRet?: string;
  pFCPSTRet?: string;
  vFCPSTRet?: string;
  vBCSTDest: string;
  vICMSSTDest: string;
  pRedBCEfet?: string;
  vBCEfet?: string;
  pICMSEfet?: string;
  vICMSEfet?: string;
}

export function icmsSt(fields: IcmsStFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** Simples Nacional ICMS with a credit. */
export interface IcmsSn101Fields {
  orig: string;
  CSOSN?: "101";
  pCredSN: string;
  vCredICMSSN: string;
}

export function icmsSn101(fields: IcmsSn101Fields): TaxGroup {
  return snakeKeys({ CSOSN: "101", ...fields });
}

/** Simples Nacional ICMS without a credit. */
export interface IcmsSn102Fields {
  orig?: string;
  CSOSN: "102" | "103" | "300" | "400";
}

export function icmsSn102(fields: IcmsSn102Fields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** Simples Nacional ICMS with a credit and substitution. */
export interface IcmsSn201Fields {
  orig: string;
  CSOSN?: "201";
  modBCST: string;
  pMVAST?: string;
  pRedBCST?: string;
  vBCST: string;
  pICMSST: string;
  vICMSST: string;
  vBCFCPST?: string;
  pFCPST?: string;
  vFCPST?: string;
  pCredSN: string;
  vCredICMSSN: string;
}

export function icmsSn201(fields: IcmsSn201Fields): TaxGroup {
  return snakeKeys({ CSOSN: "201", ...fields });
}

/** Simples Nacional ICMS without a credit, with substitution. */
export interface IcmsSn202Fields {
  orig: string;
  CSOSN: "202" | "203";
  modBCST: string;
  pMVAST?: string;
  pRedBCST?: string;
  vBCST: string;
  pICMSST: string;
  vICMSST: string;
  vBCFCPST?: string;
  pFCPST?: string;
  vFCPST?: string;
}

export function icmsSn202(fields: IcmsSn202Fields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** Simples Nacional ICMS already charged by substitution. */
export interface IcmsSn500Fields {
  orig: string;
  CSOSN?: "500";
  vBCSTRet?: string;
  pST?: string;
  vICMSSubstituto?: string;
  vICMSSTRet?: string;
  vBCFCPSTRet?: string;
  pFCPSTRet?: string;
  vFCPSTRet?: string;
  pRedBCEfet?: string;
  vBCEfet?: string;
  pICMSEfet?: string;
  vICMSEfet?: string;
}

export function icmsSn500(fields: IcmsSn500Fields): TaxGroup {
  return snakeKeys({ CSOSN: "500", ...fields });
}

/** Simples Nacional ICMS, other cases. */
export interface IcmsSn900Fields {
  orig?: string;
  CSOSN?: "900";
  modBC?: string;
  vBC?: string;
  pRedBC?: string;
  pICMS?: string;
  vICMS?: string;
  modBCST?: string;
  pMVAST?: string;
  pRedBCST?: string;
  vBCST?: string;
  pICMSST?: string;
  vICMSST?: string;
  vBCFCPST?: string;
  pFCPST?: string;
  vFCPST?: string;
  pCredSN?: string;
  vCredICMSSN?: string;
}

export function icmsSn900(fields: IcmsSn900Fields = {}): TaxGroup {
  return snakeKeys({ CSOSN: "900", ...fields });
}

/** Interstate ICMS share owed to the destination state. */
export interface IcmsUfDestFields {
  vBCUFDest: string;
  vBCFCPUFDest?: string;
  pFCPUFDest?: string;
  pICMSUFDest: string;
  pICMSInter: string;
  pICMSInterPart: string;
  vFCPUFDest?: string;
  vICMSUFDest: string;
  vICMSUFRemet: string;
}

export function icmsUfDest(fields: IcmsUfDestFields): TaxGroup {
  return snakeKeys(fields);
}

/** IPI taxed by rate or by quantity. */
export interface IpiTribFields {
  CST: "00" | "49" | "50" | "99";
  vBC?: string;
  pIPI?: string;
  qUnid?: string;
  vUnid?: string;
  vIPI: string;
}

export function ipiTrib(fields: IpiTribFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** IPI not taxed. */
export interface IpiNtFields {
  CST: "01" | "02" | "03" | "04" | "05" | "51" | "52" | "53" | "54" | "55";
}

export function ipiNt(fields: IpiNtFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** This item's IPI — the wrapper fields sit beside the variant. */
export interface IpiFields {
  CNPJProd?: string;
  cSelo?: string;
  qSelo?: string;
  cEnq: string;
}

export function ipi(fields: IpiFields, trib: TaxGroup): TaxGroup {
  return { ...snakeKeys(fields), trib };
}

/** PIS taxed by rate. */
export interface PisAliqFields {
  CST: "01" | "02";
  vBC: string;
  pPIS: string;
  vPIS: string;
}

export function pisAliq(fields: PisAliqFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** PIS taxed by quantity. */
export interface PisQtdeFields {
  CST?: "03";
  qBCProd: string;
  vAliqProd: string;
  vPIS: string;
}

export function pisQtde(fields: PisQtdeFields): TaxGroup {
  return snakeKeys({ CST: "03", ...fields });
}

/** PIS not taxed. */
export interface PisNtFields {
  CST: "04" | "05" | "06" | "07" | "08" | "09";
}

export function pisNt(fields: PisNtFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** PIS taxed some other way. */
export interface PisOutrFields {
  CST:
    | "49"
    | "50"
    | "51"
    | "52"
    | "53"
    | "54"
    | "55"
    | "56"
    | "60"
    | "61"
    | "62"
    | "63"
    | "64"
    | "65"
    | "66"
    | "67"
    | "70"
    | "71"
    | "72"
    | "73"
    | "74"
    | "75"
    | "98"
    | "99";
  vBC?: string;
  pPIS?: string;
  qBCProd?: string;
  vAliqProd?: string;
  vPIS: string;
}

export function pisOutr(fields: PisOutrFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** PIS withheld by substitution. */
export interface PisStFields {
  vBC?: string;
  pPIS?: string;
  qBCProd?: string;
  vAliqProd?: string;
  vPIS: string;
  indSomaPISST?: string;
}

export function pisSt(fields: PisStFields): TaxGroup {
  return snakeKeys(fields);
}

/** COFINS taxed by rate. */
export interface CofinsAliqFields {
  CST: "01" | "02";
  vBC: string;
  pCOFINS: string;
  vCOFINS: string;
}

export function cofinsAliq(fields: CofinsAliqFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** COFINS taxed by quantity. */
export interface CofinsQtdeFields {
  CST?: "03";
  qBCProd: string;
  vAliqProd: string;
  vCOFINS: string;
}

export function cofinsQtde(fields: CofinsQtdeFields): TaxGroup {
  return snakeKeys({ CST: "03", ...fields });
}

/** COFINS not taxed. */
export interface CofinsNtFields {
  CST: "04" | "05" | "06" | "07" | "08" | "09";
}

export function cofinsNt(fields: CofinsNtFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** COFINS taxed some other way. */
export interface CofinsOutrFields {
  CST:
    | "49"
    | "50"
    | "51"
    | "52"
    | "53"
    | "54"
    | "55"
    | "56"
    | "60"
    | "61"
    | "62"
    | "63"
    | "64"
    | "65"
    | "66"
    | "67"
    | "70"
    | "71"
    | "72"
    | "73"
    | "74"
    | "75"
    | "98"
    | "99";
  vBC?: string;
  pCOFINS?: string;
  qBCProd?: string;
  vAliqProd?: string;
  vCOFINS: string;
}

export function cofinsOutr(fields: CofinsOutrFields): TaxGroup {
  return snakeKeys({ ...fields });
}

/** COFINS withheld by substitution. */
export interface CofinsStFields {
  vBC?: string;
  pCOFINS?: string;
  qBCProd?: string;
  vAliqProd?: string;
  vCOFINS: string;
  indSomaCOFINSST?: string;
}

export function cofinsSt(fields: CofinsStFields): TaxGroup {
  return snakeKeys(fields);
}

export interface TaxFields {
  vTotTrib?: string;
  icms?: TaxGroup;
  icmsUfDest?: TaxGroup;
  ipi?: TaxGroup;
  pis?: TaxGroup;
  pisSt?: TaxGroup;
  cofins?: TaxGroup;
  cofinsSt?: TaxGroup;
}

/** This item's taxes, already computed by the caller. */
export class Tax {
  vTotTrib?: string;
  icms?: TaxGroup;
  icmsUfDest?: TaxGroup;
  ipi?: TaxGroup;
  pis?: TaxGroup;
  pisSt?: TaxGroup;
  cofins?: TaxGroup;
  cofinsSt?: TaxGroup;

  constructor(fields: TaxFields = {}) {
    this.vTotTrib = fields.vTotTrib;
    this.icms = fields.icms;
    this.icmsUfDest = fields.icmsUfDest;
    this.ipi = fields.ipi;
    this.pis = fields.pis;
    this.pisSt = fields.pisSt;
    this.cofins = fields.cofins;
    this.cofinsSt = fields.cofinsSt;
  }

  toJSON(): Record<string, unknown> {
    return compact({
      v_tot_trib: this.vTotTrib,
      icms: this.icms,
      icms_uf_dest: this.icmsUfDest,
      ipi: this.ipi,
      pis: this.pis,
      pis_st: this.pisSt,
      cofins: this.cofins,
      cofins_st: this.cofinsSt,
    });
  }
}

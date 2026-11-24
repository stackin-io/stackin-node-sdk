import { ValidationError } from "./errors";

/** A date as YYYY-MM-DD. */
export type DateString = string;

/** An amount or a percentage, as a number or a plain decimal string. */
export type Decimal = number | string;

export type IssTaxation = "taxable" | "immune" | "export" | "not_levied";
export type IssRetention = "none" | "tomador" | "intermediary";

/**
 * The approximate tax burden of Lei 12.741 (DPS totTrib). One shape:
 * simplesPercent; or the federal, state and municipal percentages; or
 * the federal, state and municipal amounts.
 */
export interface ApproximateTaxes {
  /** pTotTribSN, 0 to 99.99. ME/EPP only. */
  simplesPercent?: Decimal;
  /** pTotTribFed, 0 to 100. */
  federalPercent?: Decimal;
  /** pTotTribEst, 0 to 100. */
  statePercent?: Decimal;
  /** pTotTribMun, 0 to 100. */
  municipalPercent?: Decimal;
  /** vTotTribFed, in BRL. */
  federalAmount?: Decimal;
  /** vTotTribEst, in BRL. */
  stateAmount?: Decimal;
  /** vTotTribMun, in BRL. */
  municipalAmount?: Decimal;
}

/** exigSusp: the ISSQN's exigibility suspended by a decision. */
export interface IssSuspension {
  type: "judicial" | "administrative";
  /** nProcesso, 30 digits. */
  processNumber: string;
}

/** BM: a benefit the municipality registered in the national system. */
export interface IssMunicipalBenefit {
  /** nBM, 14 digits. */
  id: string;
  /** vRedBCBM, in BRL. */
  reductionAmount?: Decimal;
  /** pRedBCBM, above 0 and up to 100. */
  reductionPercent?: Decimal;
}

/** The ISSQN of the service (DPS tribMun). */
export interface IssDetails {
  /** tribISSQN. The API defaults to taxable. */
  taxation?: IssTaxation;
  /** tpImunidade, 1 to 5, with taxation immune. */
  immunityType?: number;
  /** cPaisResult, ISO alpha-2, with taxation export. */
  resultCountryCode?: string;
  suspension?: IssSuspension;
  /** pAliq in percent, above 0 and at most 5. Refused for an MEI. */
  rate?: Decimal;
  /** tpRetISSQN. */
  retention?: IssRetention;
  municipalBenefit?: IssMunicipalBenefit;
}

/** piscofins: the PIS and COFINS of the service. */
export interface PisCofins {
  /** The PIS/COFINS CST, two digits. */
  cst: string;
  /** vBCPisCofins, in BRL. */
  base?: Decimal;
  /** pAliqPis, 0 to 99.99. */
  pisRate?: Decimal;
  /** pAliqCofins, 0 to 99.99. */
  cofinsRate?: Decimal;
  /** vPis, in BRL. */
  pisAmount?: Decimal;
  /** vCofins, in BRL. */
  cofinsAmount?: Decimal;
  /** tpRetPisCofins, 0 to 9. */
  withholdingType?: number;
}

/** The federal taxes of the service (DPS tribFed). */
export interface FederalTaxes {
  pisCofins?: PisCofins;
  /** vRetCP, in BRL. */
  socialSecurityWithheld?: Decimal;
  /** vRetIRRF, in BRL. */
  irrfWithheld?: Decimal;
  /** vRetCSLL, in BRL: the PIS, COFINS and CSLL withheld, summed. */
  socialContributionsWithheld?: Decimal;
}

/** A Brazilian address of a construction or an event. */
export interface ServiceAddress {
  /** CEP, eight digits. */
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
}

/** The DPS obra group, by CNO or CIB or by address. */
export interface Construction {
  /** inscImobFisc. */
  propertyRegistration?: string;
  /** What workId is: cno (cObra) or cib (cCIB, 8 characters). */
  workIdType?: "cno" | "cib";
  workId?: string;
  address?: ServiceAddress;
}

/** The DPS atvEvento group, by event code or address. */
export interface Event {
  name: string;
  startDate: DateString;
  endDate: DateString;
  /** idAtvEvt. */
  eventId?: string;
  address?: ServiceAddress;
}

/** The DPS infoCompl references. */
export interface References {
  /** xPed. */
  orderNumber?: string;
  /** gItemPed, up to 99 items. */
  orderItems?: string[];
  /** docRef. */
  referenceDocument?: string;
  /** idDocTec. */
  technicalDocument?: string;
}

/**
 * An address of a person: cityCode and zipCode for one in Brazil,
 * countryCode, postalCode, city and state for one abroad.
 */
export interface PersonAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  /** endNac/cMun, the IBGE code. */
  cityCode?: string;
  /** endNac/CEP. */
  zipCode?: string;
  /** endExt/cPais, ISO alpha-2, other than BR. */
  countryCode?: string;
  /** endExt/cEndPost. */
  postalCode?: string;
  /** endExt/xCidade. */
  city?: string;
  /** endExt/xEstProvReg. */
  state?: string;
}

/** fornec: who issued the deducted document. */
export interface DeductionSupplier {
  /** CPF or CNPJ of a supplier in Brazil. */
  taxId?: string;
  /** NIF of a supplier abroad. */
  foreignId?: string;
  name: string;
  address: PersonAddress;
}

/** A municipal NFS-e outside the national repository (NFSeMun). */
export interface MunicipalNfse {
  cityCode: string;
  number: string;
  verificationCode: string;
}

/** A paper service invoice (NFNFS). */
export interface PaperInvoice {
  number: string;
  model: string;
  series: string;
}

/** A fiscal document outside the national repository. */
export interface OtherFiscalDocument {
  number: string;
  cityCode?: string;
  description?: string;
}

/** A non-fiscal document. */
export interface OtherDocument {
  number: string;
  description?: string;
}

export type DeductionType =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 99 | 101 | 102 | 103 | 104 | 105 | 199;

/**
 * One document behind a deduction (docDedRed or docAjusteBC). Exactly
 * one of nfseKey, nfeKey, cteKey, municipalNfse, paperInvoice,
 * fiscalDocument and otherDocument identifies it.
 */
export interface DeductionDocument {
  /** tpDedRed or tpAjusteBC. */
  type: DeductionType;
  /** Types 99 and 199. */
  description?: string;
  nfseKey?: string;
  nfeKey?: string;
  cteKey?: string;
  municipalNfse?: MunicipalNfse;
  paperInvoice?: PaperInvoice;
  fiscalDocument?: OtherFiscalDocument;
  otherDocument?: OtherDocument;
  /** dtEmiDoc. */
  issueDate: DateString;
  /** dtCompDoc. */
  competenceDate?: DateString;
  totalAmount: Decimal;
  deductedAmount: Decimal;
  supplier?: DeductionSupplier;
}

/** The ISSQN base deduction or reduction (vDedRed or vAjusteBC). */
export interface Deductions {
  /** pDR, above 0 and up to 100. */
  percent?: Decimal;
  /** vDR, in BRL. */
  amount?: Decimal;
  /** 1 to 1000 documents. */
  documents?: DeductionDocument[];
}

/** subst: the authorized NFS-e this one replaces. */
export interface Substitution {
  /** chSubstda, the 50-character access key. */
  accessKey: string;
  /** cMotivo. */
  reasonCode: "01" | "02" | "03" | "04" | "05" | "99";
  /** xMotivo, 15 to 255 characters, required with reasonCode 99. */
  reason?: string;
}

/**
 * The DPS interm group, identified by exactly one of taxId, foreignId
 * and foreignIdMissingReason.
 */
export interface NfseIntermediary {
  taxId?: string;
  foreignId?: string;
  /** cNaoNIF: 1 exempt from a NIF, 2 not required. */
  foreignIdMissingReason?: 1 | 2;
  caepf?: string;
  municipalRegistration?: string;
  name: string;
  address?: PersonAddress;
  phone?: string;
  email?: string;
}

/** The DPS comExt group: a service traded with someone abroad. */
export interface ForeignTrade {
  /** mdPrestacao, 1 to 4. */
  serviceMode: 1 | 2 | 3 | 4;
  /** vincPrest: 0 to 6 or 9. */
  relationship: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9;
  /** tpMoeda, the BACEN currency code, 3 digits. */
  currencyCode: string;
  /** vServMoeda. */
  foreignAmount: Decimal;
  /** mecAFComexP, 1 to 8. */
  providerSupport: number;
  /** mecAFComexT, 1 to 26. */
  recipientSupport: number;
  /** movTempBens, 1 to 3. */
  temporaryGoods: 1 | 2 | 3;
  /** nDI. */
  importDeclaration?: string;
  /** nRE. */
  exportRegistration?: string;
  /** mdic. */
  shareWithMdic?: boolean;
}

/**
 * The document-level fields of an NFS-e, beyond its lines. NFS-e only.
 * Each group is checked for its own shape; which groups may travel
 * together is the API's to say.
 */
export interface NfseDetails {
  approximateTaxes?: ApproximateTaxes;
  /** dCompet. */
  competenceDate?: DateString;
  /** cLocPrestacao, the 7-digit IBGE code. */
  serviceCityCode?: string;
  /** cPaisPrestacao, ISO alpha-2, for a service performed abroad. */
  serviceCountryCode?: string;
  iss?: IssDetails;
  federal?: FederalTaxes;
  deductions?: Deductions;
  substitution?: Substitution;
  construction?: Construction;
  event?: Event;
  references?: References;
  intermediary?: NfseIntermediary;
  foreignTrade?: ForeignTrade;
}

/** tpOper and tpEnteGov of an NFS-e's IBS/CBS group. */
export interface IbsCbsGovernment {
  operation_type?: "1" | "2" | "3" | "4" | "5";
  entity_type?: "1" | "2" | "3" | "4";
}

/** The IBS/CBS dest/end address, in Brazil or abroad. */
export interface IbsCbsRecipientAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city_code?: string;
  zip_code?: string;
  country_code?: string;
  postal_code?: string;
  city?: string;
  region?: string;
}

/** dest: who receives the service when it is not the tomador. */
export interface IbsCbsRecipient {
  tax_id?: string;
  nif?: string;
  no_nif_reason?: "0" | "1" | "2";
  name: string;
  address?: IbsCbsRecipientAddress;
  phone?: string;
  email?: string;
}

/** gLocacao: a lease or rental of real estate. */
export interface RealEstateLease {
  co_ownership_percent: number;
  total_amount: number;
  unconditional_discount?: number;
  conditional_discount?: number;
  original_due_date?: DateString;
}

/** gAjusteBCLocImoveis. */
export interface RealEstateBaseAdjustment {
  type: "01" | "02" | "03" | "04" | "99";
  description?: string;
  amount: number;
}

/** A property, identified by cib or address. */
export interface RealEstateUnit {
  property_registration?: string;
  cib?: string;
  address?: {
    zip_code: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
  };
  base_adjustments?: RealEstateBaseAdjustment[];
}

/** imovel: an operation on real estate other than civil works. */
export interface RealEstate {
  city_code?: string;
  lease?: RealEstateLease;
  units?: RealEstateUnit[];
}

/** bensMoveis: a movable good the service leases. */
export interface MovableGood {
  ncm: string;
  description: string;
  quantity: number;
}

/** gTribRegular. */
export interface IbsCbsRegularTaxation {
  cst: string;
  classification: string;
}

/** gDif: the deferred share of each tax, in percent. */
export interface IbsCbsDeferral {
  state_percent: number;
  city_percent: number;
  cbs_percent: number;
}

/** The NFS-e fields of an IbsCbsFields group, in the API's own snake_case. */
export interface IbsCbsNfseFields {
  /** indFinal: personal use or consumption. */
  personal_use?: boolean;
  government?: IbsCbsGovernment;
  /** gRefNFSe: the access keys of the NFS-e referred to, 1 to 99. */
  referenced_nfse?: string[];
  recipient?: IbsCbsRecipient;
  real_estate?: RealEstate;
  /** bensMoveis, 1 to 1000. */
  movable_goods?: MovableGood[];
  regular_taxation?: IbsCbsRegularTaxation;
  deferral?: IbsCbsDeferral;
  /** cCredPres, two digits. */
  presumed_credit?: string;
}

interface StrRule {
  t: "str";
  pattern?: RegExp;
  min?: number;
  max?: number;
}
interface EnumRule {
  t: "enum";
  values: readonly (string | number)[];
}
interface IntRule {
  t: "int";
  min?: number;
  max?: number;
}
interface DecRule {
  t: "dec";
  places: number;
  gt?: number;
  ge?: number;
  max: number;
}
interface NumRule {
  t: "num";
  min: number;
  max: number;
}
interface BoolRule {
  t: "bool";
}
interface DateRule {
  t: "date";
}
interface ObjRule {
  t: "obj";
  spec: Spec;
}
interface ListRule {
  t: "list";
  item: Rule;
  min?: number;
  max?: number;
}
type Rule =
  | StrRule
  | EnumRule
  | IntRule
  | DecRule
  | NumRule
  | BoolRule
  | DateRule
  | ObjRule
  | ListRule;
interface Field {
  rule: Rule;
  req?: boolean;
}
type Spec = Record<string, Field>;

const AMOUNT_MAX = Number("999999999999999.99");
const NFSE_KEY = /^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/;
const NFE_KEY = /^[0-9]{6}[0-9A-Z]{14}[0-9]{24}$/;
const IBGE = /^\d{7}$/;
const ISO2 = /^[A-Z]{2}$/;
const PIS_COFINS_CST = [
  "00",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "49",
  "50",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "70",
  "71",
  "72",
  "73",
  "74",
  "75",
  "98",
  "99",
] as const;
const DEDUCTION_TYPES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 99, 101, 102, 103, 104, 105, 199,
] as const;

const str = (
  options: { pattern?: RegExp; min?: number; max?: number } = {},
  req = false
): Field => ({ rule: { t: "str", ...options }, req });
const text = (max: number, req = false): Field => str({ min: 1, max }, req);
const oneOf = (values: readonly (string | number)[], req = false): Field => ({
  rule: { t: "enum", values },
  req,
});
const int = (min: number, max: number, req = false): Field => ({
  rule: { t: "int", min, max },
  req,
});
const dec = (
  options: { places?: number; gt?: number; ge?: number; max: number },
  req = false
): Field => ({
  rule: { t: "dec", places: options.places ?? 2, ...options },
  req,
});
const percent = (max = 100): Field => dec({ ge: 0, max });
const amount = (): Field => dec({ ge: 0, max: AMOUNT_MAX });
const retention = (): Field => dec({ gt: 0, max: AMOUNT_MAX });
const num = (min: number, max: number, req = false): Field => ({
  rule: { t: "num", min, max },
  req,
});
const bool: Field = { rule: { t: "bool" } };
const date = (req = false): Field => ({ rule: { t: "date" }, req });
const obj = (spec: Spec, req = false): Field => ({
  rule: { t: "obj", spec },
  req,
});
const list = (
  item: Field,
  options: { min?: number; max?: number } = {}
): Field => ({ rule: { t: "list", item: item.rule, ...options } });

const SERVICE_ADDRESS: Spec = {
  zipCode: str({ pattern: /^\d{8}$/ }, true),
  street: text(255, true),
  number: text(60, true),
  complement: text(156),
  neighborhood: text(60, true),
};

const PERSON_ADDRESS: Spec = {
  street: text(255, true),
  number: text(60, true),
  complement: text(156),
  neighborhood: text(60, true),
  cityCode: str({ pattern: IBGE }),
  zipCode: str({ pattern: /^\d{8}$/ }),
  countryCode: str({ pattern: ISO2 }),
  postalCode: text(11),
  city: text(60),
  state: text(60),
};

const DEDUCTION_DOCUMENT: Spec = {
  type: oneOf(DEDUCTION_TYPES, true),
  description: text(150),
  nfseKey: str({ pattern: NFSE_KEY }),
  nfeKey: str({ pattern: NFE_KEY }),
  cteKey: str({ pattern: NFE_KEY }),
  municipalNfse: obj({
    cityCode: str({ pattern: IBGE }, true),
    number: str({ pattern: /^\d{1,15}$/ }, true),
    verificationCode: str({ pattern: /^[A-Za-z0-9]{1,9}$/ }, true),
  }),
  paperInvoice: obj({
    number: str({ pattern: /^\d{1,7}$/ }, true),
    model: str({ pattern: /^\d{1,15}$/ }, true),
    series: str({ pattern: /^[A-Za-z0-9]{1,15}$/ }, true),
  }),
  fiscalDocument: obj({
    number: text(255, true),
    cityCode: str({ pattern: IBGE }),
    description: text(255),
  }),
  otherDocument: obj({ number: text(255, true), description: text(255) }),
  issueDate: date(true),
  competenceDate: date(),
  totalAmount: dec({ gt: 0, max: AMOUNT_MAX }, true),
  deductedAmount: dec({ gt: 0, max: AMOUNT_MAX }, true),
  supplier: obj({
    taxId: str(),
    foreignId: text(40),
    name: text(150, true),
    address: obj(PERSON_ADDRESS, true),
  }),
};

const NFSE_SPEC: Spec = {
  approximateTaxes: obj({
    simplesPercent: percent(99.99),
    federalPercent: percent(),
    statePercent: percent(),
    municipalPercent: percent(),
    federalAmount: amount(),
    stateAmount: amount(),
    municipalAmount: amount(),
  }),
  competenceDate: date(),
  serviceCityCode: str({ pattern: IBGE }),
  serviceCountryCode: str({ pattern: ISO2 }),
  iss: obj({
    taxation: oneOf(["taxable", "immune", "export", "not_levied"]),
    immunityType: int(1, 5),
    resultCountryCode: str({ pattern: ISO2 }),
    suspension: obj({
      type: oneOf(["judicial", "administrative"], true),
      processNumber: str({ pattern: /^[0-9]{30}$/ }, true),
    }),
    rate: dec({ gt: 0, max: 5 }),
    retention: oneOf(["none", "tomador", "intermediary"]),
    municipalBenefit: obj({
      id: str({ pattern: /^[0-9]{14}$/ }, true),
      reductionAmount: amount(),
      reductionPercent: dec({ gt: 0, max: 100 }),
    }),
  }),
  federal: obj({
    pisCofins: obj({
      cst: oneOf(PIS_COFINS_CST, true),
      base: amount(),
      pisRate: percent(99.99),
      cofinsRate: percent(99.99),
      pisAmount: amount(),
      cofinsAmount: amount(),
      withholdingType: int(0, 9),
    }),
    socialSecurityWithheld: retention(),
    irrfWithheld: retention(),
    socialContributionsWithheld: retention(),
  }),
  deductions: obj({
    percent: dec({ gt: 0, max: 100 }),
    amount: dec({ gt: 0, max: AMOUNT_MAX }),
    documents: list(obj(DEDUCTION_DOCUMENT), { min: 1, max: 1000 }),
  }),
  substitution: obj({
    accessKey: str({ pattern: NFSE_KEY }, true),
    reasonCode: oneOf(["01", "02", "03", "04", "05", "99"], true),
    reason: str({ min: 15, max: 255 }),
  }),
  construction: obj({
    propertyRegistration: text(30),
    workIdType: oneOf(["cno", "cib"]),
    workId: text(30),
    address: obj(SERVICE_ADDRESS),
  }),
  event: obj({
    name: text(255, true),
    startDate: date(true),
    endDate: date(true),
    eventId: text(30),
    address: obj(SERVICE_ADDRESS),
  }),
  references: obj({
    orderNumber: text(60),
    orderItems: list(text(60), { min: 1, max: 99 }),
    referenceDocument: text(255),
    technicalDocument: text(40),
  }),
  intermediary: obj({
    taxId: str(),
    foreignId: text(40),
    foreignIdMissingReason: oneOf([1, 2]),
    caepf: str({ pattern: /^\d{14}$/ }),
    municipalRegistration: str({ pattern: /^[A-Za-z0-9]{1,15}$/ }),
    name: text(300, true),
    address: obj(PERSON_ADDRESS),
    phone: str(),
    email: str(),
  }),
  foreignTrade: obj({
    serviceMode: oneOf([1, 2, 3, 4], true),
    relationship: oneOf([0, 1, 2, 3, 4, 5, 6, 9], true),
    currencyCode: str({ pattern: /^\d{3}$/ }, true),
    foreignAmount: dec({ gt: 0, max: AMOUNT_MAX }, true),
    providerSupport: int(1, 8, true),
    recipientSupport: int(1, 26, true),
    temporaryGoods: oneOf([1, 2, 3], true),
    importDeclaration: text(12),
    exportRegistration: text(12),
    shareWithMdic: bool,
  }),
};

const IBS_CBS_SPEC: Spec = {
  personal_use: bool,
  government: obj({
    operation_type: oneOf(["1", "2", "3", "4", "5"]),
    entity_type: oneOf(["1", "2", "3", "4"]),
  }),
  referenced_nfse: list(str({ pattern: NFSE_KEY }), { min: 1, max: 99 }),
  recipient: obj({
    tax_id: str({ pattern: /^\d{11}$|^[0-9A-Z]{12}\d{2}$/ }),
    nif: text(40),
    no_nif_reason: oneOf(["0", "1", "2"]),
    name: text(150, true),
    address: obj({
      street: text(255, true),
      number: text(60, true),
      complement: text(156),
      neighborhood: text(60, true),
      city_code: str({ pattern: IBGE }),
      zip_code: str({ pattern: /^\d{8}$/ }),
      country_code: str({ pattern: ISO2 }),
      postal_code: text(11),
      city: text(60),
      region: text(60),
    }),
    phone: str({ pattern: /^\d{6,20}$/ }),
    email: str({ max: 80, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ }),
  }),
  real_estate: obj({
    city_code: str({ pattern: IBGE }),
    lease: obj({
      co_ownership_percent: num(0, 100, true),
      total_amount: num(0, AMOUNT_MAX, true),
      unconditional_discount: num(0, AMOUNT_MAX),
      conditional_discount: num(0, AMOUNT_MAX),
      original_due_date: date(),
    }),
    units: list(
      obj({
        property_registration: text(30),
        cib: str({ pattern: /^[0-9A-Z]{8}$/ }),
        address: obj({
          zip_code: str({ pattern: /^\d{8}$/ }, true),
          street: text(255, true),
          number: text(60, true),
          complement: text(156),
          neighborhood: text(60, true),
        }),
        base_adjustments: list(
          obj({
            type: oneOf(["01", "02", "03", "04", "99"], true),
            description: text(150),
            amount: num(0, AMOUNT_MAX, true),
          }),
          { min: 1, max: 1000 }
        ),
      }),
      { min: 1, max: 99 }
    ),
  }),
  movable_goods: list(
    obj({
      ncm: str({ pattern: /^\d{8}$/ }, true),
      description: text(150, true),
      quantity: int(1, 999, true),
    }),
    { min: 1, max: 1000 }
  ),
  regular_taxation: obj({
    cst: str({ pattern: /^\d{3}$/ }, true),
    classification: str({ pattern: /^\d{6}$/ }, true),
  }),
  deferral: obj({
    state_percent: num(0, 100, true),
    city_percent: num(0, 100, true),
    cbs_percent: num(0, 100, true),
  }),
  presumed_credit: str({ pattern: /^\d{2}$/ }),
};

export const IBS_CBS_NFSE_KEYS = Object.keys(IBS_CBS_SPEC);

function plainDecimal(value: number): string {
  return value.toFixed(10).replace(/\.?0+$/, "");
}

function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function fail(path: string, message: string): never {
  throw new ValidationError(`${path} ${message}`);
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimalValue(path: string, value: unknown, rule: DecRule): string {
  let out: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "must be a finite number");
    out = plainDecimal(value);
  } else if (typeof value === "string") {
    out = value.trim();
    if (!/^-?\d+(\.\d+)?$/.test(out)) {
      fail(path, "must be a number or a plain decimal string");
    }
  } else {
    return fail(path, "must be a number or a plain decimal string");
  }
  const number = Number(out);
  if (rule.gt !== undefined && !(number > rule.gt)) {
    fail(path, `must be above ${rule.gt}`);
  }
  if (rule.ge !== undefined && !(number >= rule.ge)) {
    fail(path, `must be ${rule.ge} or more`);
  }
  if (number > rule.max) fail(path, `must be at most ${rule.max}`);
  const fraction = (out.split(".")[1] ?? "").replace(/0+$/, "");
  if (fraction.length > rule.places) {
    fail(path, `takes at most ${rule.places} decimal places`);
  }
  return out;
}

function checkValue(path: string, value: unknown, rule: Rule): unknown {
  switch (rule.t) {
    case "str": {
      if (typeof value !== "string") fail(path, "must be a string");
      const length = [...value].length;
      if (rule.min !== undefined && length < rule.min) {
        fail(path, `must have at least ${rule.min} characters`);
      }
      if (rule.max !== undefined && length > rule.max) {
        fail(path, `must have at most ${rule.max} characters`);
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        fail(path, `does not match ${rule.pattern}`);
      }
      return value;
    }
    case "enum":
      if (!rule.values.includes(value as string | number)) {
        fail(path, `must be one of ${rule.values.join(", ")}`);
      }
      return value;
    case "int":
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        (rule.min !== undefined && value < rule.min) ||
        (rule.max !== undefined && value > rule.max)
      ) {
        fail(path, `must be an integer from ${rule.min} to ${rule.max}`);
      }
      return value;
    case "dec":
      return decimalValue(path, value, rule);
    case "num":
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < rule.min ||
        value > rule.max
      ) {
        fail(path, `must be a number from ${rule.min} to ${rule.max}`);
      }
      return value;
    case "bool":
      if (typeof value !== "boolean") fail(path, "must be a boolean");
      return value;
    case "date": {
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
      ) {
        fail(path, "must be a date as YYYY-MM-DD");
      }
      return value;
    }
    case "obj":
      return checkObject(path, value, rule.spec);
    case "list": {
      if (!Array.isArray(value)) fail(path, "must be an array");
      if (
        (rule.min !== undefined && value.length < rule.min) ||
        (rule.max !== undefined && value.length > rule.max)
      ) {
        fail(path, `must hold ${rule.min} to ${rule.max} entries`);
      }
      return value.map((entry, index) =>
        checkValue(`${path}[${index}]`, entry, rule.item)
      );
    }
  }
}

function checkObject(
  path: string,
  value: unknown,
  spec: Spec
): Record<string, unknown> {
  if (!isPlain(value)) fail(path, "must be an object");
  for (const key of Object.keys(value)) {
    if (!(key in spec)) {
      fail(
        `${path}.${key}`,
        `is not a field; known: ${Object.keys(spec).join(", ")}`
      );
    }
  }
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(spec)) {
    const given = value[key];
    if (given === undefined || given === null) {
      if (field.req) fail(`${path}.${key}`, "is required");
      continue;
    }
    out[snakeKey(key)] = checkValue(`${path}.${key}`, given, field.rule);
  }
  return out;
}

/** The wire form of the nfse object: snake_case, decimals as strings. */
export function nfseDetailsPayload(
  details: NfseDetails
): Record<string, unknown> {
  return checkObject("nfse", details, NFSE_SPEC);
}

/** The NFS-e fields of an ibsCbs group, checked and in wire form. */
export function ibsCbsNfsePayload(
  group: Record<string, unknown>
): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const key of IBS_CBS_NFSE_KEYS) {
    if (group[key] !== undefined) extras[key] = group[key];
  }
  return checkObject("ibsCbs", extras, IBS_CBS_SPEC);
}

const CONDITIONAL_DISCOUNT: DecRule = {
  t: "dec",
  places: 2,
  gt: 0,
  max: AMOUNT_MAX,
};

/** A line's conditional discount for the wire: above 0, at most 2 places. */
export function conditionalDiscountValue(value: Decimal): string {
  return decimalValue("conditionalDiscount", value, CONDITIONAL_DISCOUNT);
}

import { Client, ClientOptions, CompanyOption } from "./client";
import { ValidationError } from "./errors";
import {
  IbsCbsCalculation,
  IbsCbsCalculationRequest,
  ibsCbsBody,
} from "./ibs-cbs";
import { segment } from "./segment";
import type { NbsSuggestions } from "./types";

export { segment };

/**
 * The classifications with a named accessor on FiscalReference.
 *
 * Not the whole truth and not meant to be: ask kinds() for what the API
 * actually has, because a classification published after this release
 * is reachable through kind() with no release at all.
 */
export const KINDS = [
  "cfop",
  "ncm",
  "cest",
  "cst",
  "csosn",
  "iss_service",
  "icms_fuel",
  "ibs_cbs_class",
] as const;

/**
 * Narrows a classification listing.
 *
 * There is no sortBy or orderBy: the route accepts both and discards
 * them, so rows always come back ordered by kind then code. history()
 * on Invoice does honour them, which is why the difference is spelled
 * out here rather than left to be discovered.
 */
export interface SearchQuery {
  term?: string;
  country?: string;
  limit?: number;
  offset?: number;
}

function searchParams(
  kind: string | null,
  fallback: string,
  query: SearchQuery
): Record<string, string> {
  const params: Record<string, string> = {
    country: query.country ?? fallback,
  };
  if (kind) params.kind = kind;
  if (query.term) params.search = query.term;
  if (query.limit !== undefined) params.limit = String(query.limit);
  if (query.offset !== undefined) params.offset = String(query.offset);
  return params;
}

type Call = (
  path: string,
  query: Record<string, string>
) => Promise<Record<string, unknown>>;

/** One classification, bound to a country. */
export class Kind {
  constructor(
    private readonly call: Call,
    readonly name: string,
    readonly country: string
  ) {}

  /**
   * One code. A code that does not exist is a 404, which arrives as an
   * APIError — there is no separate not-found type.
   */
  async get(code: string, country?: string): Promise<Record<string, unknown>> {
    return this.call(
      `/fiscal-references/${segment(this.name)}/${segment(code)}`,
      { country: country ?? this.country }
    );
  }

  /**
   * A page of this classification, filtered by the query's term when it
   * has one. An empty term is no term: the route rejects search="" with
   * a 422, and sending it would invent a failure the caller cannot read.
   */
  async search(query: SearchQuery = {}): Promise<Record<string, unknown>> {
    return this.call(
      "/fiscal-references",
      searchParams(this.name, this.country, query)
    );
  }
}

/**
 * Reads the published classification tables. Nothing here is the
 * company's own data and nothing here is writable.
 */
export class FiscalReference extends Client {
  readonly cfop: Kind;
  readonly ncm: Kind;
  readonly cest: Kind;
  readonly cst: Kind;
  readonly csosn: Kind;
  readonly issService: Kind;
  readonly icmsFuel: Kind;
  readonly ibsCbsClass: Kind;

  constructor(options: ClientOptions = {}) {
    super(options);

    this.cfop = this.kind("cfop");
    this.ncm = this.kind("ncm");
    this.cest = this.kind("cest");
    this.cst = this.kind("cst");
    this.csosn = this.kind("csosn");
    this.issService = this.kind("iss_service");
    this.icmsFuel = this.kind("icms_fuel");
    this.ibsCbsClass = this.kind("ibs_cbs_class");
  }

  /**
   * Which classifications this country has rows for. The only honest
   * answer to "what else is there" — a hard-coded list goes stale the
   * next time the ETL grows one.
   */
  async kinds(country?: string): Promise<string[]> {
    const response = await this.send("GET", "/fiscal-references/kinds", {
      query: { country: country ?? this.country },
    });

    const text = await response.text();
    if (!text) return [];

    const body: unknown = JSON.parse(text);
    if (!Array.isArray(body)) {
      throw new Error("unexpected response shape: expected a list");
    }
    return body as string[];
  }

  /** Any classification by name, including one with no accessor. */
  kind(name: string, country?: string): Kind {
    return new Kind(
      (path, query) => this.request("GET", path, { query }),
      name,
      country ?? this.country
    );
  }

  /**
   * Municipalities whose name starts with name, with their code.
   *
   * Each row is {country, code, name, state}; for Brazil code is the
   * 7-digit IBGE code an address's cityCode takes. Issuing resolves it
   * from city and state by itself, so this is for the name that matches
   * more than one. state narrows to one UF; the API answers at most 20
   * rows.
   */
  async cities(
    name: string,
    options: { state?: string; country?: string } = {}
  ): Promise<Array<Record<string, unknown>>> {
    const length = [...(name ?? "")].length;
    if (length < 2 || length > 100) {
      throw new ValidationError("name must be 2 to 100 characters");
    }
    if (options.state !== undefined && options.state.length !== 2) {
      throw new ValidationError("state must be a two-letter code");
    }

    const query: Record<string, string> = {
      name,
      country: options.country ?? this.country,
    };
    if (options.state !== undefined) query.state = options.state.toUpperCase();

    return this.requestList("GET", "/cities", { query });
  }

  /**
   * The NBS codes NFS-e Anexo VIII pairs with a service code.
   *
   * serviceCode is the LC 116 item.subitem as an issue line takes it:
   * 1.07, 1.03.02 or 010302; only its subitem decides the answer. Each
   * suggestion carries the NBS, its description and the
   * operation_indicator and ibs_cbs_classification Anexo VIII lists for
   * it. Suggestions only: nothing is applied unless the caller sends
   * it. A malformed code is a 422 APIError.
   */
  async nbsSuggestions(serviceCode: string): Promise<NbsSuggestions> {
    if (
      typeof serviceCode !== "string" ||
      serviceCode.length < 1 ||
      serviceCode.length > 12
    ) {
      throw new ValidationError("serviceCode must be 1 to 12 characters");
    }
    const result = await this.request(
      "GET",
      `/service-codes/${segment(serviceCode)}/nbs`
    );
    return result as unknown as NbsSuggestions;
  }

  /**
   * Simulates the IBS/CBS group an NF-e would carry for these items.
   *
   * Nothing is issued, stored or sent to a tax authority. Only fields
   * that are set go out. An item's own rate wins over rates; with no
   * rates at all, 2026 uses the official ones and any other year is a
   * 422 APIError (IBS_CBS_RATES_REQUIRED). documentType only picks the
   * model the classification is checked for: the amounts are always the
   * NF-e's, and an NFS-e's are computed by the Sefin Nacional. Needs the
   * invoice:read scope and no company.
   */
  async calculateIbsCbs(
    request: IbsCbsCalculationRequest,
    options: CompanyOption = {}
  ): Promise<IbsCbsCalculation> {
    const result = await this.request("POST", "/ibs-cbs/calculate", {
      body: ibsCbsBody(request),
      company: options.company,
    });
    return result as unknown as IbsCbsCalculation;
  }

  /**
   * Every classification at once, which no accessor can express. The
   * most expensive call the endpoint accepts: the whole country's
   * tables, not one of them.
   */
  async search(query: SearchQuery = {}): Promise<Record<string, unknown>> {
    return this.request("GET", "/fiscal-references", {
      query: searchParams(null, this.country, query),
    });
  }
}

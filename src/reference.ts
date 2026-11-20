import { Client, ClientOptions } from "./client";
import { ValidationError } from "./errors";
import { segment } from "./segment";

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

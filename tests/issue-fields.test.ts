import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Dispatcher,
  getGlobalDispatcher,
  MockAgent,
  setGlobalDispatcher,
} from "undici";

import {
  Address,
  DEFAULT_BASE_URL,
  Direction,
  DocumentType,
  Invoice,
  IssueRequest,
  Purpose,
  ValidationError,
  br,
} from "../src";

let agent: MockAgent;
let originalDispatcher: Dispatcher;

beforeEach(() => {
  delete process.env.STACKIN_BASE_URL;
  delete process.env.STACKIN_API_KEY;
  originalDispatcher = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  await agent.close();
  setGlobalDispatcher(originalDispatcher);
});

const captureBody = () => {
  const seen: { body?: string } = {};
  agent
    .get(DEFAULT_BASE_URL)
    .intercept({ path: "/api/v1/invoices", method: "POST" })
    .reply(200, (req) => {
      seen.body = req.body as string;
      return { result: {} };
    });
  return seen;
};

const sent = (seen: { body?: string }) =>
  JSON.parse(seen.body ?? "{}") as Record<string, unknown>;

const domestic = new Address({
  street: "Rua A",
  number: "1",
  neighborhood: "Centro",
  city: "Sao Paulo",
  state: "SP",
  zipCode: "01000000",
});

const abroad = new Address({
  street: "5th Avenue",
  number: "350",
  neighborhood: "Midtown",
  city: "New York",
  state: "EX",
  countryCode: "2496",
  countryName: "Estados Unidos",
});

const nfeItem = (fields: Partial<br.ProductFields> = {}) =>
  new br.Product({
    description: "Teclado",
    amount: 100,
    ncm: "84716052",
    cfop: "5102",
    ...fields,
  });

const nfe = (fields: Partial<IssueRequest> = {}): IssueRequest => ({
  documentType: DocumentType.NFE,
  clientName: "Buyer Ltda",
  taxId: "11111111111111",
  items: [nfeItem()],
  recipientAddress: domestic,
  ...fields,
});

const issue = (request: IssueRequest) =>
  new Invoice({ apiKey: "k" }).issue(request);

const KEY = "35260611111111111111550010000000011000000014";

describe("issue() leaves every new field out when unset", () => {
  it("sends the same body as before", async () => {
    const seen = captureBody();
    await issue(nfe());
    expect(Object.keys(sent(seen))).toEqual([
      "document_type",
      "client_name",
      "tax_id",
      "items",
      "recipient_address",
    ]);
  });
});

describe("issue() discount", () => {
  it("sends it as a decimal string", async () => {
    const seen = captureBody();
    await issue(nfe({ discount: 12.5 }));
    expect(sent(seen).discount).toBe("12.5");
  });

  it("sends a zero discount", async () => {
    const seen = captureBody();
    await issue(nfe({ discount: 0 }));
    expect(sent(seen).discount).toBe("0");
  });

  it("refuses a negative discount before the request", async () => {
    await expect(issue(nfe({ discount: -1 }))).rejects.toThrow(
      new ValidationError("discount must be a number of at least 0")
    );
  });
});

describe("issue() issuedAt", () => {
  it("sends a string with an offset as given", async () => {
    const seen = captureBody();
    await issue(nfe({ issuedAt: "2026-11-15T10:30:00-03:00" }));
    expect(sent(seen).issued_at).toBe("2026-11-15T10:30:00-03:00");
  });

  it("sends a Date as its UTC instant", async () => {
    const seen = captureBody();
    await issue(nfe({ issuedAt: new Date("2026-11-15T13:30:00Z") }));
    expect(sent(seen).issued_at).toBe("2026-11-15T13:30:00.000Z");
  });

  it("refuses a string without an offset before the request", async () => {
    await expect(
      issue(nfe({ issuedAt: "2026-11-15T10:30:00" }))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an invalid Date", async () => {
    await expect(
      issue(nfe({ issuedAt: new Date("not a date") }))
    ).rejects.toThrow(new ValidationError("issuedAt is not a valid date"));
  });
});

describe("issue() purpose, direction and referencedKeys", () => {
  it("sends them by their wire names", async () => {
    const seen = captureBody();
    await issue(
      nfe({
        purpose: Purpose.RETURN,
        direction: Direction.IN,
        referencedKeys: [KEY],
      })
    );
    const body = sent(seen);
    expect(body.purpose).toBe("return");
    expect(body.direction).toBe("in");
    expect(body.referenced_keys).toEqual([KEY]);
    expect(body).not.toHaveProperty("referencedKeys");
  });

  it("refuses a purpose outside the enum", async () => {
    await expect(
      issue(nfe({ purpose: "refund" as unknown as Purpose }))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a direction outside the enum", async () => {
    await expect(
      issue(nfe({ direction: "sideways" as unknown as Direction }))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses referencedKeys that are not strings", async () => {
    await expect(
      issue(nfe({ referencedKeys: [123 as unknown as string] }))
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("issue() to a buyer abroad", () => {
  it("sends foreignId, export and the country without a taxId", async () => {
    const seen = captureBody();
    await issue(
      nfe({
        taxId: undefined,
        recipientAddress: abroad,
        foreignId: "P1234567",
        export: {
          exitState: "SP",
          place: "Porto de Santos",
          dispatchPlace: "Alfandega de Santos",
        },
      })
    );
    const body = sent(seen);
    expect(body).not.toHaveProperty("tax_id");
    expect(body.foreign_id).toBe("P1234567");
    expect(body.export).toEqual({
      exit_state: "SP",
      place: "Porto de Santos",
      dispatch_place: "Alfandega de Santos",
    });
    expect(body.recipient_address).toEqual({
      street: "5th Avenue",
      number: "350",
      neighborhood: "Midtown",
      city: "New York",
      state: "EX",
      country_code: "2496",
      country_name: "Estados Unidos",
    });
  });

  it("leaves dispatch_place out when unset", async () => {
    const seen = captureBody();
    await issue(
      nfe({
        taxId: undefined,
        recipientAddress: abroad,
        export: { exitState: "PR", place: "Foz do Iguacu" },
      })
    );
    expect(sent(seen).export).toEqual({
      exit_state: "PR",
      place: "Foz do Iguacu",
    });
  });

  it("refuses an export without place", async () => {
    await expect(
      issue(
        nfe({
          taxId: undefined,
          recipientAddress: abroad,
          export: { exitState: "SP" } as unknown as {
            exitState: string;
            place: string;
          },
        })
      )
    ).rejects.toThrow(new ValidationError("export needs exitState and place"));
  });

  it("still needs countryCode on an address abroad", async () => {
    const noCountry = new Address({ ...abroad, countryCode: undefined });
    await expect(
      issue(nfe({ taxId: undefined, recipientAddress: noCountry }))
    ).rejects.toThrow(
      new ValidationError(
        "recipientAddress is missing required fields for NFE: countryCode"
      )
    );
  });

  it("still needs zipCode on an address in Brazil", async () => {
    const noZip = new Address({ ...domestic, zipCode: undefined });
    await expect(issue(nfe({ recipientAddress: noZip }))).rejects.toThrow(
      new ValidationError(
        "recipientAddress is missing required fields for NFE: zipCode"
      )
    );
  });

  it("still needs taxId for a buyer in Brazil", async () => {
    await expect(issue(nfe({ taxId: undefined }))).rejects.toThrow(
      new ValidationError(
        "taxId is required, except on an NF-e to a buyer abroad (recipientAddress.state EX)"
      )
    );
  });

  it("still needs taxId on an NFS-e", async () => {
    await expect(
      issue({
        documentType: DocumentType.NFSE,
        clientName: "Buyer",
        items: [new br.Product({ description: "Servico", amount: 10 })],
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("issue() NF-e latin1 check and the new fields", () => {
  it("walks past numbers, dates and keys without tripping", async () => {
    const seen = captureBody();
    await issue(
      nfe({
        discount: 5,
        issuedAt: new Date("2026-11-15T13:30:00Z"),
        purpose: Purpose.COMPLEMENTARY,
        referencedKeys: [KEY],
        items: [
          nfeItem({
            cfop: "5656",
            fuel: {
              anpCode: "320102001",
              anpDescription: "Óleo diesel B S10",
              consumerState: "SP",
              biodieselPercent: 14,
              temperatureQuantity: 1000.5,
            },
          }),
        ],
      })
    );
    expect(sent(seen).discount).toBe("5");
  });

  it("still checks the text inside export", async () => {
    await expect(
      issue(
        nfe({
          taxId: undefined,
          recipientAddress: abroad,
          export: { exitState: "SP", place: "Porto 🚢" },
        })
      )
    ).rejects.toThrow(
      new ValidationError(
        "export.place contains a character outside ISO-8859-1 (latin1), which NF-e does not accept: '🚢'"
      )
    );
  });
});

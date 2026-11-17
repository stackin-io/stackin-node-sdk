<div align="center">

<img src="https://raw.githubusercontent.com/stackin-io/stackin-node-sdk/master/docs/assets/stackin.png" width="120" />

**Integrate once. Issue everywhere.**

[![Node](https://img.shields.io/badge/node-18%2B-blue?style=flat-square)](package.json)
[![npm](https://img.shields.io/npm/v/@stackin-io/stackin-node-sdk?style=flat-square)](https://www.npmjs.com/package/@stackin-io/stackin-node-sdk)
[![License](https://img.shields.io/badge/license-MIT-informational?style=flat-square)](https://github.com/stackin-io/stackin-node-sdk)

[API Reference](https://docs.stackin.io) · [Node SDK guide](https://docs.stackin.io/blog/node-sdk)

</div>

---

# stackin

Node/TypeScript SDK for fiscal document issuance — a handful of business fields, nothing about certificates, XML, XSD, signing or SOAP. The API resolves all of that from the issuer's own configuration, identified by `apiKey`.

**One class, `Invoice`** — `issue()`/`consult()`/`cancel()`/`reissue()`/`correct()`/`invalidate()`/`pdf()`/`received()`/`manifest()`, nothing else to instantiate. Each line item is a `br.Product` — `description`/`amount` are universal, everything else (`ncm`/`cfop`/`cest`/tax groups...) is Brazil-specific and only required for NFE; NFSE ignores it.

## What a line item is worth

`unitPrice` is the price of **one unit**. `amount` is the **gross total of
the line's products**, before discount, freight, insurance and other
expenses. Send either; sending both asserts that they agree.

```ts
// More than one unit — the note's line is 2 x 120.00 = 240.00
new br.Product({ description: "Teclado", quantity: 2, unitPrice: 120.0, unit: "UN" });

// Legacy: amount alone still means the line's gross total
new br.Product({ description: "Servico", quantity: 3, amount: 150.0 });
```

Amounts that do not add up are refused before the authorizer sees them,
with a `422` naming the line and both numbers (`ITEM_TOTAL_MISMATCH`).

### Migrating

```text
Before:  quantity: 3, amount: 150.0
After:   quantity: 3, unitPrice: 50.0
```

Nothing has to migrate. `amount` keeps the meaning it always had and is
not deprecated in this release.

## Install

```bash
npm install @stackin-io/stackin-node-sdk
```

## Usage

Get an `apiKey` from the [stackin dashboard](https://app.stackin.io) — select the issuing company, then Settings → API key (context `sdk`). One key per issuing company, shown once at creation. The API resolves the issuer (CNPJ, state, address, certificate, environment) entirely from it; nothing about the issuer is ever passed on a call. Defaults to `https://sdk.stackin.io`.

```ts
import {
  Invoice,
  DocumentType,
  Address,
  br,
} from "@stackin-io/stackin-node-sdk";

const client = new Invoice({ apiKey: "COMPANY_API_KEY" });

const invoice = await client.issue({
  documentType: DocumentType.NFSE,
  clientName: "John Doe",
  taxId: "00000000000",
  items: [new br.Product({ description: "Software development", unitPrice: 5000.0 })],
});

const status = await client.consult("ACCESS_KEY...", {
  documentType: DocumentType.NFSE,
});

await client.cancel("ACCESS_KEY...", {
  documentType: DocumentType.NFSE,
  reason: "Typo",
});

// The authorizer's PDF, as bytes. NFS-e only; the XML stays the legally valid
// document, and a 502 here means the authorizer is down.
const document = await client.pdf("ACCESS_KEY...", {
  documentType: DocumentType.NFSE,
});
await writeFile("nota.pdf", document);

// Retries a submission that never reached the authorizer, or was rejected by
// it. Takes the invoice's local id — not an access key, since a failed
// submission never got one. Consumes quota exactly like a fresh issue().
await client.reissue("9f2c1e3a-4b5d-6e7f-8a9b-0c1d2e3f4a5b");

// NFE requires ncm/cfop on every item, plus the buyer's full recipientAddress:
await client.issue({
  documentType: DocumentType.NFE,
  clientName: "Buyer Company Ltd",
  taxId: "11111111111111",
  items: [
    new br.Product({
      description: "Test product",
      unitPrice: 100.0,
      ncm: "84713012",
      cfop: "5102",
    }),
  ],
  recipientAddress: new Address({
    street: "Avenida Atlantica",
    number: "500",
    neighborhood: "Copacabana",
    city: "Rio de Janeiro",
    state: "RJ",
    zipCode: "22010000",
  }),
  externalReference: "order-1234",
});
```

`externalReference` is your own id for the document — an order number, a ticket, up to 255 characters. It is stored as sent, returned on every read and webhook, and `GET /invoices?external_reference=` finds the document by it. Left out of the request when unset.

`recipientAddress` is an `Address` — the buyer's address. **On an NFE it is required**, with `street`, `number`, `neighborhood`, `city`, `state` and `zipCode`: it becomes `enderDest` on the wire and the SEFAZ rejects a partial one. `cityCode` (the 7-digit IBGE municipality code) may be left out — the API resolves it from `city` and `state`, and answers `CITY_NOT_FOUND` (422) when it cannot; send it yourself when the name is ambiguous. `state` is also what resolves `idDest` — a buyer in another state is emitted as an interstate operation automatically. **On an NFSE it is the tomador's address: optional, except when any item has `taxRetained: true`** (the ISSQN retained by the tomador, where the city authorizer refuses the document without it, `E0237`); then it is required with every field except `cityCode` — `street`, `number`, `neighborhood`, `city`, `state`, `zipCode`. In both cases a missing or incomplete address raises a `ValidationError` locally, before the request goes out. `street` and `neighborhood`, when given, must have at least 2 characters once trimmed — `Address` refuses a shorter one when it is built.

`items` is an array of `br.Product` — `description`/`amount` apply to any document type; `ncm`/`cfop` (plus everything else on `Product`: `cest`, tax groups, presumed credits...) are Brazil-specific and required per item for NFE, ignored for NFSE (a service isn't a physical good). `ncm` is the full 8 digits, or `00` for a service line — any other 2-digit chapter is refused with a `ValidationError` when the `Product` is built, since the SEFAZ rejects it with `777`. `barcode` (cEAN) is `"SEM GTIN"` or a GTIN of 8, 12, 13 or 14 digits whose GS1 check digit is right, also checked when the `Product` is built. `recopiNumber` must be the 20-digit RECOPI number; the SDK checks its two modulo-11 check digits (MOC §8.5) before sending. On an NFE, each `description` is at most 120 characters (the layout's `xProd`), checked by `issue()`; an NFSE description has no such limit. Every text an NFE sends — item fields, `clientName`, every `recipientAddress` field, observations, purchase order — must fit ISO-8859-1 (latin1): accents like `ç`/`ã` are fine, and so are tab, newline and CR, which the API folds into a space. Anything the NF-e cannot carry (emoji, CJK, Cyrillic…) is refused, and `issue()` names the first offending field before the request goes out; typographic quotes, dashes, ellipsis, bullet, `€` and `™` are converted by the API, so they are sent as given. NFSE text is not restricted.

## Discount, emission time, returns and buyers abroad

These `issue()` fields are optional, and each is left out of the request when unset, so a call that does not use them sends exactly what it sent before.

```ts
import { Direction, Purpose } from "@stackin-io/stackin-node-sdk";

// A discount on the whole document, spread by the API over the lines, and an
// explicit emission moment.
await client.issue({
  ...request,
  discount: 15.0,
  issuedAt: "2026-11-15T10:30:00-03:00",
});

// A buyer returning goods: an incoming NF-e that references the original.
await client.issue({
  ...request,
  purpose: Purpose.RETURN,
  direction: Direction.IN,
  referencedKeys: ["35260611111111111111550010000000011000000014"],
});

// A buyer abroad: no taxId, state EX with the BACEN country code, and where the
// goods leave Brazil.
await client.issue({
  documentType: DocumentType.NFE,
  clientName: "Acme Inc.",
  foreignId: "P1234567",
  items: [new br.Product({ description: "Couro", unitPrice: 900.0, ncm: "41071200", cfop: "7101" })],
  recipientAddress: new Address({
    street: "5th Avenue",
    number: "350",
    neighborhood: "Midtown",
    city: "New York",
    state: "EX",
    countryCode: "2496",
    countryName: "Estados Unidos",
  }),
  export: { exitState: "SP", place: "Porto de Santos", dispatchPlace: "Alfandega de Santos" },
});
```

| Field | Wire name | What it is |
|---|---|---|
| `discount` | `discount` | A discount on the whole document in BRL, at least 0; sent as a decimal string like `amount`. |
| `issuedAt` | `issued_at` | The emission moment. A `Date` is sent as its UTC instant (`toISOString()`); a string must be ISO 8601 with an offset (`Z` or `±hh:mm`), and one without is a `ValidationError` before the request. NF-e: at most 30 days back and 5 minutes ahead; NFS-e: never ahead. The API defaults it to now. |
| `purpose` | `purpose` | `Purpose.NORMAL`, `COMPLEMENTARY`, `ADJUSTMENT` or `RETURN` (finNFe). NF-e only; the API defaults to `NORMAL`. |
| `direction` | `direction` | `Direction.OUT` or `IN` (tpNF). `IN` is an incoming NF-e the company issues itself, a sale returned by the buyer say. NF-e only; the API defaults to `OUT`. |
| `referencedKeys` | `referenced_keys` | Access keys of the NF-e, NFC-e or CF-e this one refers to. Required for `COMPLEMENTARY` (exactly one) and, but for a few CFOPs, for `RETURN`. NF-e only. |
| `foreignId` | `foreign_id` | The passport or other document of a buyer abroad, 5 to 20 letters, digits or `:.+-/()`. May be left out. |
| `export` | `export` | `{ exitState, place, dispatchPlace? }`: the Brazilian state and place the goods leave from, and the customs facility. Required on an outgoing NF-e abroad. |

A buyer abroad is `recipientAddress.state` = `"EX"`, NF-e only. There `taxId` is left out (the API refuses one, rejection 720), `zipCode` and `cityCode` may be left out (the API writes `9999999` / EXTERIOR), and `countryCode` — the BACEN country code, 1 to 4 digits, anything but 1058 — is required in their place, beside an optional `countryName`. The SDK does not check the BACEN code's check digit: the official table has countries whose digit does not close. Everywhere else `taxId` and `zipCode` stay required, and a missing one is a `ValidationError` before the request.

The SDK checks locally only what is unambiguous — types, the two enums, an `issuedAt` without an offset, `export` without `exitState` or `place`. The fiscal rules (the emission window, which purpose needs which keys, when `export` is due) belong to the API, which answers them by name.

### Fuel

A product sold under a fuel CFOP needs the NF-e fuel group (`comb`), or the SEFAZ answers 660. Set it as `fuel` on `br.Product`; it is sent under `product.br.fuel` with snake_case keys:

```ts
new br.Product({
  description: "Oleo diesel B S10",
  unitPrice: 6.29,
  quantity: 1000,
  unit: "L",
  ncm: "27101921",
  cfop: "5656",
  fuel: {
    anpCode: "820101034",
    anpDescription: "OLEO DIESEL B S10 - COMUM",
    consumerState: "SP",
    biodieselPercent: 14,
  },
});
```

`anpCode` (9 digits, from the ANP SIMP table), `anpDescription` and `consumerState` are required; `glpPercent`, `naturalGasNationalPercent`, `naturalGasImportedPercent`, `startingValue`, `codif`, `temperatureQuantity` and `biodieselPercent` are optional. Parts of the group `fuel` does not cover (CIDE, encerrante, origComb) still go through `extraGroups.comb` — but never both at once: a `Product` with `fuel` and `extraGroups.comb` is refused with a `ValidationError` when it is built.

### IBS/CBS

`ibsCbs` on `br.Product` is the Reforma Tributária group, sent as is under `product.br.ibs_cbs`: `cst` (3 digits), `classification` (the 6-digit cClassTrib), `rate_state`, `rate_city` and `rate_federal` (percent) are required; `base` defaults to the item amount. `reduction_ibs` and `reduction_cbs` (0 to 100) are the cClassTrib's pRedIBS and pRedCBS — the API requires them for CST 011, 200 and 515 and refuses them for any other, and checks the range. Left out, they are not sent:

```ts
new br.Product({
  description: "Arroz",
  unitPrice: 100.0,
  ncm: "10063021",
  cfop: "5102",
  ibsCbs: {
    cst: "200",
    classification: "200003",
    rate_state: 0.1,
    rate_city: 0.0,
    rate_federal: 0.9,
    reduction_ibs: 60,
    reduction_cbs: 60,
  },
});
```

## Retrying safely

Issuing is the one call you must not repeat blindly. If the response is lost — a
timeout, a dropped connection — the document may well have been authorized, and a
second attempt issues a **second** fiscal document: another credit, another number
burned, and undoing it means cancelling, which has a deadline.

Pass an idempotency key to make the retry safe:

```ts
const key = randomUUID();

const result = await invoice.issue({
  documentType: DocumentType.NFSE,
  clientName: "Maria Silva",
  taxId: "12345678909",
  items: [new br.Product({ description: "Consultoria", unitPrice: 1500.0 })],
  idempotencyKey: key,
});
```

Retry with the **same key and the same body** and you get the first response back,
replayed — no second document, no credit consumed. Reissue takes the same argument.

| Situation | What the API does |
|---|---|
| New key | issues normally, records the response |
| Same key, same body | replays the recorded response |
| Same key, different body | API error 422 |
| Same key, first call still running | API error 409 |
| Previous attempt failed | key is released — the retry issues |
| Key older than 24 hours | treated as new |

Generate the key yourself and keep it for as long as you might retry — one UUID per
business event, not per HTTP call. The SDK never generates one, because a key minted
per call would protect nothing, and because two genuinely separate invoices for the
same customer and amount on the same day are a normal thing to issue.

## Correcting a document

Some mistakes don't need a cancellation. A wrong product name, wrong
transport details, a typo in the extra information — a **CC-e** (carta de
correção) fixes those, and it is free: no new credit, no burned series
number, no reissue.

```ts
const result = await invoice.correct(
  "35240912345678000199550010000000011000000017",
  {
    documentType: DocumentType.NFE,
    correction: "Transportadora corrigida para Rapido Ltda",
  }
);
```

The correction text is 15 to 1000 characters, checked locally before the call.

What a CC-e **cannot** fix: anything that changes the tax owed (base, rate,
price, quantity, totals), the buyer or the seller, or the issue date. Those
still mean cancelling and reissuing. The API sends the legally fixed wording
that says exactly this, attached to every correction.

The original document does not change — the CC-e is an event attached to it, and
the authorized XML stays as it was. A document accepts at most 20 of them, and
they are numbered for you.

**NF-e only.** NFS-e has no correction letter — cancel and reissue an NFS-e
instead. The access key already tells them apart (an NF-e access key is 44
characters, an NFS-e key 50 digits), so `correct()` refuses a key that is not
an NF-e access key locally, before the call, with a `ValidationError`:
`correct is NFe only. NFSe has no correction letter — cancel and reissue
instead.` An NF-e key is all digits except the issuer CNPJ's first 12
positions, which may be uppercase letters once the CNPJ is alphanumeric (from
July 2026). What only the API can know stays an `APIError`: an NF-e key sent
with `documentType: DocumentType.NFSE`, or one for a document the API does not
hold, comes back as a `409`.

## Invalidating unused numbers

NF-e numbering is sequential and the SEFAZ expects it to have no gaps. A number
gets reserved the moment issuing starts, so a submission that fails afterwards —
a rejection, a timeout — leaves a hole in the series. Reporting that range is how
you close it.

```ts
const result = await invoice.invalidate({
  series: "1",
  numberStart: 10,
  numberEnd: 12,
  reason: "Numeracao reservada e nao utilizada por falha no ERP",
});
```

The reason is 15 to 255 characters and the range is inclusive; both are checked
locally, as is `number_end` not being below `number_start`.

A number that already reached the authorizer can't be invalidated. The API checks
its own records first and answers `409` naming the offending numbers, without a
round trip — and the authorizer checks again for what we can't see from here.

**NF-e only**, and it takes no access key: there is no document to point at.

## Documents issued against you

Everything above serves the **issuer**. These two serve the **recipient**: what
suppliers billed to this CNPJ, and the formal answer to it.

Reading the list never calls the SEFAZ. The authorizer caps how many times a CNPJ
may ask for its distribution per day, so collecting runs on a schedule on the API
side and a page refresh cannot spend that allowance.

```typescript
import { Manifestation } from "@stackin-io/stackin-node-sdk";

const page = await client.received({ limit: 20 });
console.log(page.total);

await client.manifest(accessKey, { manifestation: Manifestation.CIENCIA });
await client.manifest(accessKey, {
  manifestation: Manifestation.OPERACAO_NAO_REALIZADA,
  reason: "Mercadoria nunca chegou ao endereco",
});
```

Before you answer a document the SEFAZ sends only a **summary** (`resNFe`): access
key, issuer, amount, date. The **full document** (`nfeProc`) arrives after a
manifestation, and the `schema` field on each row says which one you hold.

The four answers are `210200` Confirmação da Operação, `210210` Ciência da
Operação, `210220` Desconhecimento da Operação and `210240` Operação não
Realizada. Only the last one takes a reason, and it requires one — both rules are
checked locally, before the request goes out, because a round trip to be told a
fixed rule is a round trip wasted.

## Looking up a code, or who a CNPJ belongs to

Two more clients, for the tables an issuer reads while filling a document. Neither writes anything.

```ts
import { FiscalReference, Taxpayer } from "@stackin-io/stackin-node-sdk";

const ref = new FiscalReference({ apiKey: "..." });   // country "BR" by default

await ref.ncm.get("84716052");                        // one code
await ref.ncm.search({ term: "teclado", limit: 5 });  // a page of matches
await ref.cfop.get("5102");
await ref.kinds();                                    // what this country has
await ref.kind("ibs_cbs_class").get("000001");        // any kind, named or not
await ref.search({ term: "teclado" });                // every kind at once

await new Taxpayer({ apiKey: "..." }).get("00000000000191");
```

`cfop`, `ncm`, `cest`, `cst`, `csosn`, `issService`, `icmsFuel` and `ibsCbsClass` have accessors. **`kind(name)` reaches anything else**, including a classification published after this release — ask `kinds()` rather than trusting this list.

`metadata` comes back as the API sends it and differs per kind: `utrib` on an NCM, `ncm_code` on a CEST, `tax_type` on a CST, `null` on an ISS service.

Three things worth knowing before you loop:

- **These share the invoice read allowance** — 600 calls a minute per key, the same bucket `consult()`, `history()`, `received()` and `pdf()` draw from. One `search()` page beats N `get()` calls.
- **Ordering is fixed** (kind, then code, ascending). Unlike `history()`, `SearchQuery` has no `sortBy`/`orderBy`.
- **A 404 from `Taxpayer` does not mean the company does not exist.** That registry reloads monthly, so a recently registered CNPJ is simply not in it yet. Do not build a validation rule on it.

`Taxpayer` has one method and keeps one: the registry holds the names and addresses of real people, so there is no search over it, by design.

## Saved clients

The company keeps the recipients it issues to. A successful issuance saves a new recipient on its own; `Clients` reads and edits them, and `issue({ clientId })` issues to one without retyping it.

```ts
import {
  ClientAlreadyExistsError,
  Clients,
  DocumentType,
  Invoice,
} from "@stackin-io/stackin-node-sdk";

const clients = new Clients({ apiKey: "..." });

await clients.list({ search: "acme", limit: 20 }); // active ones, by name
await clients.list({ isActive: false }); // the deactivated ones

let acme;
try {
  acme = await clients.create({ name: "ACME Ltda", taxId: "11.222.333/0001-81" });
} catch (error) {
  if (!(error instanceof ClientAlreadyExistsError)) throw error;
  acme = await clients.get(error.clientId); // it was there already
}
const id = String(acme.id);

await clients.update(id, { phone: "+5511999999999", notes: null }); // null clears
await clients.deactivate(id); // kept, hidden from list()
await clients.reactivate(id);

await new Invoice({ apiKey: "..." }).issue({
  documentType: DocumentType.NFSE,
  clientId: id, // name, taxId, address from it
  items: [/* ... */],
});
```

- `list()` filters by `search` (part of the name, the tax id masked or not, or the foreign id), `source` (`manual`, `issued`, `issuance`) and `isActive` (the API lists active clients when it is left out), and pages with `limit`/`offset`. `sortBy` takes `name`, `last_used_at`, `created_at` or `uses_count`.
- `update()` sends only the keys present; `address` replaces the whole address. The API checks the client as a whole, so clearing a Brazilian client's `taxId` is refused like a create without one.
- On `issue()`, the client fills whichever of `clientName`, `taxId`, `foreignId` and `recipientAddress` are left out; the ones given win. With `clientId` none of those four is required by the SDK: the API checks the merged request. A deactivated client is refused there (422) until it is reactivated.
- `updateClient: true` on `issue()` rewrites an existing client with that request's recipient data. Left out, the issuance only counts one more use of it.
- Reading needs `invoice:read`; creating, editing and deactivating need `invoice:issue`. `company` works here as on `Invoice`, on the client or per call.

## One credential, several companies

An API key is one company and needs nothing here. A credential that covers several companies (an OAuth connection) has to say which one each call acts on, by company id (UUID) or CNPJ — punctuation is ignored. Set it on the client, or per call; the call's wins. It goes out as the `X-Stackin-Company` header, on every request, lookups included. Unset, no header is sent and the request is exactly what it was before.

```ts
import { Invoice, DocumentType } from "@stackin-io/stackin-node-sdk";

const client = new Invoice({ apiKey: "...", company: "11.222.333/0001-81" });

const { environment, companies } = await client.companies();
// companies: [{ company_id, name, tax_id, permissions: [...] }]

await client.consult("ACCESS_KEY...", {
  documentType: DocumentType.NFSE,
  company: companies[1].company_id,
});
```

`companies()` (`GET /me/companies`) lists what the credential reaches and with which permissions; an API key lists its one company with every permission. Every `Invoice` method takes `company` among its options (`issue()` in the request). `FiscalReference` and `Taxpayer` take it on the client; the API ignores it there.

## Errors

- `APIError` — the API responded with a non-2xx status (`statusCode`, `detail`) — a 401 here means `apiKey` is missing, wrong, or was rotated.
- `CompanyRequiredError` (422) — the credential covers several companies and the call named none. `companies` lists them.
- `CompanyNotInScopeError` (403) — the company named is not one the credential covers. `companies` lists the ones it does.
- `InsufficientPermissionError` (403) — the credential reaches the company but lacks the permission; `detail` reads `needs X, has Y, company=<id>`.

  All three extend `APIError` and are never retried: the answer would not change.
- `ClientAlreadyExistsError` (409, an `APIError`) — `Clients.create()` or `update()` with a `taxId` or `foreignId` the company already has on another client. `clientId` names that client.
- `ConnectionFailedError` — the API didn't respond (network/DNS/timeout).
- `ValidationError` — `issue()` without `clientName` or `taxId` and no `clientId` (`taxId` may be left out for an NF-e to a buyer abroad), `items` is empty, missing `ncm`/`cfop` on an item for NFE, a missing/incomplete `recipientAddress` on NFE, an NFE item `description` over 120 characters, NFE text the NF-e cannot carry (outside ISO-8859-1, other than the typographic characters the API converts), a missing/incomplete `recipientAddress` on an NFSE with a `taxRetained` item, or a `correct()` access key that is not an NF-e access key (44 characters). Building a `Product` with a malformed `ncm`, `barcode` or `recopiNumber`, or an `Address` with a `street`/`neighborhood` under 2 characters, raises it too.

Building the full fiscal document (issuer data, service code, tax groups, schema-accurate XML) is the API's job — configured once per company, not passed on every call.

## Examples

Runnable end-to-end scripts in [`examples/nfe/`](examples/nfe/) and [`examples/nfse/`](examples/nfse/) — one file per field variant, from the bare minimum to every field filled. `examples/consult_invoice.ts`, `examples/cancel_invoice.ts`, and `examples/reissue_invoice.ts` cover the operations that act on an already-issued document. `examples/lookup_fiscal_reference.ts` and `examples/lookup_taxpayer.ts` cover the two read-only clients.

Commit convention lives in [`CONTRIBUTING.md`](CONTRIBUTING.md), not here.

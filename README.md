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
    cityCode: "3304557",
  }),
});
```

`recipientAddress` is an `Address` — the buyer's address, **required for NFE** and ignored for NFSE. Every field is required, `cityCode` (the 7-digit IBGE municipality code) included: it becomes `enderDest` on the wire and the SEFAZ rejects a partial one. `state` is also what resolves `idDest` — a buyer in another state is emitted as an interstate operation automatically. A missing or incomplete address raises a `ValidationError` locally, before the request goes out.

`items` is an array of `br.Product` — `description`/`amount` apply to any document type; `ncm`/`cfop` (plus everything else on `Product`: `cest`, tax groups, presumed credits...) are Brazil-specific and required per item for NFE, ignored for NFSE (a service isn't a physical good).

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

**NF-e only.** NFS-e has no correction letter, and asking for one returns
a `409`.

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

- **These share the invoice read allowance** — 600 calls a minute per key, the same bucket `consult()`, `history()` and `pdf()` draw from. One `search()` page beats N `get()` calls.
- **Ordering is fixed** (kind, then code, ascending). Unlike `history()`, `SearchQuery` has no `sortBy`/`orderBy`.
- **A 404 from `Taxpayer` does not mean the company does not exist.** That registry reloads monthly, so a recently registered CNPJ is simply not in it yet. Do not build a validation rule on it.

`Taxpayer` has one method and keeps one: the registry holds the names and addresses of real people, so there is no search over it, by design.

## Errors

- `APIError` — the API responded with a non-2xx status (`statusCode`, `detail`) — a 401 here means `apiKey` is missing, wrong, or was rotated.
- `ConnectionFailedError` — the API didn't respond (network/DNS/timeout).
- `ValidationError` — `issue()`'s `items` is empty, missing `ncm`/`cfop` on an item for NFE, or a missing/incomplete `recipientAddress` on NFE.

Building the full fiscal document (issuer data, service code, tax groups, schema-accurate XML) is the API's job — configured once per company, not passed on every call.

## Examples

Runnable end-to-end scripts in [`examples/nfe/`](examples/nfe/) and [`examples/nfse/`](examples/nfse/) — one file per field variant, from the bare minimum to every field filled. `examples/consult_invoice.ts`, `examples/cancel_invoice.ts`, and `examples/reissue_invoice.ts` cover the operations that act on an already-issued document. `examples/lookup_fiscal_reference.ts` and `examples/lookup_taxpayer.ts` cover the two read-only clients.

Commit convention lives in [`CONTRIBUTING.md`](CONTRIBUTING.md), not here.

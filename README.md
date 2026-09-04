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

**One class, `Invoice`** — `issue()`/`consult()`/`cancel()`/`reissue()`, nothing else to instantiate. Each line item is a `br.Product` — `description`/`amount` are universal, everything else (`ncm`/`cfop`/`cest`/tax groups...) is Brazil-specific and only required for NFE; NFSE ignores it.

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
  items: [new br.Product({ description: "Software development", amount: 5000.0 })],
});

const status = await client.consult("ACCESS_KEY...", {
  documentType: DocumentType.NFSE,
});

await client.cancel("ACCESS_KEY...", {
  documentType: DocumentType.NFSE,
  reason: "Typo",
});

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
      amount: 100.0,
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
  items: [new br.Product({ description: "Consultoria", amount: 1500.0 })],
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

## Errors

- `APIError` — the API responded with a non-2xx status (`statusCode`, `detail`) — a 401 here means `apiKey` is missing, wrong, or was rotated.
- `ConnectionFailedError` — the API didn't respond (network/DNS/timeout).
- `ValidationError` — `issue()`'s `items` is empty, missing `ncm`/`cfop` on an item for NFE, or a missing/incomplete `recipientAddress` on NFE.

Building the full fiscal document (issuer data, service code, tax groups, schema-accurate XML) is the API's job — configured once per company, not passed on every call.

## Examples

Runnable end-to-end scripts in [`examples/nfe/`](examples/nfe/) and [`examples/nfse/`](examples/nfse/) — one file per field variant, from the bare minimum to every field filled.

Commit convention lives in [`CONTRIBUTING.md`](CONTRIBUTING.md), not here.

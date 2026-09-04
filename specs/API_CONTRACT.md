# stackin SDK API contract

This is the cross-language contract every `stackin-{lang}-sdk` must
implement. It exists so a developer who's used one stackin SDK can
guess the shape of any other one correctly — same concepts, same
names (translated to each language's own casing convention), same
behavior, same error taxonomy. This document is normative: a PR that
changes any SDK's public shape without updating this file first is
wrong, not the other way around.

Ground truth for what's described here: `stackin-python-sdk` and
`stackin-go-sdk` — if this doc and either of those disagree on
something already shipped, the shipped behavior wins and this doc
needs a fix, filed as a docs bug, not silently "corrected" by copying
the drift into the other language.

## 1. Entry point

One client type per SDK, always named `Invoice` (not `Client`, not
`StackinClient`, not `SDK`) — a class in class-based languages, a
struct in Go/Rust, a record/data class where the language prefers
that. It is the *only* type a caller ever instantiates directly to
talk to the API; every other public type (`Product`, `Address`,
error types) exists to be passed to or returned from it.

### Construction

Exactly one required input: `api_key` (string). Everything else is
optional, with this resolution order (first non-empty wins):

1. Explicit constructor/option argument (`base_url`, or an
   `environment` enum — never both required at once).
2. A `STACKIN_BASE_URL` environment variable, if the language
   ecosystem makes reading env vars idiomatic at construction time.
3. The environment default: `https://sdk.stackin.io` for both
   `test`/`homologation` and `production` — the *token* pins the real
   environment server-side (see `[[feedback_stackin_route_split]]` in
   `stackin-io/start-strategy` memory), the SDK never needs to know
   or send which one it's in.

Idiomatic construction patterns per language (all equivalent):

| Language | Pattern |
|---|---|
| Python | `Invoice(api_key="...")` — keyword args |
| Go | `NewInvoice(WithAPIKey("..."))` — functional options |
| Node/TS | `new Invoice({ apiKey: "..." })` — options object |
| Java/Kotlin | `Invoice.builder().apiKey("...").build()` — builder |
| Ruby | `Invoice.new(api_key: "...")` — keyword args |
| Rust | `Invoice::builder().api_key("...").build()` |
| PHP | `new Invoice(apiKey: "...")` — named args |
| Swift | `Invoice(apiKey: "...")` |
| C# | `new Invoice(new InvoiceOptions { ApiKey = "..." })` |

No SDK constructor ever takes an issuer's CNPJ, address, tax regime,
or certificate — those live entirely in the dashboard/API account
tied to the key. If a future field looks like it belongs on the
issuer rather than the request, it does not belong on the client
constructor either; push back before adding it.

## 2. Methods

Three, always, on `Invoice`, no more no fewer at the top level:

| Concept | Python | Go | Node/TS | Java/Kotlin | Ruby | Rust | Swift | C# |
|---|---|---|---|---|---|---|---|---|
| Issue | `issue()` | `Issue()` | `issue()` | `issue()` | `issue` | `issue()` | `issue()` | `Issue()` |
| Consult | `consult()` | `Consult()` | `consult()` | `consult()` | `consult` | `consult()` | `consult()` | `Consult()` |
| Cancel | `cancel()` | `Cancel()` | `cancel()` | `cancel()` | `cancel` | `cancel()` | `cancel()` | `Cancel()` |

Casing rule: verbatim snake_case in Python/Ruby/Rust, PascalCase
where the language capitalizes exported/public members (Go, C#), and
lowerCamelCase everywhere else (Node/TS, Java, Kotlin, Swift, PHP).
Never translate the *word* — it's always issue/consult/cancel, never
"create", "get", "void", "revoke", etc., regardless of language
convention.

### `issue(...)`

Required: `document_type` (`nfe`/`nfse`, an enum not a raw string —
see §4), `client_name`, `tax_id`, `items` (one or more `Product`, see
§3 — empty is a local validation error, never a network call).

Optional: `recipient_address` (an `Address` — see §3), `contingency`
(bool, NF-e only).

Returns an issued-document result carrying at minimum `access_key`,
`status`, and `protocol` — the exact field set and casing an SDK
exposes should mirror the REST API's `IssueRequest`/response shape
one-to-one (see `docs.stackin.io`), not invent a parallel shape.

### `consult(access_key, *, document_type)`

Both required. `access_key` is positional/first-argument in every
SDK examined so far (Python, Go) — keep that placement; only
`document_type` goes through the language's keyword/named-argument
mechanism where one exists.

### `cancel(access_key, *, document_type, reason)`

Same `access_key`-first shape as `consult`, plus a required `reason`
string (the authorizer's `xJust`/equivalent field requires it —
minimum 15 characters for NF-e; SDKs may validate this locally to
fail fast, but the authoritative check is still server-side).

## 3. Shared value types

### `Product` (Brazil-specific line item, namespaced e.g.
`stackin.br.Product` / `br.Product`)

Universal fields, required on every item regardless of document
type: `description` (string), `amount` (decimal/float — never an
integer-cents type unless the whole SDK's numeric convention is
already cents everywhere).

Brazil/NF-e-specific fields, required only when `document_type` is
`nfe` (validated locally — missing `ncm`/`cfop` on an NFE item is a
local `ValidationError`/`ValueError`, not a round trip to the API):
`ncm`, `cfop`, plus whatever else exists on the current `Product`
shape (`cest`, tax groups, presumed credits — see the real SDKs for
the exhaustive current field list, don't hand-copy a stale list into
a new SDK; read the source).

NFS-e items ignore every Brazil-specific field — a service has no
tax classification code. Do not require them, do not silently drop
them if a caller sets them anyway; that's a caller error, not
something to swallow.

### `Address`

Used exactly once, as `recipient_address` on `issue()` — the
*buyer's* address. **Required for NF-e**, ignored for NFS-e.

The API requires every field on it except `city_code`: `street`,
`number`, `neighborhood`, `city`, `state`, `zip_code`. NF-e
additionally requires `city_code` (the buyer's 7-digit IBGE
municipality code). The group becomes `enderDest` on the wire, and
the SEFAZ rejects a partial one (errors 274/726/696/695) — which is
why it can't be sent piecemeal.

`state` is also what resolves `idDest` (interstate vs internal): an
NF-e whose buyer state differs from the issuer's is emitted as an
interstate operation automatically, with no separate flag.

Since a missing or partial address is a guaranteed server-side
rejection, SDKs validate it locally on NF-e — the same class of
local check as a missing `ncm`/`cfop` (§3), raising the language's
local validation error instead of spending a round trip.

## 4. Enums

`DocumentType`: exactly two values, `NFE` and `NFSE` (issued as
`"nfe"`/`"nfse"` on the wire) — an actual enum/sum type in every
language capable of one, never a bare string parameter on public
methods, so a typo becomes a compile-time or import-time error
instead of a 422 from the API.

If a language's ecosystem has no enum construct (rare), a validated
constant with a restricted set of allowed values is the fallback —
still not a free-form string.

## 5. Errors

Exactly three error/exception types, always these three concepts,
named consistently with the language's exception-naming convention
(`Error`/`Exception` suffix as idiomatic):

| Concept | When | Python | Go | Carries |
|---|---|---|---|---|
| API error | API responded non-2xx | `APIError` | `*APIError` | status code + `detail`/message from the API body |
| Connection failure | API never responded (network/DNS/timeout) | `ConnectionFailedError` | `*ConnectionFailedError` | the underlying transport error, wrapped not swallowed |
| Local validation | a request would obviously fail server-side and the SDK catches it before the network call | `ValueError` (or a dedicated `ValidationError` if the language distinguishes) | a dedicated `*InvoiceError` | what's wrong, e.g. empty `items`, missing `ncm`/`cfop` on an NFE item |

A 401 from `APIError` specifically means the `api_key` is missing,
wrong, or was rotated — SDKs may special-case this in their error
message (see the real READMEs' Errors sections) but must not invent
a fourth error *type* just for it; it's still an `APIError`.

Building the full fiscal document (issuer data, service code, tax
groups, schema-accurate XML, signing) is the API's job, never the
SDK's — an SDK that starts doing local XML generation, signing, or
SEFAZ/ADN endpoint routing has stopped being a thin client and needs
a design review before merging, not just a code review.

## 6. What's explicitly out of scope for every SDK

- No certificate handling (upload, storage, signing) — that's a
  dashboard/API concern tied to the issuing company, never passed on
  a call.
- No environment selection per-request — it's fixed on the `api_key`
  at creation time in the dashboard (`Settings → API key`, context
  `sdk`), never a runtime parameter.
- No retries-with-backoff by default beyond whatever the underlying
  HTTP client already does — don't add hidden retry loops that could
  double-issue a fiscal document on a slow-but-successful request.
- No caching of responses.

## 7. Adding a new SDK

1. Start from `stackin-sdk-template` (this repo) — see `SETUP.md`.
2. Implement §1–§5 above exactly as specified; where this doc is
   ambiguous for your language, match `stackin-python-sdk` or
   `stackin-go-sdk`'s actual behavior (read the source, this doc
   summarizes it, it isn't a substitute for it) and then come back
   and tighten this doc's wording so the next SDK doesn't have to
   guess the same thing.
3. Do not add public surface area beyond §1–§5 without updating this
   file in the same PR.

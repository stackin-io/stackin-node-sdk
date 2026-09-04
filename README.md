<!--
Shared structure for every stackin-io SDK README (stackin-python-sdk,
stackin-go-sdk, and any future language). Section order and headings
are fixed — only the code/wording inside each section is
language-specific. Keep both real READMEs in sync with this shape;
update this file first when the shape itself changes.
-->

<div align="center">

<img src="https://raw.githubusercontent.com/stackin-io/{REPO}/{DEFAULT_BRANCH}/docs/assets/stackin.png" width="120" />

**Integrate once. Issue everywhere.**

[![{LANG}](https://img.shields.io/badge/{LANG_BADGE})]({LANG_MANIFEST_FILE})
[![{REGISTRY}](https://img.shields.io/{REGISTRY_BADGE})]({REGISTRY_URL})
[![License](https://img.shields.io/badge/license-MIT-informational?style=flat-square)](https://github.com/stackin-io/{REPO})

[API Reference](https://docs.stackin.io) · [{LANG} SDK guide](https://docs.stackin.io/blog/{blog-slug-for-this-sdk})

</div>

---

# stackin

{ONE_LINE_LANGUAGE_DESCRIPTION} for fiscal document issuance — a handful of business fields, nothing about certificates, XML, XSD, signing or SOAP. The API resolves all of that from the issuer's own configuration, identified by `api_key`.

**One {CLASS_OR_STRUCT}, `Invoice`** — `{issue}()`/`{consult}()`/`{cancel}()`, nothing else to instantiate. Each line item is a `{Product}` — `description`/`amount` (or your language's casing) apply to any document type; `ncm`/`cfop` (plus everything else on `Product`: `cest`, tax groups, presumed credits...) are Brazil-specific and required per item for NFE, ignored for NFSE.

## Install

```{shell}
{install command}
```

## Usage

Get an `api_key` from the [stackin dashboard](https://app.stackin.io) — select the issuing company, then Settings → API key (context `sdk`). One key per issuing company, shown once at creation. The API resolves the issuer (CNPJ, state, address, certificate, environment) entirely from it; nothing about the issuer is ever passed on a call. Defaults to `https://sdk.stackin.io`.

```{lang}
{end-to-end usage example, mirroring the other language's example 1:1 — same field names in this language's casing, same NFE/NFSE split, same recipient state note}
```

`recipient_address`/`RecipientAddress` is an `Address`, but despite the name only `.state`/`.State` is read — the rest of the fields aren't sent anywhere yet. It's the actual customer's state, used only to set `idDest` (interstate vs internal) on NFE — optional, omitting it always produces `idDest=1` (internal).

## Errors

- `{APIError}` — the API responded with a non-2xx status ({status/detail fields}) — a 401 here means `api_key` is missing, wrong, or was rotated.
- `{ConnectionFailedError}` — the API didn't respond (network/DNS/timeout).
- `{ValidationError}` — `issue()`'s items is empty, or missing `ncm`/`cfop` on an item for NFE.

Building the full fiscal document (issuer data, service code, tax groups, schema-accurate XML) is the API's job — configured once per company, not passed on every call.

## Examples

Runnable end-to-end {scripts/programs} in [`examples/nfe/`](examples/nfe/) and [`examples/nfse/`](examples/nfse/) — one {script/program} per field variant, from the bare minimum to every field filled.

Commit convention lives in [`CONTRIBUTING.md`](CONTRIBUTING.md), not here.

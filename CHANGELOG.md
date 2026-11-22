# Changelog

## v0.24.1 — 2026-11-22

### Docs
- **readme:** client email and phone are written into the fiscal document (stackin-io/stackin-api#661)

## v0.24.0 — 2026-11-22

### Features
- **invoice:** add clientEmail and clientPhone to issue()

### Docs
- **readme:** document clientEmail and clientPhone

### Tests
- **invoice:** cover client_email and client_phone body mapping

## v0.23.0 — 2026-11-22

### Features
- **items:** upsert() answers { item, created }, create() the item; ITEM_TAX_REGIME_MISMATCH (stackin-api#642)
- **items:** items catalog resource and item_id on issue lines (stackin-io/stackin-api#642)

### Bug Fixes
- **items:** unitPrice accepts a decimal string, unknown fields throw (stackin-api#642)

### Chores
- **gitignore:** block certificate, key and .env files (stackin-io/devops#47)

## v0.22.0 — 2026-11-21

### Features
- **company:** update the issuer's address and fiscal fields (stackin-api#554)

### Docs
- **readme:** fix the issuer, and the readiness breakdown (stackin-api#554)
- **invoice:** readiness by document type, fix_url and suggested fields (stackin-api#554)

### Tests
- **company:** update body, local refusals and API errors (stackin-api#554)

## v0.21.0 — 2026-11-20

### Features
- **invoice:** stats(), readiness(), rejection(), classify() and invalidations()
- **invoice:** contingency on issue()
- **reference:** cities() on FiscalReference
- **webhooks:** Webhooks client — create, list, delete and deliveries

### Bug Fixes
- **client:** no trailing ? when a call has no query
- **invoice:** submissions() escapes the invoice id as one path segment

### Docs
- **readme:** readiness, rejection, classification, cities, webhooks and contingency

### Tests
- **invoice:** public routes, contingency and cities
- **webhooks:** create, list, delete and deliveries

## v0.20.0 — 2026-11-18

### Features
- **client:** usage(), syncReceived() and history filters (#36)
- **errors:** typed payment, rate-limit and client errors (#36)

### Docs
- **readme:** usage, received sync and billing, PDF for both document types (#36)

### Tests
- **client:** usage, received sync, history filters and typed errors (#36)

## v0.19.0 — 2026-11-17

### Features
- **clients:** clients resource and client_id on issue (stackin-io/stackin-api#380)

### Docs
- **readme:** saved clients section (stackin-io/stackin-api#380)

## v0.18.0 — 2026-11-17

### Features
- **br:** add reduction_ibs and reduction_cbs to IbsCbsFields (stackin-io/stackin-api#326)

## v0.17.0 — 2026-11-16

### Features
- **client:** company option sent as X-Stackin-Company, and companies() (#31)
- **errors:** typed company and permission errors (#31)

### Docs
- **readme:** one credential, several companies (#31)

### Tests
- **company:** header, companies() and the three company errors (#31)

## v0.16.0 — 2026-11-15

### Features
- **issue:** discount, issuedAt, purpose, direction, referencedKeys, foreignId and export
- **product:** send the NF-e fuel group under fuel
- **address:** country code and name for a buyer abroad

### Docs
- **readme:** API v0.8-v0.9 issue fields and the fuel group

## v0.15.0 — 2026-11-15

### Features
- **product:** validate the RECOPI check digits

## v0.14.0 — 2026-11-15

### Features
- **client:** externalReference on issue(), cityCode optional on an NF-e address

### Docs
- **readme:** document externalReference and an optional cityCode

## v0.13.0 — 2026-11-15

### Features
- **invoice:** require recipient address for retained ISS on NFS-e
- **product:** validate the GTIN check digit on barcode
- **validation:** reject non-latin1 text on NF-e before sending
- **validation:** mirror NF-e 4.00 XSD rules for cEAN, xProd and address

### Bug Fixes
- **validation:** refuse only what the API cannot convert to latin1
- **invoice:** accept an alphanumeric CNPJ in the correct() access key
- **invoice:** require a complete address for retained ISS on NFS-e
- **invoice:** require a 44-digit NF-e key on correct()
- **product:** accept only 8-digit NCM or 00

### Docs
- **invoice:** document local key check and remaining 409 on correct()

### CI
- pin Node 20 in .nvmrc for the code-quality setup

### Chores
- **platform:** install action-platform

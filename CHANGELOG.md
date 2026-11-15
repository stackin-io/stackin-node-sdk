# Changelog

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

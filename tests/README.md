# Unit tests — required, not optional

Every `stackin-{lang}-sdk` ships unit tests under this directory
(`tests/` — or this language's ecosystem convention, e.g. Go's
`*_test.go` files sit next to the source they cover instead of in a
separate folder; keep whatever your language's tooling expects, don't
fight it). `.github/workflows/test.yml` fails the build if these are
missing or broken — there is no "SDK without tests" state.

## Minimum coverage — mirror `stackin-python-sdk`'s `tests/test_client.py`
and `stackin-go-sdk`'s `client_test.go` as the concrete reference:

1. **Client construction**
   - Defaults to `https://sdk.stackin.io` when no base URL/env var is set.
   - `STACKIN_BASE_URL` env var (or this language's equivalent) overrides the default.
   - Explicit base-URL option overrides both.
2. **Auth header**
   - `Authorization: Bearer {api_key}` is set when an API key is configured.
   - The header is absent (not empty-string) when no API key is set.
3. **`issue()` validation** (client-side, before any HTTP call)
   - Empty `items` raises the validation error type.
   - NFE with a missing `ncm`/`cfop` on any item raises the validation error type.
   - NFSE does **not** require `ncm`/`cfop`.
4. **Request/response shape**, against a local mock HTTP server (Python:
   `responses`/`httpretty`; Go: `httptest.NewServer`; Node: `nock`;
   equivalent per language) — never hit the real API in a unit test:
   - A 2xx response's `result` field is unwrapped and returned.
   - A non-2xx response raises the API error type, carrying status code and detail.
   - An unreachable host raises the connection error type, not a generic/unhandled exception.
   - `cancel()` sends `reason` and `document_type` in the request body.

## Rules

- No network calls in unit tests — mock the HTTP layer. If this SDK
  also wants a real end-to-end smoke test against a live environment,
  that's a separate, explicitly-skipped-by-default test, not part of
  the default `test.yml` run.
- Test the three error types (`{APIError}`, `{ConnectionFailedError}`,
  `{ValidationError}` from `specs/API_CONTRACT.md`) by type, not by
  string-matching the error message.
- Delete this `README.md` once real tests exist here — it's setup
  guidance, not documentation for SDK users.

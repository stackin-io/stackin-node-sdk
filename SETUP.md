# Using this template

This repo is a GitHub template — click "Use this template" to start a
new stackin client library (e.g. `stackin-node-sdk`, `stackin-php-sdk`).

Steps after creating the new repo from this template:

1. **README.md** — fill in every `{PLACEHOLDER}`: language name/badge,
   package registry badge and URL, install command, a full usage
   example mirroring `stackin-python-sdk`/`stackin-go-sdk` 1:1 (same
   field names in this language's casing, same NFE/NFSE split, same
   `recipient_address`/`.state` note), and the three error types.
2. **CONTRIBUTING.md** — replace `{LINT}`/`{PKG}` with this language's
   icon types (see the note at the bottom of that file), delete the
   note once done.
3. **docs/assets/stackin.png** — already the shared brand mark, no
   change needed unless the mark itself changes.
4. **examples/** — add `examples/nfe/` and `examples/nfse/`, one
   file (or one program, for languages that need a directory per
   `main`) per field variant — see the existing SDKs' `examples/`
   for the exact set of variants to cover.
5. **`.code_quality/`** — keep only your language's subfolder
   (`python/`, `go/`, `node/`, `php/`, `java/`, `ruby/`, `rust/`,
   `dotnet/`, `swift/`, `kotlin/`), flatten just that subfolder up one
   level to `.code_quality/{file}` at the repo root, and delete the
   rest. **The config files must stay inside `.code_quality/` — never
   move them into the repo root itself** (`stackin-python-sdk/.code_quality/ruff.toml`,
   not `stackin-python-sdk/ruff.toml`). Point every lint/format command
   at it with an explicit `--config`/`-c` flag — never rely on a
   tool's default root-level file discovery, since the file isn't
   there. Wire it into CI the same way `stackin-python-sdk`'s
   `code-quality.yml` does.
6. **`LAST_VERSION`** — starts at `0.1.0`; the publish pipeline (see
   `stackin-python-sdk/.github/workflows/python-publish-pypi.yml` for
   the pattern) keeps it in sync with the package manifest and the
   release tag, don't hand-edit it after the first release.
7. Delete this file (`SETUP.md`) once the README is filled in — it's
   only for template setup, not for end users of the finished SDK.
   Delete `.claude/` too (the `stackin-new-sdk` skill) — it's for
   scaffolding this repo out of the template, not part of the SDK
   itself.
8. Add a matching post under `docs-frontend/src/content/blog/posts/`
   (see `python-sdk.json`/`go-sdk.json` for the shape — one JSON file
   per post, `en`/`pt`/`es` translations inline) so the README's
   "{LANG} SDK guide" link resolves to something real, and link it
   from the README instead of the placeholder blog slug.
9. Read `specs/API_CONTRACT.md` (classes, method names, behavior,
   result/error shape every SDK must follow) and `specs/CODE_QUALITY_SPEC.md`
   (fixed shape for `code-quality.yml`) before writing any code — they
   define what "done" means across languages, not just for this SDK.

For the fixed section shape itself (what goes in each section, in
what order), see `README.md` in this repo — it *is* the annotated
template, not a separate doc.

---
name: stackin-new-sdk
description: ALWAYS invoke when creating a new stackin client library (new language SDK) or auditing an existing stackin-io SDK repo (stackin-python-sdk, stackin-go-sdk) for compliance. Drives the process from stackin-sdk-template.
---

# stackin-new-sdk skill

## Source of truth

Template repo: `stackin-io/stackin-sdk-template` (`is_template: true`).

Read these three files first, in this order, before writing any code:

1. `SETUP.md` — the 9-step checklist (README fill-in, CONTRIBUTING,
   assets, examples, `.code_quality/`, `LAST_VERSION`, delete SETUP.md,
   blog post, specs).
2. `specs/API_CONTRACT.md` — universal cross-language contract: class
   shape, method names, argument/result/error shape every SDK must
   follow, regardless of language.
3. `specs/CODE_QUALITY_SPEC.md` — fixed shape for `code-quality.yml`
   (what jobs/steps every SDK's CI must have, matrix pattern, summary
   step).

## Creating a brand-new language SDK

### 0. Create the repo

`gh repo create stackin-io/stackin-{lang}-sdk --template stackin-io/stackin-sdk-template --public`
— confirm with the user first (new public repo = irreversible-ish,
GitHub org-visible action). Clone it locally next to the other
`stackin-io` repos.

### 1. `README.md` — fill every `{PLACEHOLDER}`

Language name/badge, package registry badge + URL, install command,
and a **full usage example that mirrors `stackin-python-sdk`/
`stackin-go-sdk` 1:1**: same field names (in this language's casing —
`snake_case` Python, `PascalCase`/`camelCase` Go, etc.), same
NFE/NFSE split (two separate issue calls, not one generic "issue"),
same `recipient_address`/`.state` note, and all three error types from
`specs/API_CONTRACT.md`. The README *is* the annotated template — the
fixed section order in this repo's own `README.md` is the shape to
copy, not a separate doc to consult.

### 2. `CONTRIBUTING.md` — commit-icon table

Replace `{LINT}`/`{PKG}` placeholders with this language's actual
icon types (Python: 📝 PEP8/📦 PyPI; Go: 📝 LINT/📦 MOD; JS/TS: 📝
LINT/📦 NPM; Rust: 📝 CLIPPY/📦 CRATE — invent the pair for anything
not yet covered, following the same "format-fix icon / package-release
icon" split). Delete the explanatory note at the bottom once done.

### 3. `docs/assets/stackin.png`

Shared brand mark, already correct — no change unless the mark itself
changes.

### 4. `examples/`

Add `examples/nfe/` and `examples/nfse/`, one file (or one
program, for languages that need a directory per `main`) per field
variant — client init → issue → print result, same steps as the
existing SDKs' examples for that field.

### 5. `.code_quality/{lang}/` — keep only your language, don't flatten it

Copy `.code_quality/{lang}/` out of the template into the new repo's
own `.code_quality/` directory at repo root, delete the other nine
language folders. **Do not move the config files up into the repo
root itself** — `stackin-python-sdk/.code_quality/ruff.toml`, never
`stackin-python-sdk/ruff.toml`. Point every tool at it with an
explicit flag, never default root-level discovery:

- Python: `ruff check --config=.code_quality/ruff.toml`,
  `ruff format --config=.code_quality/ruff.toml`
- Go: `golangci-lint run --config=.code_quality/.golangci.yml`
  (pass as `args:` on `golangci-lint-action`, since the action's own
  `config` input assumes repo-root)
- Other languages: same pattern — `--config`/`-c` pointed into
  `.code_quality/`.

Wire it into `.github/workflows/code-quality.yml` per
`specs/CODE_QUALITY_SPEC.md`'s fixed shape (copy
`stackin-python-sdk`'s or `stackin-go-sdk`'s real workflow — whichever
is closer in ecosystem — as the concrete reference, then swap the
linter/formatter step and `--config` flag). Also copy the matching
`.github/actions/setup-{toolchain}/action.yml` composite action.

### 6. `LAST_VERSION`

New file, content `0.1.0`. The publish pipeline (see
`stackin-python-sdk/.github/workflows/python-publish-pypi.yml` for the
pattern) keeps it in sync with the package manifest and the release
tag after the first release — don't hand-edit it once publishing
starts.

### 7. Delete `SETUP.md` and `.claude/`

Only once the README is fully filled in — both are setup-only
(this skill included), not part of the finished SDK.

### 8. Blog post

Add a matching post under `docs-frontend/src/content/blog/posts/`
(see `python-sdk.json`/`go-sdk.json` for the shape — one JSON file per
post, `en`/`pt`/`es` translations inline) so the README's "{LANG} SDK
guide" link resolves to something real. Link it from the README in
place of the placeholder blog slug.

### 9. Read the specs before writing SDK code

`specs/API_CONTRACT.md` (classes, method names, behavior, result/error
shape) and `specs/CODE_QUALITY_SPEC.md` (CI shape) — read both before
implementing the client itself, not after. They define what "done"
means across languages; a mismatch here is a real bug, not a style
nit, even for a "quick" SDK.

### Report, don't commit

Report the finished structure back to the user once all 9 steps are
done. Do not `git add`/`commit`/`push` without an explicit ask in that
turn — finishing scaffolding doesn't imply permission.

## Auditing an existing SDK repo for drift

When asked to check `stackin-python-sdk` or `stackin-go-sdk` against
the template:

1. Diff its `.code_quality/` contents against
   `stackin-sdk-template/.code_quality/{lang}/` — flag missing rules,
   not just missing files.
2. Check `.github/workflows/code-quality.yml` structurally matches
   `specs/CODE_QUALITY_SPEC.md` (job name, matrix versions, summary
   step) — an SDK is free to add steps, but must not be missing any
   required one.
3. Spot-check the SDK's public API (client entry point, method names,
   error types) against `specs/API_CONTRACT.md` — this is the one
   most likely to silently drift as features get added ad hoc.
4. Report drift found. Fix only if explicitly asked.

## Known repos already on this pattern

| Repo | Branch | Status |
|---|---|---|
| `stackin-python-sdk` | `master` | `.code_quality/{ruff.toml,.flake8,mypy.ini}`, CI wired |
| `stackin-go-sdk` | `main` (only repo in the family still on `main`) | `.code_quality/.golangci.yml`, CI wired |

Check `git status`/`git log` in each repo before assuming its
CI/config changes are live — don't trust this table blindly, it goes
stale.

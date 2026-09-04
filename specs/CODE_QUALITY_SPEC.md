# Code-quality workflow specification

Every `stackin-{lang}-sdk` ships a GitHub Actions workflow named
`.github/workflows/code-quality.yml` with this exact shape. Ground
truth for what "done" looks like: `stackin-python-sdk`'s real file —
this doc generalizes it; if they disagree, the shipped file wins and
this doc needs fixing.

## Fixed shape (same in every language)

```yaml
name: 🔍 Code Quality

on:
  pull_request:
    branches: ["main", "master", "pypi"]   # match this repo's real branches — "pypi" only exists on stackin-python-sdk, don't copy it blindly
  workflow_dispatch:
  workflow_call:

jobs:
  code-quality:
    name: Code Quality Checks
    runs-on: ubuntu-latest
    strategy:
      matrix:
        {lang}-version: [...]   # every actively-supported version, oldest-to-newest, matching what the README's badge/manifest already claims

    steps:
      - name: 📥 Checkout code
        uses: actions/checkout@v4

      - name: 📦 Setup {toolchain}
        uses: ./.github/actions/setup-{toolchain}   # a local composite action, not inline steps — see "Setup action" below
        with:
          {lang}-version: ${{ matrix.{lang}-version }}
          install-deps: dev,code-quality   # or this ecosystem's equivalent of "dev + lint tool" dependency groups

      - name: 🔍 {Linter} (Linting)
        run: {lint command, pointed explicitly at .code_quality/{lang}/{config file} via --config/-c — never rely on root-level auto-discovery}

      - name: 🎨 {Formatter} (Format Check)
        run: {format --check command, same explicit --config — must fail the job on unformatted code, never auto-fix in CI}

      - name: ✅ Code Quality Summary
        if: always()
        run: |
          echo "### Code Quality Checks Completed ✅" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "{Lang} Version: ${{ matrix.{lang}-version }}" >> $GITHUB_STEP_SUMMARY
          echo "All code quality tools have been executed." >> $GITHUB_STEP_SUMMARY
```

## Rules

1. **Triggers never change**: `pull_request` (this repo's real
   branches only — don't invent branches that don't exist),
   `workflow_dispatch` (manual re-run), `workflow_call` (so a release
   workflow, e.g. `python-publish-pypi.yml`, can call this one as a
   pre-publish gate instead of duplicating the steps).
2. **Matrix every supported runtime version** the README/manifest
   already claims support for — not just the latest one. A "3.10+"
   claim in the README with a matrix of only `["3.13"]` is a lie the
   CI itself should catch, not just prose to keep honest by hand.
3. **Setup as a local composite action**
   (`.github/actions/setup-{toolchain}/action.yml`), never inlined —
   so the same setup logic is reused by `test.yml` and the publish
   workflow without copy-paste. See `stackin-python-sdk`'s
   `setup-poetry` action for the shape (checkout toolchain → install
   package manager → cache dependency dir → conditionally install
   dependency groups).
4. **Two quality steps minimum**: a linter (fails on real problems)
   and a formatter run in `--check`/equivalent mode (fails on
   unformatted code, never silently reformats in CI — reformatting
   belongs in a pre-commit hook or an explicit local command, not a
   CI job that mutates the PR branch).
5. **Config lives in `.code_quality/`, not the workflow file, and not
   the repo root.** The lint/format commands must not embed rule
   selection or line-length flags inline — those come from the config
   file this SDK copied out of `.code_quality/{lang}/` in this
   template (see `SETUP.md`) into its **own repo's `.code_quality/`
   directory** (e.g. `stackin-python-sdk/.code_quality/ruff.toml`, not
   `stackin-python-sdk/ruff.toml`). The workflow step must pass an
   explicit `--config`/`-c` flag pointing into `.code_quality/` — never
   rely on a tool's default root-level file discovery, since the file
   isn't at the root. The workflow just invokes the tool; it doesn't
   configure it.
6. **Type-checking is optional, not required**, until a repo's
   codebase is already clean under it — adding a type-checker step to
   a repo with existing type errors just makes CI permanently red for
   no signal. Get the codebase clean locally first (see the
   `mypy.ini`/equivalent config already provided per language), *then*
   add the CI step in a follow-up PR.
7. **`if: always()` on the summary step only** — every other step
   should fail the job normally; don't swallow a real lint failure
   just to make the summary step run.

## Language-specific fill-ins

| Language | Toolchain setup | Linter | Formatter | Version matrix source |
|---|---|---|---|---|
| Python | Poetry | `ruff check` | `ruff format --check` | `pyproject.toml` `requires-python` |
| Go | `actions/setup-go` | `golangci-lint run` | `gofmt -l` (fails if any output) | `go.mod` `go` directive, plus N-1 |
| Node/TS | `actions/setup-node` | `eslint .` | `prettier --check .` | `package.json` `engines.node` |
| Ruby | `ruby/setup-ruby` | `rubocop` | `rubocop` (it's both — no separate formatter) | `.ruby-version`/gemspec |
| PHP | `shivammathur/setup-php` | `phpcs` + `phpstan analyse` | `phpcs` (PSR-12, also acts as formatter via `phpcbf` locally, not in CI) | `composer.json` `require.php` |
| Rust | `dtolnay/rust-toolchain` | `cargo clippy -- -D warnings` | `cargo fmt --check` | `Cargo.toml` `rust-version` |
| Java/Kotlin | `actions/setup-java` | `detekt`/Checkstyle | `ktlint`/`spotless` | `build.gradle`/`pom.xml` source/target version |
| Swift | `swift-actions/setup-swift` | `swiftlint` | `swift-format lint` | `Package.swift` `swift-tools-version` |
| C# | `actions/setup-dotnet` | `dotnet format --verify-no-changes` (also the formatter) | same command | `.csproj` `TargetFramework` |

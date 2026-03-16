# Nap CLI Specification

> **Nap** (Network API Protocol) — a CLI-first, test-oriented alternative to Postman, Bruno, `.http` files, and curl.

---

## Vision

Nap is a developer-first HTTP testing tool. It is as simple as curl for one-off requests, but scales to full test suites with reusable components, scripted assertions, and CI integration. It is not a GUI-first tool with a CLI bolted on — the CLI is the product.

---

## Core Principles

1. **Files are the source of truth.** All requests, tests, and playlists are plain files. Git-friendly by default.
2. **Simple things are simple.** A single HTTP call should look almost as terse as curl.
3. **Tests are reusable components.** A `.nap` file (`nap-file`) is a reusable unit. It can be composed into playlists (`naplist-file`) without modification.
4. **Scripting is opt-in and external.** F# and C# scripts live in `.fsx`/`.csx` files referenced by name (`script-fsx`, `script-csx`). Simple assertions need no scripting.
5. **No lock-in.** The format is plain text. The scripting is standard `.fsx`/`.csx`. Results emit standard formats.

---

## Usage

### `cli-run` — Run Command

```sh
# Run a single request (simplest case — as easy as curl)
napper run ./users/get-user.nap

# Run a single request with inline variable override
napper run ./users/get-user.nap --var userId=99

# Run a collection (folder)
napper run ./users/

# Run a playlist
napper run ./smoke.naplist

# Specify environment
napper run ./smoke.naplist --env staging
```

### `cli-check` — Validate Syntax

```sh
# Validate syntax without running
napper check ./smoke.naplist
```

### `cli-generate` — Generate from OpenAPI

```sh
# Generate .nap files from an OpenAPI spec
napper generate openapi ./petstore.json --output-dir ./petstore/
```

See [CLI OpenAPI Generation](./CLI-OPENAPI-GENERATION.md) for full details.

---

## CLI Flags

| Flag | Spec ID | Description |
|------|---------|-------------|
| `--env <name>` | `cli-env` | Load environment variables from `.napenv.<name>` (`env-named`) |
| `--var <key=value>` | `cli-var` | Override a variable (repeatable). Highest priority in `env-resolution` |
| `--output <format>` | `cli-output` | Output format: `output-pretty` (default), `output-junit`, `output-json`, `output-ndjson` |
| `--output-dir <dir>` | `cli-output-dir` | Destination directory for `cli-generate` |
| `--verbose` | `cli-verbose` | Enable debug-level logging |

---

## `cli-output` — Output Formats

| Format | Spec ID | Description |
|--------|---------|-------------|
| `pretty` | `output-pretty` | Human-readable console output with ANSI colors (default) |
| `junit` | `output-junit` | JUnit XML for CI/CD integration |
| `json` | `output-json` | Single JSON object per result |
| `ndjson` | `output-ndjson` | Newline-delimited JSON for streaming |

---

## `cli-exit-codes` — Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All assertions passed |
| 1 | One or more assertions failed |
| 2 | Runtime error (network, script error, parse error) |

---

## Related Specs

- [File Formats](./FILE-FORMATS-SPEC.md) — `.nap`, `.napenv`, `.naplist` format specifications
- [Scripting](./SCRIPTING-SPEC.md) — F# and C# scripting model, NapContext, NapRunner
- [CLI Plan](./CLI-PLAN.md) — Parser, project layout, implementation phases
- [OpenAPI Generation (CLI)](./CLI-OPENAPI-GENERATION.md) — Test suite generation from OpenAPI specs

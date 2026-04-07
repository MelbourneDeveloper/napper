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

## Installation

Three channels. `dotnet tool` is canonical (only channel that pins to a historical version) and is what the VSIX uses ([`vscode-cli-acquisition`](./IDE-EXTENSION-SPEC.md#vscode-cli-acquisition)). Brew/Scoop are convenience channels for end users; both track "latest from tap" only.

### `cli-install-dotnet-tool` — dotnet tool (canonical)

```sh
dotnet tool install -g napper                    # latest
dotnet tool install -g napper --version 0.12.0   # exact version
dotnet tool update  -g napper                    # update
```

Requires the **.NET 10 SDK** ([`cli-runtime-dependency`](#cli-runtime-dependency)).

### `cli-install-homebrew` — Homebrew tap (macOS / Linux)

```sh
brew tap Nimblesite/tap && brew install napper
```

Tracks latest only. Published by [`update-homebrew`](../../.github/workflows/release.yml) on every release.

### `cli-install-scoop` — Scoop bucket (Windows)

```sh
scoop bucket add Nimblesite https://github.com/Nimblesite/scoop-bucket && scoop install napper
```

Tracks latest only. Published by [`update-scoop`](../../.github/workflows/release.yml) on every release.

### `cli-runtime-dependency` — Current runtime dependency

Self-contained, trimmed, single-file `dotnet publish` targeting **`net10.0`**. End users running `napper` do not need .NET installed. The `dotnet tool install` channel does require the .NET 10 SDK at install time.

### `cli-aot-migration` — MUST: drop the .NET dependency

The CLI MUST migrate to **NativeAOT** (`PublishAot=true`). Non-negotiable. End state:

- Single statically-linked native binary per RID, zero runtime dependencies.
- Smaller (~5–10 MB vs ~17–20 MB), faster cold start (~10 ms vs ~150 ms — critical because the VSIX spawns the CLI on every save).
- Brew / Scoop / direct download become the primary channels. `dotnet tool` becomes optional.
- The VSIX install flow ([`vscode-cli-acquisition`](./IDE-EXTENSION-SPEC.md#vscode-cli-acquisition)) collapses: no more .NET SDK prerequisite, no brew/scoop/choco-install-dotnet step.

**Risks**: F# AOT has rough edges (`printf`, reflection, quotations) — anything reflection-based fails at publish time. Third-party deps must be AOT-compatible (audit required). User `.fsx` / `.csx` script hooks still need the .NET SDK after migration — that dependency is on `dotnet fsi`, not on `napper`, and is acceptable.

Tracked in [CLI-PLAN.md](../plans/CLI-PLAN.md).

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

### `cli-lsp` — Language Server

```sh
# Start the Nap language server (LSP 3.17 over stdio)
napper lsp
```

`napper lsp` runs the language server in the same process as the CLI. **The LSP and CLI are one binary** ([`lsp-one-binary`](./LSP-SPEC.md#lsp-one-binary)) — there is no separate `napper-lsp`. IDE extensions spawn `napper lsp` as a child process and communicate via JSON-RPC over stdin/stdout. While `lsp` is the active subcommand, the process MUST NOT write anything to stdout outside LSP framing — all logs go to stderr or to a file. See [LSP Specification](./LSP-SPEC.md) for capabilities and protocol details.

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
- [CLI Plan](../plans/CLI-PLAN.md) — Parser, project layout, implementation phases
- [LSP Specification](./LSP-SPEC.md) — `napper lsp` subcommand: protocol, capabilities, transport
- [LSP Plan](../plans/LSP-PLAN.md) — LSP implementation phases (same `napper` binary)
- [OpenAPI Generation (CLI)](./CLI-OPENAPI-GENERATION.md) — Test suite generation from OpenAPI specs

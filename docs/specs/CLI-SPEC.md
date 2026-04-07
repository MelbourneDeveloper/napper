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

The Napper CLI is distributed through three channels. The **canonical** channel is `dotnet tool` via NuGet — it is the only channel that supports installing an arbitrary historical version of `napper`, and it is what the VSIX uses internally to guarantee an exact version match against the extension version. The Homebrew tap and Scoop bucket exist for end users who prefer their native package manager and are willing to accept "latest from tap".

### `cli-install-dotnet-tool` — dotnet tool (canonical)

```sh
# Install globally
dotnet tool install -g napper

# Install a specific version
dotnet tool install -g napper --version 0.12.0

# Update to latest
dotnet tool update -g napper
```

This requires the **.NET 10 SDK** (see [`cli-runtime-dependency`](#cli-runtime-dependency)). The dotnet tool channel is the only one that supports `--version` pinning to an arbitrary historical release. The VSIX extension uses this channel exclusively to install the CLI — see [`vscode-cli-acquisition`](./IDE-EXTENSION-SPEC.md#vscode-cli-acquisition).

### `cli-install-homebrew` — Homebrew tap (macOS / Linux)

```sh
brew tap Nimblesite/tap
brew install napper
```

The `Nimblesite/homebrew-tap` formula tracks the latest Napper release. It always installs the most recent version published to the tap by the release workflow ([`update-homebrew` job in `.github/workflows/release.yml`](../../.github/workflows/release.yml)). Homebrew does not support pinning to an arbitrary historical version with a single-formula tap, so users who need an exact older version should use the dotnet tool channel.

### `cli-install-scoop` — Scoop bucket (Windows)

```sh
scoop bucket add Nimblesite https://github.com/Nimblesite/scoop-bucket
scoop install napper
```

The `Nimblesite/scoop-bucket` manifest tracks the latest Napper release. It always installs the most recent version published to the bucket by the release workflow ([`update-scoop` job in `.github/workflows/release.yml`](../../.github/workflows/release.yml)). Scoop's `@version` syntax requires the bucket to maintain an `archived/` versions folder, which the simple manifest pattern does not, so users who need an exact older version should use the dotnet tool channel.

### `cli-runtime-dependency` — Current runtime dependency

The Napper CLI is currently a self-contained, trimmed, single-file `dotnet publish` binary targeting **`.NET 10` (`net10.0`)**. The published binary bundles the .NET runtime, so end users do **not** need .NET installed to run `napper run …`. **However**, the canonical install channel (`dotnet tool install`) requires the .NET 10 SDK to be present at install time.

### `cli-aot-migration` — Future: drop the .NET dependency entirely

**This is a hard requirement, not a stretch goal.** Eventually the Napper CLI MUST be migrated off the .NET runtime dependency by switching to **NativeAOT** (`PublishAot=true`). The end state:

- `napper` ships as a single statically-linked native executable per RID, with **zero runtime dependencies** — no .NET SDK, no .NET runtime, no JIT.
- The dotnet tool channel can be **deprecated** (or kept as a convenience for .NET developers) once Homebrew, Scoop, and a NativeAOT-built standalone binary are the primary channels.
- Brew and Scoop install the AOT binary directly, with no .NET prerequisite — the VSIX install flow ([`vscode-cli-acquisition`](./IDE-EXTENSION-SPEC.md#vscode-cli-acquisition)) collapses to "PATH probe → brew/scoop install → tank", with no `dotnet tool` step at all.
- The release workflow's `build-cli` matrix continues to produce raw binaries and archives, but the published binaries are AOT-compiled instead of self-contained .NET.

**Why this is non-negotiable:**

- **Install size**: Self-contained .NET trimmed publishes are ~17–20 MB per RID. NativeAOT binaries for an F# CLI of this scope target ~5–10 MB.
- **Cold start**: NativeAOT eliminates JIT warmup, dropping `napper --version` start time from ~150 ms to ~10 ms. Critical for editor integration where the VSIX spawns the CLI on every save.
- **Install friction**: The dotnet tool channel requires the .NET 10 SDK as a prerequisite. The VSIX currently has to install the SDK via brew/scoop/choco on first activation if it is missing — see [`vscode-cli-acq-install-dotnet`](./IDE-EXTENSION-SPEC.md#vscode-cli-acquisition). After AOT migration, this entire branch of the install algorithm disappears.
- **Distribution**: AOT binaries are signable and notarisable per-platform. The dotnet tool path delegates trust to NuGet but still ships unsigned native code at runtime.

**Known blockers / risks:**

- F# AOT support is functional but has rougher edges than C# AOT — particularly around `printf` family functions, reflection-based serialisation, and quotations. Any code path that uses runtime reflection will fail at trim/publish time and must be rewritten.
- F# scripting hooks (`.fsx`) and C# scripting hooks (`.csx`) executed via `dotnet fsi`/`dotnet-script` will continue to require the .NET SDK on the user's machine **regardless** of whether `napper` itself is AOT-compiled. The AOT migration drops the dependency for the CLI's own execution; it does **not** drop it for user scripts. This is acceptable — script-using projects already need .NET — but should be documented prominently.
- The third-party libraries Napper depends on (TOML parser, JSONPath, etc.) must all be AOT-compatible. Audit before migration.

**Migration is tracked in [CLI-PLAN.md](../plans/CLI-PLAN.md).**

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

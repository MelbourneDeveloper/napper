# Nap Language Server — Specification

> The Napper language server is **not a separate binary**. It is a subcommand of the `napper` CLI: `napper lsp` runs the LSP over stdio. **One binary. One install. One version.** The LSP and CLI are the same artifact.

---

## `lsp-one-binary` — One Binary

The CLI and the LSP ship as a single `napper` executable. Running `napper run …` executes a `.nap` file. Running `napper lsp` starts the language server, reads JSON-RPC from stdin, and writes JSON-RPC to stdout. There is no `napper-lsp`, no `nap-lsp`, no separate NuGet package, no separate brew formula, no separate version-resolution path. The version reported by `napper --version` is the version of every capability in the binary, including the LSP.

This is non-negotiable. Any change that splits the LSP back out into its own binary is a regression. When [`cli-aot-migration`](./CLI-SPEC.md#cli-aot-migration) lands, the AOT-compiled `napper` binary still contains the LSP — exactly the same way.

---

## Architecture

```mermaid
graph TB
    subgraph IDEs
        VS[VSCode Extension<br/>TypeScript]
        ZD[Zed Extension<br/>Rust/WASM]
        NV[Neovim Plugin<br/>Lua]
    end

    subgraph "napper (single F# binary)"
        ENTRY["Program.fs<br/>napper run / check / lsp / ..."]
        CLI_HANDLERS[CLI subcommands]
        LSP_HANDLERS["LSP handlers<br/>(napper lsp subcommand)"]
        subgraph "Napper.Core (shared library)"
            PARSER[Parser.fs]
            ENV[Environment.fs]
            TYPES[Types.fs]
            LOGGER[Logger.fs]
        end
    end

    VS -->|spawn 'napper lsp', stdio| ENTRY
    ZD -->|spawn 'napper lsp', stdio| ENTRY
    NV -->|spawn 'napper lsp', stdio| ENTRY
    VS -->|spawn 'napper run', exec| ENTRY
    ZD -->|spawn 'napper run', exec| ENTRY
    ENTRY --> CLI_HANDLERS
    ENTRY --> LSP_HANDLERS
    CLI_HANDLERS --> PARSER
    CLI_HANDLERS --> ENV
    LSP_HANDLERS --> PARSER
    LSP_HANDLERS --> ENV
    LSP_HANDLERS --> TYPES
```

---

## Design Principles

- **One binary.** [`lsp-one-binary`](#lsp-one-binary). The LSP is a subcommand of `napper`, not a separate executable.
- **⚠️ ZERO duplicated logic.** LSP handler code MUST NOT contain parsing, types, environment resolution, or any domain logic. Those live in `Napper.Core` and are shared with the CLI subcommands. The LSP layer is a thin protocol adapter that calls `Napper.Core` functions and translates results to LSP responses.
- **Napper.Core is the single source of truth.** Every CLI subcommand and every LSP handler calls into `Napper.Core`. Any new capability the LSP needs that could be useful to the CLI MUST be added to `Napper.Core`.
- **Protocol-only coupling.** IDE extensions communicate with the LSP exclusively via JSON-RPC over stdio. No IDE-specific code in the F# binary.
- **Incremental.** Each LSP capability ships independently. The server advertises only what it supports.

---

## Transport

| Property | Value |
|----------|-------|
| Launch | `napper lsp` (subcommand) |
| Transport | stdio (stdin/stdout) |
| Protocol | JSON-RPC 2.0 (LSP 3.17) |
| Encoding | UTF-8 |

IDE extensions spawn `napper lsp` as a child process and communicate over stdin/stdout. No TCP, no WebSocket, no HTTP. The `napper lsp` subcommand takes over stdio for the lifetime of the process — it MUST NOT print anything to stdout outside of LSP framing, and MUST log to stderr or to a file (never stdout).

---

## ⚠️ The LSP Replaces Duplicated IDE Logic

The VSIX currently reimplements `.nap` file parsing in TypeScript — extracting HTTP methods, URLs, playlist steps, and environment names. This is **duplicated logic** that already exists in `Napper.Core` F#. The LSP eliminates this duplication: all IDEs ask the LSP, the LSP calls `Napper.Core`, done. **Less TypeScript, less Rust, MORE F#.**

| Duplicated VSIX Logic | Replaced By |
|-----------------------|-------------|
| `extractHttpMethod` (TS) — re-parses `.nap` to find method | `textDocument/documentSymbol` — LSP parses once via `Napper.Core.Parser` |
| `parseMethodAndUrl` (TS) — re-parses `.nap` for curl copy | `napper/requestInfo` — custom LSP request |
| `parsePlaylistStepPaths` (TS) — re-parses `.naplist` for steps | `textDocument/documentSymbol` — LSP parses via `Napper.Core.Parser` |
| `detectEnvironments` (TS) — scans `.napenv.*` files | `napper/environments` — custom LSP request |
| CodeLens section detection (TS) — finds `[request]` lines | `textDocument/documentSymbol` — sections with line ranges |

---

## Capabilities

### `lsp-custom` — Custom Requests (Napper-specific)

These are non-standard LSP requests that provide structured data to all IDEs. They replace duplicated parsing logic in TypeScript/Rust.

| Method | Params | Returns | Replaces |
|--------|--------|---------|----------|
| `napper/requestInfo` | `{ uri: string }` | `{ method: string, url: string, headers: Record<string, string> }` | `parseMethodAndUrl` in TS |
| `napper/environments` | `{ rootUri: string }` | `{ environments: string[] }` | `detectEnvironments` in TS |
| `napper/curlCommand` | `{ uri: string }` | `{ curl: string }` | curl generation in TS |

**Implementation:** All three call `Napper.Core` functions — `Parser.parseNapFile`, `Environment.detectEnvironmentNames` (new), `CurlGenerator.toCurl` (new).

### `lsp-completions` — Completions

Triggered on typing within `.nap` and `.naplist` files.

| Context | Completion Items |
|---------|-----------------|
| After `method =` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| After `[request.headers]` key position | Common HTTP headers: `Content-Type`, `Authorization`, `Accept`, `Cache-Control`, `User-Agent`, ... |
| Inside `{{` | Variable names from `.napenv` files in the workspace |
| After `status` in `[assert]` | Common HTTP status codes: `200`, `201`, `400`, `401`, `404`, `500`, ... |
| After assertion target | Assertion operators: `=`, `exists`, `contains`, `matches`, `<`, `>` |
| `[steps]` block in `.naplist` | `.nap` and `.naplist` file paths from the workspace |

**Implementation:** Parse the document up to the cursor position using `Napper.Core.Parser`. Determine the current section (`[meta]`, `[request]`, `[assert]`, etc.) and offer context-appropriate items.

### `lsp-diagnostics` — Diagnostics

Published on `textDocument/didOpen` and `textDocument/didChange`.

| Diagnostic | Severity | Condition |
|-----------|----------|-----------|
| Parse error | Error | `Napper.Core.Parser.parseNapFile` returns `Error` |
| Unknown variable | Warning | `{{name}}` referenced but not defined in any `.napenv` file or `[vars]` block |
| Missing `[request]` block | Error | Full `.nap` file has no `[request]` section |
| Invalid assertion syntax | Error | Assertion line doesn't match any known operator pattern |
| Unreachable script path | Warning | `[script]` `pre` or `post` path does not exist on disk |
| Missing step file | Warning | `.naplist` step references a file that doesn't exist |

**Implementation:** Run `Napper.Core.Parser.parseNapFile` or `parseNapList`. For variable diagnostics, scan for `{{...}}` patterns and check against `Napper.Core.Environment.loadEnvironment`. Report diagnostics with line/column positions from FParsec error info.

### `lsp-hover` — Hover

| Hover Target | Display |
|-------------|---------|
| `{{variable}}` | Resolved value from the active environment. If sourced from `.napenv.local`, show `******` (masked). |
| Section header (`[request]`, `[assert]`, etc.) | Brief description of the section's purpose |
| HTTP method keyword | Method description (e.g., "GET — Safe, idempotent retrieval") |
| Assertion operator | Operator description (e.g., "contains — checks if the value includes the substring") |

**Implementation:** Parse the document, locate the token under the cursor, resolve variables using `Napper.Core.Environment`.

### `lsp-symbols` — Document Symbols

Expose file structure for outline navigation (Ctrl+Shift+O in VSCode, symbol search in Zed).

| Symbol | Kind | Scope |
|--------|------|-------|
| `[meta]` | `Namespace` | `.nap`, `.naplist` |
| `[request]` | `Function` | `.nap` |
| `[request.headers]` | `Struct` | `.nap` |
| `[request.body]` | `Struct` | `.nap` |
| `[assert]` | `Function` | `.nap` |
| `[script]` | `Function` | `.nap` |
| `[vars]` | `Variable` | `.nap`, `.naplist` |
| `[steps]` | `Array` | `.naplist` |

**Implementation:** Walk the parsed AST from `Napper.Core.Parser` and emit `DocumentSymbol` entries with line ranges.

---

## File Watching

The LSP watches the workspace for changes to `.napenv`, `.napenv.*`, and `.napenv.local` files. When these change, the server:

1. Reloads the environment using `Napper.Core.Environment.loadEnvironment`
2. Re-publishes diagnostics for all open `.nap` files (unknown variable warnings may appear or disappear)
3. Updates hover resolution for `{{variable}}` tokens

The server registers `workspace/didChangeWatchedFiles` for these glob patterns:
- `**/.napenv`
- `**/.napenv.*`

---

## Configuration

The LSP accepts configuration via `workspace/didChangeConfiguration` and `initializationOptions`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `nap.environment` | `string` | `""` | Active environment name (selects `.napenv.{name}`) |
| `nap.maskSecrets` | `bool` | `true` | Mask values from `.napenv.local` in hover |

---

## Supported File Types

| Extension | Language ID | Features |
|-----------|------------|----------|
| `.nap` | `nap` | All capabilities |
| `.naplist` | `naplist` | Completions (steps), diagnostics, symbols |
| `.napenv` | `napenv` | Hover (show which files reference each variable) |

---

## Error Handling

- Parse errors from FParsec are mapped to LSP `Diagnostic` objects with precise line/column positions.
- The server never crashes on malformed input. All handlers catch exceptions and log via `Napper.Core.Logger`.
- If the workspace has no `.napenv` files, variable-related features degrade gracefully (no completions, no hover values, but no errors either).

---

## Distribution

The LSP has no separate distribution. It ships inside `napper`:

- **NuGet** — `dotnet tool install -g napper` ([`cli-install-dotnet-tool`](./CLI-SPEC.md#cli-install-dotnet-tool)). The LSP is the same binary; you launch it via `napper lsp`.
- **Homebrew tap** — `brew install napper` ([`cli-install-homebrew`](./CLI-SPEC.md#cli-install-homebrew)).
- **Scoop bucket** — `scoop install napper` ([`cli-install-scoop`](./CLI-SPEC.md#cli-install-scoop)).

The VSIX install resolver ([`vscode-cli-acquisition`](./IDE-EXTENSION-SPEC.md#vscode-cli-acquisition)) installs `napper` once. That single install gives you the LSP for free — no second download, no second version pin, no second discovery step.

## Discovery

IDE extensions launch the language server by spawning `<resolved-napper-path> lsp`. The resolved path is whatever the install resolver settled on (`napper` from `nap.cliPath`, the user's `PATH`, or the dotnet tools directory). There is no separate `nap-lsp` lookup — the LSP is reachable iff the CLI is reachable, by definition.

---

## Related Specs

- [CLI Spec](./CLI-SPEC.md) — `napper` CLI subcommands including `napper lsp`
- [IDE Extension Spec](./IDE-EXTENSION-SPEC.md) — Feature matrix and IDE-specific behaviour
- [IDE Extension Install Plan](../plans/IDE-EXTENSION-INSTALL-PLAN.md) — VSIX CLI install resolver (the same install gives you the LSP)
- [IDE Extension Plan (VSCode)](../plans/IDE-EXTENSION-PLAN.md) — VSCode implementation phases
- [Zed Extension Plan](../plans/ZED-EXTENSION-PLAN.md) — Zed implementation phases
- [File Formats Spec](./FILE-FORMATS-SPEC.md) — `.nap`, `.naplist`, `.napenv` format definitions
- [LSP Implementation Plan](../plans/LSP-PLAN.md) — Implementation phases and TODO

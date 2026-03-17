# Nap Language Server — Implementation Plan

The LSP is a **thin F# project** (`Napper.Lsp`) that references `Napper.Core` directly. It contains ONLY LSP protocol adapters — all parsing, types, environment resolution, and logging come from `Napper.Core`, the same shared library used by `Napper.Cli`. **Zero duplicated domain logic. Period.**

---

## ⛔️ DO NOT BREAK EXISTING FUNCTIONALITY

**The LSP is a PARALLEL project.** It does NOT touch the existing VSIX, CLI, or tests until the cutover phase.

- **DO NOT modify any existing TypeScript files in `src/Napper.VsCode/`**
- **DO NOT modify any existing F# files in `src/Napper.Core/` or `src/Napper.Cli/`** (unless adding new public functions for LSP consumption — and those MUST NOT change existing signatures or behaviour)
- **DO NOT modify or delete any existing tests**
- **ALL existing tests MUST continue to pass at all times**
- **The cutover happens ONLY after the LSP is stable and its own tests pass**

If you need to add a function to `Napper.Core` for the LSP, that's fine — but it's an ADDITION, not a modification. Existing code stays untouched.

---

## Strategy: Build Parallel, Cut Across Clean

The goal is to **move logic OUT of TypeScript/Rust and INTO F#**. The VSIX currently reimplements parsing logic that already exists in `Napper.Core`. After cutover, the VSIX becomes a thin UI shell — it asks the LSP for data and renders it. Same for Zed. Same for Neovim. **Less TypeScript, less Rust, MORE F#.**

```mermaid
graph LR
    subgraph "Phase 1-2: Build LSP (parallel)"
        LSP[Napper.Lsp project] -->|references| CORE[Napper.Core]
        LSPT[Napper.Lsp.Tests] -->|tests| LSP
    end

    subgraph "Existing (UNTOUCHED)"
        CLI[Napper.Cli] -->|references| CORE
        VSIX[Napper.VsCode VSIX]
        TESTS[All existing tests]
    end

    subgraph "Phase 3: Cutover"
        VSIX2[VSIX wires up<br/>vscode-languageclient] -->|stdio| LSP2[napper-lsp binary]
        ZED[Zed extension] -->|stdio| LSP2
    end
```

---

## What the VSIX Does TODAY That Belongs in the LSP

The VSIX currently **reimplements parsing logic in TypeScript** that already exists in `Napper.Core` F#. This is duplicated code that MUST move to the LSP so all IDEs share it.

| VSIX Logic (TypeScript) | What it does | Where it should live | Napper.Core function |
|------------------------|-------------|---------------------|---------------------|
| `explorerProvider.ts:54-68` `extractHttpMethod` | Parses `.nap` file to find HTTP method | **LSP** — document symbols / custom request | `Parser.parseNapFile` (already exists) |
| `curlCopy.ts:59-68` `parseMethodAndUrl` | Parses `.nap` file to extract method + URL | **LSP** — custom request `napper/requestInfo` | `Parser.parseNapFile` (already exists) |
| `explorerProvider.ts:120-136` `parsePlaylistStepPaths` | Parses `.naplist` to extract step file paths | **LSP** — document symbols / custom request | `Parser.parseNapList` (already exists) |
| `environmentSwitcher.ts:8-39` `detectEnvironments` | Scans `.napenv.*` files to list environment names | **LSP** — custom request `napper/environments` | `Environment.fs` (needs new function) |
| `curlCopy.ts:70-82` curl generation | Builds `curl -X METHOD 'URL'` string | **Napper.Core** — new `CurlGenerator` module | Does not exist yet — add to Core |
| `codeLensProvider.ts:44-68` section detection | Finds `[request]` and shorthand lines for CodeLens | **LSP** — document symbols gives this for free | `Parser.parseNapFile` (already exists) |

After cutover, the VSIX TypeScript code for all of the above gets **deleted** and replaced with LSP calls. The Zed extension and Neovim get the same data without writing a single line of TypeScript or Rust parsing code.

```mermaid
graph TB
    subgraph "BEFORE: Duplicated parsing in each IDE"
        VS_TS[VSCode TypeScript<br/>extractHttpMethod<br/>parseMethodAndUrl<br/>parsePlaylistStepPaths<br/>detectEnvironments] --> FILES[.nap / .naplist / .napenv files]
        ZED_RS[Zed Rust<br/>would need same logic] --> FILES
    end

    subgraph "AFTER: Single source of truth in LSP"
        VS2[VSCode — thin UI shell] -->|LSP requests| LSP[napper-lsp F#]
        ZED2[Zed — thin UI shell] -->|LSP requests| LSP
        NV2[Neovim — thin UI shell] -->|LSP requests| LSP
        LSP -->|calls| CORE[Napper.Core<br/>Parser.fs / Environment.fs]
        CORE --> FILES2[.nap / .naplist / .napenv files]
    end
```

---

## Project Structure

```
src/Napper.Lsp/
├── Napper.Lsp.fsproj       # References Napper.Core, depends on Ionide.LanguageServerProtocol
├── Client.fs                # LSP client wrapper for notifications back to IDE
├── Server.fs                # LSP server — lifecycle, document sync, symbols, custom requests
├── Workspace.fs             # Workspace state: open documents, loaded environments
└── Program.fs               # Entry point: stdio transport, server init
```

```mermaid
graph TD
    PROGRAM[Program.fs<br/>Entry point + stdio] --> SERVER[Server.fs<br/>Lifecycle + handlers]
    SERVER --> WS[Workspace.fs<br/>Docs + env state]

    WS --> CORE_P[Napper.Core.Parser]
    WS --> CORE_E[Napper.Core.Environment]
    WS --> CORE_T[Napper.Core.Types]
    WS --> CORE_L[Napper.Core.Logger]
```

---

## ⚠️ Code Sharing with Napper.Core — MANDATORY

**`Napper.Lsp` contains ONLY LSP protocol glue.** All domain logic lives in `Napper.Core` and is shared with `Napper.Cli`. If the LSP needs a capability that doesn't exist in `Napper.Core` yet, ADD IT TO `Napper.Core` — do NOT put it in `Napper.Lsp`. This is non-negotiable.

The rule is simple: **if it's not LSP protocol code, it goes in `Napper.Core`.**

Examples of what belongs where:
- Parsing a `.nap` file → `Napper.Core.Parser` (already exists)
- Extracting variable names from a parsed file → `Napper.Core` (add if missing)
- Mapping a parse error to an LSP Diagnostic → `Napper.Lsp` (protocol glue)
- Scanning for `{{variables}}` in a string → `Napper.Core` (already exists in Environment.fs)
- Generating a curl command → `Napper.Core` (add new module)
- Listing environment names → `Napper.Core.Environment` (add new function)
- Formatting an LSP CompletionItem → `Napper.Lsp` (protocol glue)

| Napper.Core Module | LSP Usage |
|-------------------|-----------|
| `Parser.parseNapFile` | Document symbols, request info, CodeLens data, diagnostics |
| `Parser.parseNapList` | Document symbols, step listing, diagnostics |
| `Environment.parseEnvFile` | Variable completions, hover values |
| `Environment.resolveVars` | Hover display |
| `Environment.loadEnvironment` | Variable diagnostics |
| `Environment.detectEnvironments` | **NEW** — list available env names for IDE switcher |
| `CurlGenerator.toCurl` | **NEW** — generate curl command from parsed request |
| `Types.*` | All handlers |
| `Logger.*` | All handlers |

---

## Implementation Phases

### Phase 1 — Project Scaffold + Document Sync

Set up the F# project, wire up JSON-RPC over stdio, and implement document synchronization. **No existing code is modified.**

- Create `Napper.Lsp.fsproj` referencing `Napper.Core` and `Ionide.LanguageServerProtocol`
- Add project to `Napper.slnx`
- Implement `Program.fs` — stdio transport, server lifecycle
- Implement `Server.fs` — `initialize`/`initialized`/`shutdown` handlers, capability advertisement
- Implement `Workspace.fs` — in-memory document store (`didOpen`, `didChange`, `didClose`)
- Verify the server starts, handshakes, and tracks open documents

### Phase 2 — Shared Features + Tests

Build the LSP features that REPLACE duplicated TypeScript/Rust logic. These are not new features — they are existing VSIX capabilities moved to F# so all IDEs share them. Also: thorough integration tests over JSON-RPC stdio.

**Document Symbols** — replaces `extractHttpMethod`, `parsePlaylistStepPaths`, and CodeLens section detection in TypeScript:
- `textDocument/documentSymbol` for `.nap` files — sections with line ranges, HTTP method + URL
- `textDocument/documentSymbol` for `.naplist` files — sections with step listing

**Custom LSP Requests** — replaces `parseMethodAndUrl`, `detectEnvironments` in TypeScript:
- `napper/requestInfo` — given a `.nap` file URI, return `{ method, url, headers }` (parsed by `Napper.Core.Parser`)
- `napper/environments` — scan workspace for `.napenv.*` files, return list of environment names
- `napper/curlCommand` — given a `.nap` file URI, return the curl command string

**Napper.Core additions** (shared with CLI):
- `Environment.detectEnvironmentNames` — scan a directory for `.napenv.*` files and return env names
- `CurlGenerator.toCurl` — generate curl string from a `NapRequest`

**Tests** — every test launches the real `napper-lsp` binary and talks JSON-RPC over stdio:
- All Phase 1 lifecycle tests (already done)
- Test: `textDocument/documentSymbol` returns sections for valid `.nap` file
- Test: `textDocument/documentSymbol` returns sections for valid `.naplist` file
- Test: `napper/requestInfo` returns method + URL from parsed `.nap` file
- Test: `napper/environments` returns env names from workspace
- Test: `napper/curlCommand` returns correct curl string
- **ALL existing F# tests still pass**
- **ALL existing VSIX e2e tests still pass**

### Phase 3 — Cutover (VSIX + Zed Wire Up)

**Only after Phase 2 is complete and all tests pass.**

- Add `vscode-languageclient` dependency to VSIX
- Wire up VSIX to launch `napper-lsp` over stdio on activation
- Zed extension: implement `language_server_command` in `lib.rs` to launch `napper-lsp`
- **DELETE** duplicated TypeScript parsing code (`extractHttpMethod`, `parseMethodAndUrl`, `parsePlaylistStepPaths`, `detectEnvironments`) — replace with LSP calls
- Verify: existing VSIX features work exactly as before (now powered by LSP)
- **Run ALL existing VSIX e2e tests — every single one must pass**
- **Run ALL existing F# tests — must pass**

### Phase 4 — Post-Cutover: New LSP Features

These are genuinely NEW capabilities that don't exist in any IDE today.

- Diagnostics (`Diagnostics.fs`) — parse errors, unknown variables, missing blocks
- Completions (`Completions.fs`) — HTTP methods, headers, variables, status codes, operators
- Hover (`Hover.fs`) — variable resolution, section descriptions, secret masking
- Configuration — `workspace/didChangeConfiguration` for environment name and mask settings
- File watching — `.napenv` changes trigger revalidation

Each feature gets its own LSP integration tests (same approach: real binary, real JSON-RPC, real assertions).

---

## Testing Strategy

**No unit tests. No mocks. LSP integration tests ONLY.**

Every test:
1. Launches the `napper-lsp` binary as a subprocess
2. Sends LSP JSON-RPC messages over stdin (the exact same protocol VSCode/Zed use)
3. Reads LSP JSON-RPC responses from stdout
4. Asserts on the responses

This is the same communication path the real IDEs use. If the tests pass, the IDEs work.

- **Napper.Core tests already cover** parsing, environment resolution, and types — do NOT re-test those.
- **Existing VSIX e2e tests**: Must pass before AND after cutover. These are the acceptance criteria.
- **Existing F# tests**: Must pass at all times. Run them before every change.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `Ionide.LanguageServerProtocol` | LSP types and JSON-RPC server framework |
| `Napper.Core` (project ref) | Parser, types, environment, logger |

No other dependencies. The LSP is lightweight by design.

---

## TODO

### Phase 1 — Project Scaffold + Document Sync
- [x] Create `Napper.Lsp.fsproj` with `Napper.Core` project reference
- [x] Add `Ionide.LanguageServerProtocol` package reference
- [x] Add `Napper.Lsp` to `Napper.slnx`
- [x] Implement `Program.fs` — stdio transport and server lifecycle
- [x] Implement `Server.fs` — initialize/shutdown, capability registration
- [x] Implement `Workspace.fs` — document store (didOpen/didChange/didClose)

### Phase 2 — Shared Features + Tests
- [x] Create `Napper.Lsp.Tests` project
- [x] Test: initialize handshake (JSON-RPC over stdio)
- [x] Test: initialized notification
- [x] Test: textDocument/didOpen
- [x] Test: textDocument/didChange
- [x] Test: textDocument/didClose
- [x] Test: shutdown + exit lifecycle
- [x] Test: malformed JSON-RPC handled gracefully
- [x] Test: unknown method returns LSP error
- [x] Verify all existing projects build (zero warnings, zero errors)
- [x] Add `SectionScanner` to `Napper.Core` (section positions for document symbols)
- [x] Add `Environment.detectEnvironmentNames` to `Napper.Core`
- [x] Add `CurlGenerator.toCurl` to `Napper.Core`
- [x] Implement `textDocument/documentSymbol` for `.nap` files (sections + method + URL)
- [x] Implement `textDocument/documentSymbol` for `.naplist` files (sections + steps)
- [x] Implement `textDocument/codeLens` for `.nap` files (request section detection)
- [x] Implement `workspace/executeCommand` `napper.requestInfo` (method, URL, headers)
- [x] Implement `workspace/executeCommand` `napper.copyCurl` (curl string)
- [x] Implement `workspace/executeCommand` `napper.listEnvironments` (env names)
- [x] Test: documentSymbol returns sections for `.nap` file
- [x] Test: documentSymbol returns sections for `.naplist` file
- [x] Test: codeLens returns lenses for `.nap` file
- [x] Test: `napper.requestInfo` returns parsed method + URL
- [x] Test: `napper.copyCurl` returns curl string
- [x] Test: `napper.listEnvironments` returns env names
- [ ] Verify ALL existing F# tests pass
- [ ] Verify ALL existing VSIX e2e tests pass

### Phase 3 — Cutover
- [ ] Add `vscode-languageclient` to VSIX
- [ ] Wire VSIX to launch `napper-lsp` on activation
- [ ] Wire Zed `language_server_command` to launch `napper-lsp`
- [ ] Delete duplicated TS parsing code, replace with LSP calls
- [ ] Verify existing VSIX features unchanged
- [ ] Run ALL existing VSIX e2e tests — must pass
- [ ] Run ALL existing F# tests — must pass

### Phase 4 — Post-Cutover: New LSP Features
- [ ] Diagnostics (parse errors, unknown variables, missing blocks)
- [ ] Completions (methods, headers, variables, status codes, operators)
- [ ] Hover (variable resolution, secret masking, descriptions)
- [ ] Configuration (environment name, mask settings)
- [ ] File watching (.napenv changes)
- [ ] Integration tests for each new feature (JSON-RPC over stdio)

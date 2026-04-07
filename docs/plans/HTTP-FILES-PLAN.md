# .http File Compatibility — Implementation Plan

---

## Architecture

The parser lives in a **standalone project `DotHttp`** (publishable as a NuGet package) with zero dependency on Napper.Core. The converter lives in Napper.Core and maps parsed types to `.nap` file content.

```
DotHttp/            →    Napper.Core/HttpToNapConverter.fs
  Types.fs                    (maps HttpFile → .nap content
  Parser.fs (FParsec)          using OpenApiTypes constants)
```

### Key Modules

| Module | Location | Responsibility |
|--------|----------|---------------|
| `Types` | `DotHttp/Types.fs` | `HttpRequest`, `HttpFile`, `HttpDialect` types |
| `Parser` | `DotHttp/Parser.fs` | FParsec parser: `.http` text → `HttpFile` |
| `HttpToNapConverter` | `Napper.Core/HttpToNapConverter.fs` | Map `HttpFile` → `.nap` file content + env conversion |

### Types

```fsharp
type HttpDialect = Microsoft | JetBrains | Common

type HttpRequest =
    { Name: string option
      Method: string
      Url: string
      HttpVersion: string option
      Headers: (string * string) list
      Body: string option
      PreScript: string option
      PostScript: string option
      Comments: string list }

type HttpFile =
    { Requests: HttpRequest list
      FileVariables: (string * string) list   // @var = value (MS dialect)
      Dialect: HttpDialect }

type HttpEnv =
    { Environments: Map<string, Map<string, string>>
      PrivateEnvironments: Map<string, Map<string, string>> }

type ConvertResult =
    { GeneratedFiles: (string * string) list   // (path, content)
      Warnings: string list }
```

---

## Parser Design

The `.http` parser uses **FParsec** (already a project dependency) with a state-tracking line-by-line approach. For files with JetBrains inline scripts (`< {% ... %}`), a streaming FParsec parser handles multiline script blocks. FParsec was chosen because no official .http file parser exists as a NuGet package — the `DotHttp` project is intended to fill this gap and be published independently.

### State Machine

```
                    ┌──────────┐
         ┌─────────│   IDLE   │◄────── ### separator
         │         └────┬─────┘
         │              │ METHOD line detected
         │              ▼
         │         ┌──────────┐
         │         │ HEADERS  │◄────── Key: Value lines
         │         └────┬─────┘
         │              │ blank line
         │              ▼
         │         ┌──────────┐
         │         │   BODY   │◄────── non-separator lines
         │         └────┬─────┘
         │              │ ### or EOF
         └──────────────┘
```

**Method detection:** A line starts with a known HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`) followed by a space and a URL.

**Header detection:** A line matches `NonWhitespace: AnyText` (colon-separated with no leading whitespace).

**Dialect detection** runs as a pre-pass over the file, looking for `@var = value` (MS) or `< {%` / `> {%` (JB) patterns before parsing.

---

## Implementation Phases

### Phase 1 — Core Converter (Common Subset)

Parse the `http-shared` common subset and generate `.nap` files.

**Scope:**
- Parse `###`-separated requests with method line, headers, and body
- Generate one `.nap` file per request
- Map `{{variable}}` interpolation (already identical syntax)
- Numeric prefix naming (`01_name.nap`, `02_name.nap`)
- `--output-dir` and `--dry-run` flags
- CLI entry point: `napper convert http <input> --output-dir <dir>`

**Testing:**
- Unit tests: parser correctness on sample `.http` files
- E2e tests: `napper convert http` CLI command produces expected `.nap` files
- Edge cases: empty bodies, no headers, multiple requests, trailing newlines

### Phase 2 — Dialect-Specific Features

Add Microsoft and JetBrains dialect support.

**Microsoft:**
- Parse `@variable = value` file-level variables → `[vars]` block
- Parse `# @name requestName` → `[meta] name`

**JetBrains:**
- Parse `http-client.env.json` → `.napenv.*` files
- Parse `http-client.private.env.json` → `.napenv.local`
- Detect and warn on unsupported features (WebSocket, gRPC, GraphQL, `import`/`run`)
- Simple assertion extraction from `> {% ... %}` response handlers

**Testing:**
- Unit tests: dialect detection accuracy
- Unit tests: environment file conversion
- E2e tests: convert real-world JetBrains HTTP Client files
- E2e tests: convert real-world REST Client (VS Code) files

### Phase 3 — IDE Integration

Add converter commands to IDE extensions.

**VSCode:**
- `Nap: Convert .http File` command
- `Nap: Convert .http Directory` command
- CodeLens on `.http` files showing `Convert to .nap`
- Post-conversion: open generated files

**Zed:**
- `/nap-convert-http` slash command

**Testing:**
- VSCode e2e: command execution, file creation, editor opens
- Zed: manual testing (no automated e2e framework)

### Phase 4 — Direct Execution (Future)

`napper run file.http` converts in-memory and executes.

**Scope:**
- Detect `.http` extension in `napper run` → parse → convert to in-memory `NapFile` → execute
- `--request <name>` flag to select a specific request from multi-request files
- `--env` flag reads `http-client.env.json` when running `.http` files

**Testing:**
- E2e tests: `napper run file.http` returns expected output
- E2e tests: `--request` flag filters correctly

---

## Open Questions

1. **`.rest` extension** — JetBrains and REST Client also support `.rest` as an alias for `.http`. Should Nap treat them identically? **Recommendation: yes.**
2. **Round-trip fidelity** — Should the converter preserve original comments in the `.nap` output? **Recommendation: yes, as `#` comments above the relevant section.**
3. **Playlist generation** — When converting a directory, should a `.naplist` be generated for the converted files? **Recommendation: yes, matching the OpenAPI generator pattern.**
4. **Incremental conversion** — Should re-running the converter on an already-converted directory be safe (skip existing, only add new)? **Recommendation: yes, `--overwrite` opt-in for replacement.**

---

## TODO

### Phase 1 — Core Converter (Common Subset)
- [x] Define `HttpRequest` and `HttpFile` types — `DotHttp/Types.fs`
- [x] Implement FParsec `.http` parser with state-tracking line-by-line approach — `DotHttp/Parser.fs`
- [x] Implement `HttpToNapConverter` mapping — `Napper.Core/HttpToNapConverter.fs`
- [x] Wire up `napper convert http` CLI command — `Napper.Cli/Program.fs`
- [x] `--output-dir` flag
- [x] `--dry-run` flag
- [x] Numeric prefix naming for output files
- [x] Parser unit tests (32 tests: single request, multi-request, edge cases) — `DotHttp.Tests/ParserTests.fs`
- [x] CLI e2e tests (12 tests: single file, multi-request, directory, dry-run, env, JSON output) — `Napper.Core.Tests/HttpConvertE2eTests.fs`

### Phase 2 — Dialect-Specific Features
- [x] Dialect detection pre-pass — auto-detected from `@var` (MS) or `< {%` / `> {%` (JB)
- [ ] `--dialect` flag (ms / jb / auto)
- [x] Microsoft `@variable = value` parsing
- [x] Microsoft `# @name` parsing
- [x] JetBrains `http-client.env.json` → `.napenv.*` conversion
- [x] JetBrains `http-client.private.env.json` → `.napenv.local` — auto-detected next to input
- [x] Simple assertion extraction from JB response handlers — `response.status`, `hasOwnProperty`
- [x] Unsupported feature warnings (WebSocket, gRPC, GraphQL, etc.)
- [x] Dialect detection unit tests
- [x] Environment conversion e2e tests
- [ ] Real-world file e2e tests (download and convert actual public .http collections)

### Phase 2.5 — AI Script Porting (placeholder)
- [ ] AI-assisted porting of JetBrains `> {% ... %}` scripts to `[script]`/`[assert]` blocks
- [ ] AI-assisted porting of JetBrains `< {% ... %}` pre-request scripts
- [ ] AI-assisted porting of external JS script file references

### Phase 3 — IDE Integration
- [ ] VSCode `Nap: Convert .http File` command
- [ ] VSCode `Nap: Convert .http Directory` command
- [ ] VSCode CodeLens on `.http` files
- [ ] Zed `/nap-convert-http` slash command
- [ ] VSCode e2e tests

### Phase 4 — Direct Execution (Future)
- [ ] `.http` extension detection in `napper run`
- [ ] In-memory conversion pipeline
- [ ] `--request <name>` flag
- [ ] `--env` reads `http-client.env.json` for `.http` files
- [ ] Direct execution e2e tests

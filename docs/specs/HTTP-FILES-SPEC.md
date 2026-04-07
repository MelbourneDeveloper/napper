# `http-compat` — .http File Compatibility

> **Let users bring their existing `.http` files to Nap — convert them to `.nap` format, or run them directly.**

---

## Problem

The `.http` file format is the most widely adopted plain-text HTTP request format. It is supported natively by Visual Studio, JetBrains IDEs (IntelliJ, Rider, WebStorm), and VS Code via the REST Client extension. Many teams already have `.http` file collections in their repos.

Nap's `.nap` format is superior for testing (declarative assertions, playlists, scripting), but asking users to abandon existing `.http` files is a migration barrier. Nap should meet users where they are.

---

## The `.http` Format Landscape

There is **no single `.http` standard**. Two major dialects exist:

### `http-ms` — Microsoft Dialect

Used by Visual Studio and the VS Code REST Client extension. Defined informally by [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) alignment and Microsoft's tooling docs.

| Feature | Syntax |
|---------|--------|
| Request separator | `###` |
| Comments | `#` or `//` |
| Variables | `@variableName = value` (file-level) or `{{variableName}}` (interpolation) |
| Environments | VS Code settings or JSON files |
| Named requests | `# @name requestName` above request line |
| Response scripting | Not supported natively (extension-dependent) |

### `http-jb` — JetBrains Dialect

Used by IntelliJ IDEA, Rider, WebStorm, and the JetBrains HTTP Client CLI.

| Feature | Syntax |
|---------|--------|
| Request separator | `###` |
| Comments | `#` or `//` |
| Variables | `{{variableName}}` (interpolation from env files) |
| Environments | `http-client.env.json` / `http-client.private.env.json` |
| Named requests | `### Request Name` (text after separator) |
| Pre-request scripts | `< {% ... %}` or `< file.js` |
| Response handlers | `> {% ... %}` or `> file.js` |
| Output redirection | `>>` (new file) / `>>!` (overwrite) |
| WebSocket | `WEBSOCKET ws://...` with `===` message separators |
| GraphQL | `GRAPHQL http://...` with inline query |
| gRPC | `GRPC host/service/method` |

### `http-shared` — Common Subset

Both dialects share this core syntax:

```http
### Optional comment or name
METHOD URL [HTTP/version]
Header-Name: Header-Value
Header-Name: Header-Value

Request body here
```

Key shared elements:
- `http-separator` — `###` separates requests within a single file
- `http-method-line` — `METHOD URL` as the first line of a request
- `http-headers` — colon-separated `Key: Value` pairs
- `http-body` — blank line followed by body content
- `http-comments` — `#` and `//` for comments
- `http-vars` — `{{variable}}` interpolation syntax (same as Nap)

---

## Approach: Converter (Primary) + Direct Run (Future)

### Decision: Converter First

After evaluating three options, the **converter** approach is the primary strategy:

| Option | Pros | Cons |
|--------|------|------|
| **A. Converter (`napper convert`)** | Simple, deterministic, testable; users get full `.nap` features after conversion; no runtime complexity | One-time migration step; users must re-convert if `.http` files change |
| B. LSP dual-format support | Seamless — `.http` files just work in the IDE | Massive LSP complexity; two grammars to maintain; assertion gap |
| C. Runtime interpreter | `napper run file.http` just works | Must replicate JetBrains/MS scripting models; assertion mapping is lossy |

**Rationale:** The converter is the highest-value, lowest-risk path. It gives users a clear migration story, produces first-class `.nap` files that benefit from all Nap features, and keeps the core simple. Direct `napper run file.http` support can be added later as a convenience that internally converts on-the-fly.

---

## `http-convert` — Conversion Specification

### CLI Command

```sh
# Convert a single .http file
napper convert http ./requests.http --output-dir ./nap-requests/

# Convert a directory of .http files
napper convert http ./http-collection/ --output-dir ./nap-collection/

# Convert with JetBrains environment file
napper convert http ./requests.http --env-file ./http-client.env.json --output-dir ./output/

# Dry run — show what would be generated
napper convert http ./requests.http --dry-run
```

### `http-convert-flags` — CLI Flags

| Flag | Spec ID | Description |
|------|---------|-------------|
| `--output-dir <dir>` | `http-convert-outdir` | Destination directory for generated `.nap` files |
| `--env-file <path>` | `http-convert-envfile` | Path to `http-client.env.json` or similar env file |
| `--dialect <ms\|jb\|auto>` | `http-convert-dialect` | Force a dialect; `auto` (default) detects from syntax |
| `--dry-run` | `http-convert-dryrun` | Preview generated files without writing |
| `--overwrite` | `http-convert-overwrite` | Overwrite existing `.nap` files (default: skip) |

### `http-convert-parse` — Parsing Strategy

The converter parses `.http` files using a **line-oriented state machine** (not regex on structured data). The parser operates on the `http-shared` common subset, with dialect-specific extensions:

**Parser states:**
1. `IDLE` — between requests, consuming `###` separators and comments
2. `METHOD_LINE` — expecting `METHOD URL [HTTP/version]`
3. `HEADERS` — consuming `Key: Value` lines until blank line
4. `BODY` — consuming body lines until next `###` or EOF

**Dialect detection (`http-convert-detect`):**
- `@variable = value` at file level → Microsoft dialect
- `< {%` or `> {%` script blocks → JetBrains dialect
- `http-client.env.json` present in same directory → JetBrains dialect
- Neither → treat as common subset

### `http-convert-mapping` — Format Mapping

#### Request mapping

| `.http` element | `.nap` output | Notes |
|-----------------|---------------|-------|
| `### Name` or `# @name Name` | `[meta] name = "Name"` | Request name |
| `METHOD URL` | `[request] METHOD URL` | Direct mapping |
| `Header: Value` | `[request.headers] Header = Value` | Direct mapping |
| Body content | `[request.body]` | Direct mapping |
| `{{variable}}` | `{{variable}}` | Identical syntax — no change needed |
| `HTTP/1.1` or `HTTP/2` | Dropped | Nap does not specify HTTP version |

#### Variable mapping

| Source | `.nap` output |
|--------|---------------|
| `@var = value` (MS file-level) | `[vars] var = "value"` |
| `http-client.env.json` environments | `.napenv` + `.napenv.<envname>` files |
| `http-client.private.env.json` | `.napenv.local` (gitignored) |

#### `http-convert-env` — Environment file conversion

JetBrains `http-client.env.json`:
```json
{
  "dev": { "host": "localhost:8080", "token": "abc" },
  "prod": { "host": "api.example.com", "token": "xyz" }
}
```

Converts to:
```toml
# .napenv (common variables — empty if all are env-specific)
```
```toml
# .napenv.dev
host = "localhost:8080"
token = "abc"
```
```toml
# .napenv.prod
host = "api.example.com"
token = "xyz"
```

Private env file → `.napenv.local` with a comment noting it should be gitignored.

#### `http-convert-scripts` — Script conversion

JetBrains pre-request and response handler scripts are **not converted**. Instead, the converter emits a warning and a `TODO` comment in the generated `.nap` file:

```nap
# TODO: This request had a JetBrains response handler script.
# Original: > {% client.test("status", function() { client.assert(response.status === 200) }) %}
# Convert to a [script] post reference or [assert] block.
[assert]
status = 200
```

**Simple assertion extraction (`http-convert-assert`):** When a JetBrains response handler contains recognizable patterns, the converter extracts them into `[assert]` blocks:

| JetBrains pattern | Nap assertion |
|--------------------|---------------|
| `response.status === 200` | `status = 200` |
| `response.body.hasOwnProperty("id")` | `body.id exists` |
| `response.headers.valueOf("Content-Type")` contains check | `headers.Content-Type contains "..."` |

Complex scripts that cannot be pattern-matched are left as TODO comments only.

#### `http-convert-unsupported` — Unsupported features

These JetBrains-specific features have no `.nap` equivalent and are **dropped with warnings**:

| Feature | Handling |
|---------|----------|
| WebSocket requests (`WEBSOCKET`) | Warning: "WebSocket not supported, skipping" |
| gRPC requests (`GRPC`) | Warning: "gRPC not supported, skipping" |
| GraphQL requests (`GRAPHQL`) | Warning: "GraphQL not supported, skipping" |
| Output redirection (`>>`, `>>!`) | Warning: "Output redirection not supported" |
| `@no-log`, `@no-cookie-jar` tags | Warning: "Tag not supported" |
| `import` / `run` directives | Warning: "Import directives not supported" |
| SSL configuration | Warning: "SSL configuration not converted" |

### `http-convert-output` — Output Structure

A single `.http` file with multiple requests:

```
input.http  →  output-dir/
                ├── .napenv
                ├── 01_get-users.nap
                ├── 02_create-user.nap
                └── 03_delete-user.nap
```

A directory of `.http` files:

```
http-collection/        →  nap-collection/
├── auth.http                ├── .napenv
├── users.http               ├── auth/
└── http-client.env.json     │   ├── 01_login.nap
                             │   └── 02_refresh.nap
                             └── users/
                                 ├── 01_get-user.nap
                                 └── 02_create-user.nap
```

**Naming rules (`http-convert-naming`):**
- Request name from `### Name` or `# @name Name` → slugified filename
- No name → `{method}-{url-path-slug}` (e.g. `get-users-userid`)
- Numeric prefix for ordering: `01_`, `02_`, etc.
- Multiple requests per `.http` file → one `.nap` file each, grouped in a subdirectory named after the `.http` file

---

## `http-run` — Direct `.http` File Execution (Future)

A future convenience feature: `napper run file.http` internally converts on-the-fly and executes.

```sh
# Run a .http file directly (converts in memory, does not write .nap files)
napper run ./requests.http

# Run a specific request by name within a multi-request .http file
napper run ./requests.http --request "Get Users"

# Run with a specific environment from http-client.env.json
napper run ./requests.http --env dev
```

**Implementation:** Parse → convert to in-memory `.nap` representation → execute through the existing runner. No files written to disk.

**New flag:**
| Flag | Spec ID | Description |
|------|---------|-------------|
| `--request <name>` | `http-run-request` | Run a specific named request from a multi-request `.http` file |

---

## `http-ide` — IDE Extension Integration

### VSCode

- **`Nap: Convert .http File`** command — converts the active `.http` file or prompts for a file picker
- **`Nap: Convert .http Directory`** command — converts all `.http` files in a selected directory
- CodeLens on `.http` files: `Convert to .nap` above each `###` separator
- After conversion, opens the generated `.nap` file(s) in the editor

### Zed

- Slash command: `/nap-convert-http <file>` — converts and returns summary in the Assistant

---

## Dependencies

This feature depends on **Microsoft's `.http` format specification**. While there is no formal RFC, Microsoft's Visual Studio and VS Code REST Client define the de facto standard. The converter targets the `http-shared` common subset plus explicit dialect handling for Microsoft and JetBrains extensions.

**No dependency on JetBrains' proprietary runtime or API.** The converter reads the file format only — it does not invoke the JetBrains HTTP Client engine.

### `http-parser-project` — Standalone Parser Package

The `.http` file parser lives in a standalone project **`DotHttp`** with no dependency on Napper.Core. It uses **FParsec** (parser combinator library, already a project dependency) because no official `.http` file parser exists as a NuGet package. The project is designed to be published independently as `DotHttp` on NuGet for any .NET project that needs `.http` file parsing. It is a generic, reusable library — not Nap-specific.

**No new dependencies** — FParsec 1.1.1 is already used for the `.nap` file parser.

---

## Design Principles

1. **Lossless where possible.** Every piece of information in the `.http` file should appear in the `.nap` output — either as a direct mapping or as a comment.
2. **Warnings over errors.** Unsupported features produce warnings, not failures. The converter should always produce output.
3. **Idempotent.** Running the converter twice on the same input produces identical output.
4. **No invented assertions.** The converter only generates `[assert]` blocks from explicit JetBrains response handlers. It does not guess assertions.

---

## Related Specs

- [File Formats](./FILE-FORMATS-SPEC.md) — `.nap`, `.napenv`, `.naplist` format specs (target format)
- [CLI Spec](./CLI-SPEC.md) — CLI commands and flags
- [IDE Extension Spec](./IDE-EXTENSION-SPEC.md) — IDE integration surface
- [HTTP Files Plan](./HTTP-FILES-PLAN.md) — Implementation phases and TODO

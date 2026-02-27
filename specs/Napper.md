# Nap — API Testing Tool Specification

> **Nap** (Network API Protocol) — a CLI-first, test-oriented alternative to Postman, Bruno, `.http` files, and curl.

---

## Vision

Nap is a developer-first HTTP testing tool. It is as simple as curl for one-off requests, but scales to full test suites with reusable components, scripted assertions, and CI integration. It is not a GUI-first tool with a CLI bolted on — the CLI is the product; the VSCode extension is a first-class citizen that operates on the same files.

---

## Core Principles

1. **Files are the source of truth.** All requests, tests, and playlists are plain files. Git-friendly by default.
2. **Simple things are simple.** A single HTTP call should look almost as terse as curl.
3. **Tests are reusable components.** A `.nap` file is a reusable unit. It can be composed into playlists without modification.
4. **Scripting is opt-in and external.** F# (and potentially other languages) scripts live in `.fsx` files referenced by name. Simple assertions need no scripting.
5. **No lock-in.** The format is plain text. The scripting is standard `.fsx`. Results emit standard formats.

---

## File Format: `.nap`

Each `.nap` file defines one **request** plus its optional **setup**, **assertions**, and **script reference**.

### Minimal example — just a request

```nap
GET https://api.example.com/users
```

### Full anatomy

```nap
# Optional metadata block
[meta]
name        = "Get user by ID"
description = "Fetches a single user and asserts shape"
tags        = ["users", "smoke"]

# Optional variables (can be overridden by environment)
[vars]
userId = "42"

# Request block (required)
[request]
method  = GET
url     = https://api.example.com/users/{{userId}}

[request.headers]
Authorization = Bearer {{token}}
Accept        = application/json

# Optional: request body (for POST/PUT/PATCH)
# [request.body]
# content-type = application/json
# """
# { "name": "Alice" }
# """

# Optional: built-in assertions (no scripting required)
[assert]
status  = 200
body.id = {{userId}}
body.name exists

# Optional: reference an external script for complex assertions or setup
[script]
pre  = ./scripts/auth.fsx      # runs before the request
post = ./scripts/validate-user.fsx   # runs after the response
```

### Key design decisions

- **TOML-inspired syntax** — familiar, unambiguous, easy to parse.
- **`{{variable}}`** interpolation throughout — variables resolved from env files, CLI flags, or parent playlist scope.
- **`[assert]` block** — declarative assertions that cover ~80% of cases without scripting.
  - `status = 200` — HTTP status code
  - `body.path = value` — JSONPath equality
  - `body.path exists` — presence check
  - `body.path matches "regex"` — regex match
  - `headers.Content-Type contains "json"` — header check
  - `duration < 500ms` — performance assertion
- **`[script]` block** — references external `.fsx` files for pre/post hooks.
- Comments with `#`.

---

## Scripting Model

Scripts are **external `.fsx` files** referenced by relative path. This keeps `.nap` files clean and makes scripts independently testable and reusable across many `.nap` files.

### Script context object

The runtime injects a `NapContext` object into every script. The interface (F# record):

```fsharp
type NapResponse = {
    StatusCode : int
    Headers    : Map<string, string>
    Body       : string          // raw body
    Json       : JsonElement     // parsed if Content-Type is JSON
    Duration   : TimeSpan
}

type NapContext = {
    Vars      : Map<string, string>   // mutable — scripts can set vars for downstream steps
    Request   : HttpRequestMessage    // pre-script only
    Response  : NapResponse           // post-script only (None in pre-script)
    Env       : string                // current environment name
    Fail      : string -> unit        // call to fail the test with a message
    Set       : string -> string -> unit  // set a variable for downstream steps
    Log       : string -> unit        // write to test output
}
```

### Example post-script (`validate-user.fsx`)

```fsharp
// ctx : NapContext is injected automatically
let user = ctx.Response.Json

if user.GetProperty("id").GetString() <> ctx.Vars["userId"] then
    ctx.Fail "User ID mismatch"

// Extract a token from response and pass it to the next step
let token = user.GetProperty("sessionToken").GetString()
ctx.Set "token" token
```

### Script-driven execution (inverse model)

The relationship between `.nap` files and scripts works **both ways**:

**`.nap` file drives scripts** — a request file references one or more pre/post scripts.

**Script drives `.nap` files** — an `.fsx` file can itself act as the entry point, orchestrating as many requests as needed:

```fsharp
// orchestrate.fsx — F# script as the top-level runner
// ctx : NapContext injected; nap : NapRunner also injected

let loginResult = nap.Run "./auth/01_login.nap"
ctx.Set "token" (loginResult.Response.Json.GetProperty("token").GetString())

for userId in [1; 2; 3] do
    ctx.Set "userId" (string userId)
    let result = nap.Run "./users/get-user.nap"
    if result.Response.StatusCode <> 200 then
        ctx.Fail $"User {userId} not found"
```

The `NapRunner` object injected into orchestration scripts:

```fsharp
type NapRunner = {
    Run     : string -> NapResult          // run a .nap file, returns result
    RunList : string -> NapResult list     // run a .naplist file
    Vars    : Map<string, string>          // shared variable bag
}
```

This enables arbitrarily complex test flows — loops, branching, data-driven runs — without any special playlist syntax.

A `.naplist` can reference an `.fsx` orchestration script as a step, the same as any `.nap` file:

```naplist
[steps]
./auth/01_login.nap
./scripts/parametrized-user-tests.fsx    # script drives multiple .nap files
./teardown/cleanup.nap
```

### Language extensibility

The `[script]` block specifies a file path. The runtime dispatches based on file extension:
- `.fsx` → F# interactive (dotnet-fsi)
- Future: `.py`, `.js`, etc. — the architecture allows pluggable runners

---

## Environment Files: `.napenv`

Environment files are TOML files that define variable sets for different deployment targets.

```toml
# .napenv (base — checked into git, no secrets)
baseUrl = "https://api.example.com"
userId  = "42"
```

```toml
# .napenv.local (gitignored — secrets)
token = "eyJhbGci..."
```

```toml
# .napenv.staging
baseUrl = "https://staging.api.example.com"
token   = "staging-token"
```

Variable resolution order (highest wins):
1. CLI `--var key=value` flags
2. `.napenv.local`
3. Named environment file (e.g. `.napenv.staging`)
4. Base `.napenv`
5. `[vars]` block in the `.nap` file

---

## Collections: Folder-Based

A folder of `.nap` files is implicitly a **collection**. Subfolders are sub-collections.

```
my-api/
├── .napenv
├── .napenv.local          # gitignored
├── auth/
│   ├── 01_login.nap
│   └── 02_refresh-token.nap
├── users/
│   ├── 01_get-user.nap
│   ├── 02_create-user.nap
│   └── 03_delete-user.nap
└── smoke.naplist
```

Execution order within a folder: **filename sort** (use numeric prefixes `01_`, `02_` to control order).

---

## Playlists: `.naplist`

A `.naplist` file is an explicit ordered list of steps. Steps can reference:
- Individual `.nap` files (by relative path)
- Folders (run all `.nap` files in that folder, sorted)
- Other `.naplist` files (nested playlists — fully recursive)

### Example `smoke.naplist`

```naplist
[meta]
name = "Smoke Test Suite"
env  = staging          # default environment for this playlist

[vars]
timeout = "5000"

[steps]
./auth/01_login.nap
./auth/02_refresh-token.nap
./users/01_get-user.nap

# Include another playlist
./regression/core.naplist
```

### Variable scoping in playlists

- A `[vars]` block in a `.naplist` sets variables for all steps in that playlist.
- Scripts can use `ctx.Set` to pass variables **forward** to subsequent steps in the same playlist.
- Nested `.naplist` files inherit the parent's variable scope unless they override.

---

## CLI

### Installation

```sh
# .NET global tool
dotnet tool install -g nap

# Standalone binary (Homebrew, GitHub Releases)
brew install nap
```

### Usage

```sh
# Run a single request (simplest case — as easy as curl)
nap run ./users/get-user.nap

# Run a single request with inline variable override
nap run ./users/get-user.nap --var userId=99 --var env=dev

# Run a collection (folder)
nap run ./users/

# Run a playlist
nap run ./smoke.naplist

# Specify environment
nap run ./smoke.naplist --env staging

# Watch mode — re-run on file save
nap run ./smoke.naplist --watch

# Output formats
nap run ./smoke.naplist --output junit    # JUnit XML (CI)
nap run ./smoke.naplist --output tap      # TAP format
nap run ./smoke.naplist --output pretty   # default human-readable

# Scaffold a new .nap file
nap new request ./users/get-user.nap
nap new playlist ./smoke.naplist
nap new env staging

# Validate syntax without running
nap check ./smoke.naplist

# List all requests in a collection/playlist
nap list ./
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All assertions passed |
| 1 | One or more assertions failed |
| 2 | Runtime error (network, script error, parse error) |

---

## VSCode Extension

> The extension is the **primary entry point** for most users. It must be as approachable as Postman on first open, but backed by plain files that work perfectly from the CLI and in CI.

### Design philosophy

- **No separate app.** Everything lives inside VSCode. No webview-based fake browser. No Electron shell inside Electron.
- **Files are always the truth.** The UI is a lens over `.nap` and `.naplist` files. Edits in the UI update the file directly; edits in the file are immediately reflected in the UI. There is no sync step.
- **Progressive disclosure.** A new user can send their first request within 30 seconds of installing. Advanced features (scripting, playlists, environments) reveal themselves naturally as the user explores.
- **Looks good, works fast.** The UI should feel polished — not a dev tool hacked together from tree views and JSON editors.

---

### Layout overview

The extension contributes a dedicated **Nap Activity Bar icon** (sidebar panel). The panel has three tabs:

```
┌─────────────────────────────┐
│  🟢 Nap               [+ ▾] │  ← panel header: new request button, env picker
├──────────┬──────────────────┤
│ Explorer │ Playlists        │  ← two tabs
├──────────┴──────────────────┤
│                             │
│  📁 my-api/                 │  ← folder = collection
│    📁 auth/                 │
│      📄 01_login            │  ← .nap file
│      📄 02_refresh-token    │
│    📁 users/                │
│      📄 01_get-user    ✓    │  ← pass indicator
│      📄 02_create-user ✗    │  ← fail indicator
│      📄 03_delete-user      │
│                             │
│  📋 smoke         [▶ Run]   │  ← .naplist file
└─────────────────────────────┘
```

---

### Explorer tab

The Explorer tab mirrors the folder structure on disk. It is not a custom tree — it wraps the workspace file tree filtered to `.nap`, `.naplist`, and `.napenv` files.

**Each `.nap` file node shows:**
- File name (without extension, prettified)
- HTTP method badge (`GET`, `POST`, etc.) in a colour-coded pill
- Last run result icon: ✓ pass / ✗ fail / ● pending / ⊘ skipped
- Hover: URL, last run time, last status code

**Context menu on a `.nap` file:**
- ▶ Run
- ⧉ Copy as curl
- ✎ Open in editor
- + Add to playlist…
- ⊕ Duplicate
- 🗑 Delete

**Folder (collection) context menu:**
- ▶ Run all
- + New request here
- + New playlist here

---

### Playlists tab

Lists all `.naplist` files found in the workspace, with a tree showing their step structure (including nested playlists).

```
📋 smoke
  📄 01_login
  📄 02_refresh-token
  📄 01_get-user
  📋 regression/core      ← nested playlist, expandable
      📄 ...

📋 regression/core
  ...
```

Each playlist node has a ▶ Run button. Individual steps can be run in isolation from the tree.

---

### Request editor (the main view)

Clicking a `.nap` file opens it in a **split editor**: the raw `.nap` file on the left (editable), and a structured **Request Panel** on the right as a webview.

```
┌─────────────────────────┬──────────────────────────────────────┐
│  get-user.nap           │  Get user by ID              [▶ Run] │
│─────────────────────────│──────────────────────────────────────│
│ [meta]                  │  ┌─ Request ──────────────────────┐  │
│ name = "Get user by ID" │  │  GET  https://api.ex…/users/42 │  │
│                         │  │                                │  │
│ [request]               │  │  Headers                   [+] │  │
│ method = GET            │  │  Authorization  Bearer ••••••  │  │
│ url = {{baseUrl}}/…     │  │  Accept         application/…  │  │
│                         │  └────────────────────────────────┘  │
│ [assert]                │                                      │
│ status = 200            │  ┌─ Response ─────────────────────┐  │
│ body.id exists          │  │  200 OK   47ms   1.2 KB        │  │
│                         │  │                                │  │
│                         │  │  Headers   Body   Preview      │  │
│                         │  │ ┌────────────────────────────┐ │  │
│                         │  │ │ {                          │ │  │
│                         │  │ │   "id": "42",              │ │  │
│                         │  │ │   "name": "Alice"          │ │  │
│                         │  │ │ }                          │ │  │
│                         │  │ └────────────────────────────┘ │  │
│                         │  │                                │  │
│                         │  │  Assertions                    │  │
│                         │  │  ✓ status = 200                │  │
│                         │  │  ✓ body.id exists              │  │
│                         │  └────────────────────────────────┘  │
└─────────────────────────┴──────────────────────────────────────┘
```

**The right panel is read-only** — it is a live preview of the request and (after running) the response. All editing is done in the `.nap` file on the left. The two sides stay in sync automatically.

**The right panel has three response sub-tabs:**
- **Body** — raw or pretty-printed JSON/XML/text with syntax highlighting and search
- **Headers** — response headers as a clean key/value table
- **Preview** — rendered HTML (for HTML responses) or image (for image responses)

**Assertions section** (below the response): each assertion from the `[assert]` block is listed with its pass/fail state and the actual vs. expected value on failure.

---

### Inline editing features

**Syntax highlighting** — full grammar-aware highlighting for `.nap` and `.naplist` files.

**Variable resolution on hover** — hovering over `{{token}}` shows a tooltip with the resolved value from the active environment (masked if the key is in `.napenv.local`).

**CodeLens actions** (appear above relevant lines in the raw file):
- `▶ Run` above `[request]`
- `▶ Run Playlist` above `[meta]` in `.naplist` files
- `⧉ Copy as curl` above `[request]`

**Autocomplete:**
- Standard HTTP method names
- Common header names (`Content-Type`, `Authorization`, `Accept`, …)
- Known variable names from `.napenv` files in the workspace
- Status codes in `[assert]` blocks

**Inline diagnostics** — squiggly underlines for:
- Unknown variables (referenced in `{{…}}` but not defined in any env file)
- Invalid assertion syntax
- Missing required `[request]` block
- Unreachable script paths in `[script]`

---

### Environment switcher

A **status bar item** (bottom-left) shows the active environment:

```
[ Nap: staging ▾ ]
```

Clicking opens a quick-pick dropdown listing all detected environments (from `.napenv.*` files). Switching environment immediately re-resolves all variable previews in open editors.

A per-workspace setting `nap.defaultEnvironment` can be committed to the repo to set the team default.

---

### New request flow

Clicking **[+]** in the panel header (or running the `Nap: New Request` command) opens a guided quick-input flow:

1. **Pick HTTP method** — GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS
2. **Enter URL** — with autocomplete for `{{baseUrl}}` and other known variables
3. **Pick destination folder** — from the workspace collection tree
4. **Name the request** — defaults to `{method} {path}` (e.g. `GET users-userId`)

The file is created immediately and opened in the split editor, ready to run.

---

### Test Explorer integration

The extension registers a `vscode.TestController` so all `.nap` files appear in the standard VSCode **Test Explorer** panel (the flask icon in the activity bar).

- Collections map to **test suites**
- `.nap` files map to **test items**
- `.naplist` files map to a **test suite** with each step as a child item
- Nested playlists are nested suites

Run/debug actions in the Test Explorer invoke the Nap CLI under the hood (`nap run <file> --output junit`) and map results back to the test items.

Results are shown in the **Test Results** output panel with:
- Full request (method, URL, headers, body)
- Full response (status, headers, body)
- Each assertion result with actual vs. expected values on failure
- Script output (`ctx.Log` messages) shown as test output

---

### Extension settings

| Setting | Default | Description |
|---------|---------|-------------|
| `nap.defaultEnvironment` | `""` | Active environment name |
| `nap.autoRunOnSave` | `false` | Re-run the request when the file is saved |
| `nap.splitEditorLayout` | `"beside"` | `"beside"` or `"below"` for the response panel |
| `nap.maskSecretsInPreview` | `true` | Mask variables sourced from `.napenv.local` in hover tooltips |
| `nap.cliPath` | `"nap"` | Path to the Nap CLI binary (auto-detected if on PATH) |

---

### Extension commands (Command Palette)

| Command | Description |
|---------|-------------|
| `Nap: New Request` | Create a new `.nap` file via guided flow |
| `Nap: New Playlist` | Create a new `.naplist` file |
| `Nap: Run File` | Run the currently open `.nap` or `.naplist` |
| `Nap: Run All` | Run all `.nap` files in the workspace |
| `Nap: Switch Environment` | Open environment picker |
| `Nap: Copy as curl` | Copy the current request as a curl command |
| `Nap: Generate from OpenAPI` | Run `nap generate openapi` against a spec file |
| `Nap: Reveal in Explorer` | Jump from the Nap panel to the file in the native Explorer |

---

### Extension implementation notes

- Built in **TypeScript** using the VSCode Extension API.
- The response panel webview uses a minimal framework (Lit or vanilla TS + CSS) — no heavy UI library.
- The extension shells out to the **Nap CLI** (`nap run --output json`) for all HTTP execution. It does not re-implement the HTTP runner in TypeScript. This keeps the CLI and extension always in sync.
- File watching via `vscode.workspace.createFileSystemWatcher` keeps the panel tree up to date without polling.
- The `.nap` language grammar (TextMate `.tmLanguage.json`) is generated from the ANTLR grammar to avoid drift.
- The extension is published to the **VS Code Marketplace** and the **Open VSX Registry** (for VSCodium / Cursor / Windsurf users).

---

## Parser Implementation

### Recommended approach: ANTLR4

The `.nap` and `.naplist` formats should be parsed with **ANTLR4** (targeting the C# runtime via `Antlr4.Runtime.Standard` NuGet package, which works fine from F#).

**Rationale:**
- The format has a non-trivial grammar (multi-line string literals, section headers, assertion expressions, variable interpolation).
- ANTLR gives a formal grammar file (`.g4`) that serves as the authoritative format spec and is easy to evolve.
- The C# ANTLR runtime is mature and well-maintained. Generating a visitor/listener from F# is straightforward.
- Alternatives (FParsec, manual recursive descent) are viable but ANTLR's grammar file is more readable as documentation and easier to extend without regressions.

**Alternative — FParsec:**
If the grammar stays simple enough, [FParsec](https://www.quanttec.com/fparsec/) (a combinator parser library for F#) is a strong alternative. It keeps everything in F#, has excellent error messages, and has no code generation step. Use FParsec if the grammar remains simple; switch to ANTLR if the grammar grows complex (e.g. full expression language for assertions, conditional blocks).

**Grammar files location:**

```
nap/
└── src/
    └── Nap.Core/
        └── Grammar/
            ├── NapFile.g4      # .nap file grammar
            └── NapList.g4      # .naplist grammar
```

The generated parser code is committed to the repo (not regenerated on every build) to avoid toolchain dependencies in CI.

---

## Project Layout (Implementation)

```
nap/
├── src/
│   ├── Nap.Core/           # F# — parser, types, runner engine
│   ├── Nap.Scripting/      # F# — fsi host, script context injection
│   ├── Nap.Cli/            # F# — CLI entry point (System.CommandLine)
│   └── Nap.VsCode/         # TypeScript — VSCode extension
├── tests/
│   ├── Nap.Core.Tests/
│   └── Nap.Scripting.Tests/
├── examples/
│   └── petstore/           # Sample collection against Petstore API
└── nap.sln
```

---

## Implementation Phases

### Phase 1 — Core CLI (MVP)

- `.nap` file parser
- HTTP request runner (single file)
- Built-in `[assert]` block evaluation
- `.napenv` variable resolution
- `--output pretty` and `--output junit`
- `nap run <file>` command

### Phase 2 — Collections & Playlists

- Folder-based collection runner
- `.naplist` file parser and runner
- Nested playlist support
- Variable scoping across steps (`ctx.Set`)

### Phase 3 — F# Scripting

- dotnet-fsi host integration
- `NapContext` injection
- Pre/post script execution
- `ctx.Set` for cross-step variable passing

### Phase 4 — VSCode Extension

- Syntax highlighting
- Test Explorer integration
- CodeLens run actions
- Environment switcher
- Response viewer panel

### Phase 5 — Polish & Distribution

- Standalone native binary (NativeAOT or single-file publish)
- NuGet package for `dotnet tool install`
- Homebrew formula
- `nap new` scaffolding commands
- Language-extensible script runner plugin model

---

## Open Questions / Future Considerations

- **GraphQL support** — a `[request.graphql]` block with query/variables sub-keys.
- **WebSocket / SSE testing** — separate request type, different assertion model.
- **Mock server mode** — `nap mock ./collection/` serves a mock based on expected responses.
- **Script language plugins** — `.py`, `.js` runners as opt-in packages.
- **Secret manager integration** — pull `{{token}}` from 1Password, AWS Secrets Manager, etc. at runtime.
- **HTML report output** — `--output html` for a shareable test report.

---

## OpenAPI / Swagger Test Generation

See [OpenAPI Generation Specification](./OpenApiGeneration.md) for the full specification covering one-click test suite generation from OpenAPI specs, including AI-assisted enrichment via GitHub Copilot.

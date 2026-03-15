# OpenAPI Test Generation Specification

> **One click to turn an OpenAPI spec into a comprehensive, runnable test suite.**

---

CRITICAL: START WITH TESTS THAT VERIFY THAT OpenAPI -> .nap is WORKING. THE OPENAPI -> .nap DETERMINISTIC PART IS F#. ENRICHMENT IS COPILOT ONLY.

---

## Vision

A user points Napper at an OpenAPI 3.x or Swagger 2.x specification and gets a complete test suite: one `.nap` file per operation, organized by tag into subdirectories, with a `.naplist` playlist, a `.napenv` environment file, and meaningful assertions derived from the spec's response schemas.

Without AI, the generator produces deterministic output from the spec alone. When GitHub Copilot is available inside VS Code, the user can opt into AI-assisted enrichment that adds smarter assertions, realistic test data, error-case tests, and intelligent playlist ordering.

The generated files are **starting points**. The user edits, extends, and commits them alongside the rest of the collection.

---

## Generation Flow

```
Input                    Parse              Collect             Generate
────────────────────    ──────────────     ─────────────      ──────────────────────
Local file (.json/.yaml) │                 Group endpoints     Per-tag subdirectory:
  or                     ├─ JSON.parse()   by tag              - 01_operation.nap
URL (https://...)        │  or YAML parse  │                   - 02_operation.nap
                         ▼                 │                   ...
                     Resolve $ref          │
                         │                 ▼                   Root:
                         ▼             EndpointDescriptor[]    - api-tests.naplist
                     OpenApiSpec                               - .napenv
                                                               - .napenv.local (gitignored)
```

### Input formats

| Format | Status |
|--------|--------|
| OpenAPI 3.x JSON | Implemented |
| Swagger 2.x JSON | Implemented |
| YAML (both versions) | Not yet — needs YAML parser |
| URL-based loading | Not yet — file picker only |

---

## What Gets Generated

### Per operation: a `.nap` file

```nap
# Generated from GET /users/{userId}
[meta]
name        = Get user by ID
description = Auto-generated from petstore.yaml - operation getUserById
tags        = ["users", "generated"]
generated   = true

[vars]
userId = "REPLACE_ME"

[request]
GET {{baseUrl}}/users/{{userId}}

[request.headers]
Authorization = Bearer {{token}}
Accept        = application/json

[assert]
status = 200
body.id exists
body.name exists
body.email exists
```

### Per tag: a subdirectory

Operations tagged `users` go into `users/`, operations tagged `pets` go into `pets/`, etc. Untagged operations go into the root.

```
generated/
├── .napenv
├── .napenv.local          # gitignored, placeholder for secrets
├── api-tests.naplist
├── users/
│   ├── 01_get-user.nap
│   ├── 02_create-user.nap
│   └── 03_delete-user.nap
└── pets/
    ├── 01_list-pets.nap
    └── 02_get-pet.nap
```

### Per spec: a `.naplist` playlist

```naplist
[meta]
name = Pet Store API

[steps]
./users/01_get-user.nap
./users/02_create-user.nap
./users/03_delete-user.nap
./pets/01_list-pets.nap
./pets/02_get-pet.nap
```

### Per spec: a `.napenv` environment

```toml
baseUrl = https://petstore.example.com/v1
```

---

## Generation Details

### Base URL extraction

1. OpenAPI 3.x: first entry in `servers[].url`
2. Swagger 2.x: `{schemes[0]}://{host}{basePath}`
3. Fallback: `https://api.example.com`

### Path parameter conversion

OpenAPI `{param}` becomes Napper `{{param}}`. Each path parameter also generates a `[vars]` entry with a placeholder value.

### Request body generation

For POST / PUT / PATCH operations:
- If the spec provides an `example`, use it verbatim
- Otherwise, recursively generate from the schema using type-appropriate defaults
- Use `format` hints for smarter defaults (email, uuid, date-time, uri)
- Use `enum` values when available (pick the first)
- Respect `minimum` / `maximum` for numeric types

### Response assertion generation

From the success response schema (first 2xx status code):
- `status = {code}` for the expected status
- `body.{field} exists` for each top-level required property
- `body.{field} = {value}` for fields with known constant values (enums with single value)
- `headers.Content-Type contains "json"` when response media type is `application/json`

### Query parameter handling

Query parameters from the spec are appended to the URL as `?key={{key}}` and generate corresponding `[vars]` entries.

### Authentication handling

From the spec's `securitySchemes` and per-operation `security` requirements:

| Scheme | Generated output |
|--------|-----------------|
| Bearer token (`http: bearer`) | `Authorization = Bearer {{token}}` header + `token` in `.napenv.local` |
| API key (header) | `{headerName} = {{apiKey}}` header + `apiKey` in `.napenv.local` |
| API key (query) | Appended as query param `?{name}={{apiKey}}` |
| Basic auth | `Authorization = Basic {{basicAuth}}` header |

### Error case generation

For each documented error response (4xx, 5xx), generate an additional `.nap` file that intentionally triggers the error:

```nap
# Generated error case: 404 for GET /users/{userId}
[meta]
name        = Get user by ID - 404
description = Verify 404 when user does not exist
tags        = ["users", "generated", "error-case"]
generated   = true

[vars]
userId = "nonexistent-id"

[request]
GET {{baseUrl}}/users/{{userId}}

[assert]
status = 404
```

### `$ref` resolution

OpenAPI specs use `$ref` pointers extensively for reusable schemas, parameters, and responses. The generator must resolve all `$ref` pointers by inlining the referenced definitions before generating output. This includes:
- `#/components/schemas/...` (OAS3) and `#/definitions/...` (Swagger 2)
- `#/components/parameters/...`
- `#/components/responses/...`
- Nested `$ref` chains (a schema referencing another schema)

### Generated file metadata

Every generated `.nap` file includes `generated = true` in the `[meta]` block. This allows tooling to distinguish generated files from hand-written ones, enabling safe re-generation and `--diff` mode.

---

## CLI Commands

```sh
# Generate from a local spec
napper generate openapi ./petstore.yaml --output ./petstore/

# Generate from a URL
napper generate openapi https://api.example.com/openapi.json --output ./generated/

# Generate only for specific tags
napper generate openapi ./petstore.yaml --tag users --tag pets --output ./filtered/

# Show what would change without overwriting (diff mode)
napper generate openapi ./petstore.yaml --output ./petstore/ --diff
```

### Diff / regeneration mode

Re-running `napper generate openapi` against an existing output directory with `--diff` compares the spec's current state against previously generated files (identified by `generated = true`). It reports:
- New operations added to the spec
- Operations removed from the spec
- Changed request/response schemas

Without `--diff`, re-generation overwrites files that have `generated = true` but leaves files where that flag has been removed (indicating the user has taken ownership).

---

## VS Code Extension Integration

### Import command

The `Napper: Import from OpenAPI` command (`napper.importOpenApi`):

1. User picks a spec file (JSON / YAML) or pastes a URL
2. User picks an output folder
3. Generator runs, writes files
4. Opens the generated `.naplist` in the editor
5. Shows success notification with file count

### Menu placement

The import command appears in:
- The Napper explorer panel title bar (cloud-download icon)
- The Command Palette

---

## AI-Assisted Enrichment (Copilot)

> AI enrichment is an **optional layer** on top of the deterministic generator. The generator always works without Copilot. When Copilot is available and the user opts in, the output is enriched.

### How it works

1. The deterministic generator produces the base `GenerationResult`
2. If the user chooses "Generate with AI enhancement" and Copilot is available:
   - The enricher sends batched prompts to the VS Code Language Model API (`vscode.lm`)
   - Each prompt covers a batch of operations (grouped by tag) to stay within rate limits
   - The LLM responses are parsed and merged into the generation result
3. The enriched files are written to disk

### What AI enriches

| Area | Without AI | With AI |
|------|-----------|---------|
| Assertions | `status = 200`, `body.field exists` for required fields | Semantic assertions: format checks, value range checks, relationship assertions between fields |
| Request body examples | Schema-derived defaults (`"example"`, `0`, `true`) | Contextually realistic values: real-looking emails, names, dates, UUIDs |
| Error case tests | One per documented error status code with placeholder input | Targeted invalid inputs that would actually trigger each error |
| Playlist ordering | File-sort order | Logical flow: auth first, create before read, CRUD lifecycle |
| Validation scripts | None | `.fsx` scripts for complex nested object / array validation |

### Architecture

The AI enrichment is split into two modules:

**`openApiAiEnhancer.ts`** — pure functions, no VS Code SDK dependency:
- Input: `GenerationResult` + parsed `OpenApiSpec` + LLM response strings
- Output: enriched `GenerationResult`
- Fully testable without VS Code

**Extension integration layer** (in `extension.ts`):
- Checks `vscode.lm.selectChatModels()` for Copilot availability
- Presents choice: "Generate" vs "Generate with AI"
- Sends prompts, collects responses, passes to enhancer
- Shows progress notification during AI processing

### Prompt design

Prompts return parseable JSON. Each covers one enrichment aspect for a batch of operations:

- **Assertion enrichment**: Given response schemas, return assertion lines per operation
- **Test data enrichment**: Given request body schemas, return realistic example bodies
- **Error case enrichment**: Given operations with error responses, return test inputs per error code

### Future AI integration

The VS Code Language Model API integration is the first step. Future paid features may include:
- A standalone Napper agent that generates and maintains test suites outside VS Code
- Continuous test generation that watches spec changes and updates tests
- AI-driven test prioritization based on API change impact analysis

---

## Current Implementation State

### What exists today

**`src/Nap.VsCode/src/openApiGenerator.ts`** (380 lines) — pure TypeScript, no VS Code SDK:
- `generateFromOpenApi(jsonText: string): Result<GenerationResult, string>`
- Supports OpenAPI 3.x and Swagger 2.x (JSON only)
- Extracts base URL from `servers[]` or `host`/`basePath`/`schemes`
- Converts path params `{param}` to `{{param}}`
- Generates example request bodies from schemas (recursive)
- Creates `[assert]` with success status code only
- Adds Content-Type/Accept headers for POST/PUT/PATCH
- Outputs numbered `.nap` files, one `.naplist`, one `.napenv`
- All string literals defined as constants in `constants.ts`

**`src/Nap.VsCode/src/extension.ts`** (lines 412-472) — VS Code integration:
- File picker for spec file
- Output folder picker
- Writes generated files to disk

**`src/Nap.VsCode/src/constants.ts`** (lines 201-241) — all OpenAPI constants

### What is missing

| Gap | Priority | Notes |
|-----|----------|-------|
| Unit tests for openApiGenerator.ts | Critical | 380 lines of pure functions with zero tests |
| `$ref` resolution | High | Most real-world specs use `$ref` extensively |
| YAML support | High | YAML is the dominant format for OpenAPI specs |
| Response body assertions | High | Only generates `status = code` today |
| Tag-based folder organization | High | Currently flat-numbered, should group by tag |
| Query parameter handling | Medium | Not added to URL or `[vars]` |
| Auth scheme handling | Medium | No security scheme detection |
| `[vars]` block for path params | Medium | Params are in URL but no `[vars]` section |
| `generated = true` meta flag | Medium | Spec calls for it, not implemented |
| Error case generation | Medium | Only happy-path tests generated |
| Smarter example values (format/enum) | Medium | Everything is `"example"` or `0` |
| URL-based spec loading | Low | File picker only today |
| `--diff` mode | Low | No re-generation support |
| AI enrichment (Copilot) | Low | Foundation first, then AI layer |

---

## Implementation Phases

### Phase A: Testing Foundation

Write comprehensive unit tests for `openApiGenerator.ts`. Test fixtures for valid OAS3, valid Swagger 2, edge cases, error cases. All pure functions, no VS Code dependency needed.

### Phase B: Core Generation Improvements

- `$ref` resolution (inline all references before generation)
- YAML support (add `js-yaml` dependency)
- Response body assertions from response schemas
- Tag-based folder organization
- `[vars]` block for path parameters
- `generated = true` metadata flag

### Phase C: Enhanced Generation

- Query parameter and auth header generation
- Error case test generation (4xx, 5xx)
- Smarter example values using `format`, `enum`, `minimum`/`maximum`
- URL-based spec loading
- Header assertions

### Phase D: AI-Assisted Enrichment

- `openApiAiEnhancer.ts` module (pure functions)
- VS Code Language Model API integration
- Batch prompt design and response parsing
- UI toggle: "Generate" vs "Generate with AI"
- Enhanced assertions, test data, playlist ordering

### Phase E: Diff and Regeneration

- `--diff` mode in CLI
- `generated = true` detection for safe overwrite
- Preserve custom assertions, update generated ones

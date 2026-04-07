# `openapi-generate` — OpenAPI Test Generation — CLI

> **One click to turn an OpenAPI spec into a comprehensive, runnable test suite.**

---

CRITICAL: START WITH TESTS THAT VERIFY THAT OpenAPI -> .nap is WORKING. THE OPENAPI -> .nap DETERMINISTIC PART IS F#.

---

## Vision

A user points Nap at an OpenAPI 3.x or Swagger 2.x specification and gets a complete test suite: one `.nap` file per operation, organized by tag into subdirectories, with a `.naplist` playlist, a `.napenv` environment file, and meaningful assertions derived from the spec's response schemas.

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

### `openapi-input` — Input formats

| Format | Spec ID | Status |
|--------|---------|--------|
| OpenAPI 3.x JSON | `openapi-oas3` | Implemented |
| Swagger 2.x JSON | `openapi-swagger2` | Implemented |
| YAML (both versions) | `openapi-yaml` | Not yet — needs YAML parser |
| URL-based loading | `openapi-url` | Not yet — file picker only |

---

## What Gets Generated

### `openapi-nap-gen` — Per operation: a `.nap` file

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

### `openapi-tag-dirs` — Per tag: a subdirectory

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

### `openapi-naplist-gen` — Per spec: a `.naplist` playlist

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

### `openapi-napenv-gen` — Per spec: a `.napenv` environment

```toml
baseUrl = https://petstore.example.com/v1
```

---

## Generation Details

### `openapi-baseurl` — Base URL extraction

1. OpenAPI 3.x: first entry in `servers[].url`
2. Swagger 2.x: `{schemes[0]}://{host}{basePath}`
3. Fallback: `https://api.example.com`

### `openapi-params` — Path parameter conversion

OpenAPI `{param}` becomes Nap `{{param}}`. Each path parameter also generates a `[vars]` entry with a placeholder value.

### `openapi-body-gen` — Request body generation

For POST / PUT / PATCH operations:
- If the spec provides an `example`, use it verbatim
- Otherwise, recursively generate from the schema using type-appropriate defaults
- Use `format` hints for smarter defaults (email, uuid, date-time, uri)
- Use `enum` values when available (pick the first)
- Respect `minimum` / `maximum` for numeric types

### `openapi-assert-gen` — Response assertion generation

From the success response schema (first 2xx status code):
- `status = {code}` for the expected status
- `body.{field} exists` for each top-level required property
- `body.{field} = {value}` for fields with known constant values (enums with single value)
- `headers.Content-Type contains "json"` when response media type is `application/json`

### `openapi-query-params` — Query parameter handling

Query parameters from the spec are appended to the URL as `?key={{key}}` and generate corresponding `[vars]` entries.

### `openapi-auth` — Authentication handling

From the spec's `securitySchemes` and per-operation `security` requirements:

| Scheme | Generated output |
|--------|-----------------|
| Bearer token (`http: bearer`) | `Authorization = Bearer {{token}}` header + `token` in `.napenv.local` |
| API key (header) | `{headerName} = {{apiKey}}` header + `apiKey` in `.napenv.local` |
| API key (query) | Appended as query param `?{name}={{apiKey}}` |
| Basic auth | `Authorization = Basic {{basicAuth}}` header |

### `openapi-error-gen` — Error case generation

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

### `openapi-ref` — `$ref` resolution

OpenAPI specs use `$ref` pointers extensively for reusable schemas, parameters, and responses. The generator must resolve all `$ref` pointers by inlining the referenced definitions before generating output. This includes:
- `#/components/schemas/...` (OAS3) and `#/definitions/...` (Swagger 2)
- `#/components/parameters/...`
- `#/components/responses/...`
- Nested `$ref` chains (a schema referencing another schema)

### `openapi-meta-flag` — Generated file metadata

Every generated `.nap` file includes `generated = true` in the `[meta]` block. This allows tooling to distinguish generated files from hand-written ones, enabling safe re-generation and `--diff` mode.

---

## CLI Commands

```sh
# Generate from a local spec
nap generate openapi ./petstore.yaml --output ./petstore/

# Generate from a URL
nap generate openapi https://api.example.com/openapi.json --output ./generated/

# Generate only for specific tags
nap generate openapi ./petstore.yaml --tag users --tag pets --output ./filtered/

# Show what would change without overwriting (diff mode)
nap generate openapi ./petstore.yaml --output ./petstore/ --diff
```

### `openapi-diff` — Diff / regeneration mode

Re-running `nap generate openapi` against an existing output directory with `--diff` compares the spec's current state against previously generated files (identified by `generated = true`). It reports:
- New operations added to the spec
- Operations removed from the spec
- Changed request/response schemas

Without `--diff`, re-generation overwrites files that have `generated = true` but leaves files where that flag has been removed (indicating the user has taken ownership).

---

## Implementation Phases

### Phase A: Core Generation Improvements

- `$ref` resolution (inline all references before generation)
- YAML support (add YAML parser)
- Response body assertions from response schemas
- Tag-based folder organization
- `[vars]` block for path parameters
- `generated = true` metadata flag

### Phase B: Enhanced Generation

- Query parameter and auth header generation
- Error case test generation (4xx, 5xx)
- Smarter example values using `format`, `enum`, `minimum`/`maximum`
- URL-based spec loading
- Header assertions

### Phase C: Diff and Regeneration

- `--diff` mode in CLI
- `generated = true` detection for safe overwrite
- Preserve custom assertions, update generated ones

---

## TODO

### Phase A: Core Generation Improvements
- [ ] `$ref` resolution (inline all references before generation)
- [ ] YAML support
- [ ] Response body assertions from response schemas
- [ ] Tag-based folder organization
- [ ] `[vars]` block for path parameters
- [ ] `generated = true` metadata flag

### Phase B: Enhanced Generation
- [ ] Query parameter and auth header generation
- [ ] Error case test generation (4xx, 5xx)
- [ ] Smarter example values using `format`, `enum`, `minimum`/`maximum`
- [ ] URL-based spec loading
- [ ] Header assertions

### Phase C: Diff and Regeneration
- [ ] `--diff` mode in CLI
- [ ] `generated = true` detection for safe overwrite
- [ ] Preserve custom assertions, update generated ones

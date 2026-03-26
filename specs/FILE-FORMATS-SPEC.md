# Nap File Formats

Specifications for `.nap`, `.napenv`, and `.naplist` file formats. These are shared between the CLI and all IDE extensions.

---

## `nap-file` — `.nap` Request File

Each `.nap` file defines one **request** plus its optional **setup**, **assertions**, and **script reference**.

### `nap-minimal` — Minimal example

```nap
GET https://api.example.com/users
```

### `nap-full` — Full anatomy

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

### `nap-design` — Key design decisions

- **TOML-inspired syntax** — familiar, unambiguous, easy to parse.
- **`{{variable}}`** interpolation (`env-interpolation`) throughout — variables resolved from env files, CLI flags, or parent playlist scope.
- **`[assert]` block** — declarative assertions that cover ~80% of cases without scripting:
  - `assert-status` — `status = 200` — HTTP status code
  - `assert-equals` — `body.path = value` — JSONPath equality
  - `assert-exists` — `body.path exists` — presence check
  - `assert-matches` — `body.path matches "pattern"` — glob pattern match
  - `assert-contains` — `headers.Content-Type contains "json"` — substring check
  - `assert-lt` — `duration < 500ms` — less-than comparison
  - `assert-gt` — `body.count > 0` — greater-than comparison
- **`[script]` block** — references external `.fsx`/`.csx` files for pre/post hooks (see `script-fsx`, `script-csx`).
- `nap-comments` — Comments with `#`.

#### `http-methods` — Supported HTTP Methods

GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS

---

## `env-file` — `.napenv` Environment File

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

### `env-resolution` — Variable resolution order (highest wins)

1. CLI `--var key=value` flags (`cli-var`)
2. `env-local` — `.napenv.local`
3. `env-named` — Named environment file (e.g. `.napenv.staging`)
4. `env-base` — Base `.napenv`
5. `nap-vars` — `[vars]` block in the `.nap` file

---

## `collection-folder` — Collections: Folder-Based

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

`collection-sort` — Execution order within a folder: **filename sort** (use numeric prefixes `01_`, `02_` to control order).

---

## `naplist-file` — `.naplist` Playlist File

A `.naplist` file is an explicit ordered list of steps. Steps can reference:
- `naplist-nap-step` — Individual `.nap` files (by relative path)
- `naplist-folder-step` — Folders (run all `.nap` files in that folder, sorted)
- `naplist-nested` — Other `.naplist` files (nested playlists — fully recursive)
- `naplist-script-step` — `.fsx` or `.csx` scripts

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

### `naplist-var-scope` — Variable scoping in playlists

- A `[vars]` block (`naplist-vars`) in a `.naplist` sets variables for all steps in that playlist.
- Scripts can use `ctx.Set` (`script-context`) to pass variables **forward** to subsequent steps in the same playlist.
- Nested `.naplist` files (`naplist-nested`) inherit the parent's variable scope unless they override.

# Nap File Formats

Nap uses plain-text, TOML-inspired files to define requests, playlists, environments, and scripts. All files are git-friendly and work identically from the CLI and the VSCode extension.

---

## `.nap` — Request Files

Each `.nap` file defines a single HTTP request with optional metadata, variables, headers, body, assertions, and script hooks.

### Minimal Request

The simplest `.nap` file is just an HTTP method and URL on one line:

```nap
GET https://api.example.com/users
```

This is the **shorthand format** — no sections needed.

### Full Format

```nap
[meta]
name        = "Get user by ID"
description = "Fetches a single user and asserts shape"
tags        = ["users", "smoke"]

[vars]
userId = "42"

[request]
method  = GET
url     = https://api.example.com/users/{{userId}}

[request.headers]
Authorization = Bearer {{token}}
Accept        = application/json

[request.body]
content-type = application/json
"""
{
  "name": "Alice",
  "email": "alice@example.com"
}
"""

[assert]
status  = 200
body.id = {{userId}}
body.name exists
headers.Content-Type contains "json"
duration < 500ms

[script]
pre  = ./scripts/auth.fsx
post = ./scripts/validate-user.fsx
```

### Sections

#### `[meta]` (optional)

Human-readable metadata. Not used during execution.

| Field         | Description                          |
|---------------|--------------------------------------|
| `name`        | Display name for the request         |
| `description` | Longer description                   |
| `tags`        | Array of tags for filtering          |

#### `[vars]` (optional)

Default variable values. These have the **lowest priority** in the variable resolution chain (see Environment Files below).

```nap
[vars]
userId = "42"
baseUrl = "https://api.example.com"
```

#### `[request]` (required in full format)

| Field    | Description                                  |
|----------|----------------------------------------------|
| `method` | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `url`    | Request URL, supports `{{variable}}` interpolation |

#### `[request.headers]` (optional)

Key-value pairs for HTTP headers:

```nap
[request.headers]
Authorization = Bearer {{token}}
Accept        = application/json
Content-Type  = application/json
```

#### `[request.body]` (optional)

Request body for `POST`, `PUT`, and `PATCH` requests. The body content is wrapped in triple quotes (`"""`):

```nap
[request.body]
content-type = application/json
"""
{
  "title": "New Post",
  "body": "Content here",
  "userId": {{userId}}
}
"""
```

Variables (`{{variable}}`) are interpolated inside the body.

#### `[assert]` (optional)

Declarative assertions that run after the response is received. No scripting needed for common checks.

| Syntax                              | Description                        |
|-------------------------------------|------------------------------------|
| `status = 200`                      | HTTP status code equality          |
| `body.path = value`                 | JSON path equality                 |
| `body.path exists`                  | JSON field presence check          |
| `headers.Name contains "substring"` | Header substring match             |
| `duration < 500ms`                  | Response time assertion (supports `<`, `>`, `=`) |

#### `[script]` (optional)

References external `.fsx` (F# script) files for pre/post hooks:

```nap
[script]
pre  = ./scripts/setup.fsx       # runs before the request
post = ./scripts/validate.fsx    # runs after the response
```

### Variable Interpolation

Use `{{variableName}}` anywhere in URLs, headers, body, and assertion values. Variables are resolved from the environment chain (see `.napenv` below).

### Comments

Lines starting with `#` are comments:

```nap
# This request tests user creation
POST https://api.example.com/users
```

---

## `.naplist` — Playlist Files

A `.naplist` file defines an ordered sequence of steps to execute. Steps can reference `.nap` files, folders, other playlists, or F# scripts.

### Example

```naplist
[meta]
name = "Smoke Test Suite"
env  = staging

[vars]
timeout = "5000"

[steps]
./auth/01_login.nap
./auth/02_refresh-token.nap
./users/01_get-user.nap
./regression/core.naplist
```

### Sections

#### `[meta]` (optional)

| Field         | Description                                      |
|---------------|--------------------------------------------------|
| `name`        | Display name for the playlist                    |
| `description` | Longer description                               |
| `env`         | Default environment name for all steps           |

#### `[vars]` (optional)

Variables scoped to this playlist. All steps inherit these values.

#### `[steps]` (required)

One step per line. Each step is a relative file path:

| Step Type          | Example                         | Behaviour                            |
|--------------------|---------------------------------|--------------------------------------|
| `.nap` file        | `./users/get-user.nap`          | Run the single request               |
| `.naplist` file    | `./regression/core.naplist`     | Run the nested playlist recursively  |
| Folder             | `./users/`                      | Run all `.nap` files in the folder   |
| `.fsx` script      | `./scripts/setup.fsx`           | Execute the F# script                |

Steps execute **sequentially** in the order listed. Lines starting with `#` are comments. Blank lines are ignored.

### Variable Scoping

- `[vars]` in a playlist apply to all steps within it.
- Scripts can set variables for downstream steps using `ctx.Set`.
- Nested playlists inherit the parent's variables unless they override them.

---

## `.napenv` — Environment Files

Environment files define variables for different deployment targets. They use simple `key = value` TOML syntax.

### File Hierarchy

Nap looks for environment files in the working directory. Multiple files are merged with this priority (highest wins):

| Priority | Source                          | Description                        |
|----------|----------------------------------|------------------------------------|
| 1        | `--var key=value` CLI flags      | Command-line overrides             |
| 2        | `.napenv.local`                  | Local secrets (gitignored)         |
| 3        | `.napenv.<name>`                 | Named environment (e.g. `.napenv.staging`) |
| 4        | `.napenv`                        | Base environment (checked into git) |
| 5        | `[vars]` in `.nap`/`.naplist`    | File-level defaults                |

### Examples

**`.napenv`** (base, checked into git):
```toml
baseUrl = "https://api.example.com"
userId  = "42"
```

**`.napenv.local`** (secrets, gitignored):
```toml
token = "eyJhbGci..."
apiKey = "sk-secret-key"
```

**`.napenv.staging`** (named environment):
```toml
baseUrl = "https://staging.api.example.com"
token   = "staging-token"
```

Select an environment with the `--env` flag:
```sh
nap run ./smoke.naplist --env staging
```

---

## `.fsx` — F# Scripts

F# Interactive scripts for pre/post execution hooks and orchestration. Scripts are referenced from `[script]` blocks in `.nap` files or as steps in `.naplist` files.

### Script Context

The runtime injects a `NapContext` object into every script:

```fsharp
type NapResponse = {
    StatusCode : int
    Headers    : Map<string, string>
    Body       : string
    Json       : JsonElement
    Duration   : TimeSpan
}

type NapContext = {
    Vars      : Map<string, string>
    Request   : HttpRequestMessage     // pre-script only
    Response  : NapResponse            // post-script only
    Env       : string
    Fail      : string -> unit         // fail the test with a message
    Set       : string -> string -> unit  // set variable for downstream steps
    Log       : string -> unit         // write to test output
}
```

### Example: Post-Request Validation

```fsharp
let user = ctx.Response.Json

if user.GetProperty("id").GetString() <> ctx.Vars["userId"] then
    ctx.Fail "User ID mismatch"

let token = user.GetProperty("sessionToken").GetString()
ctx.Set "token" token
```

### Orchestration Scripts

Scripts can also drive execution by using the injected `NapRunner`:

```fsharp
let loginResult = nap.Run "./auth/01_login.nap"
ctx.Set "token" (loginResult.Response.Json.GetProperty("token").GetString())

for userId in [1; 2; 3] do
    ctx.Set "userId" (string userId)
    let result = nap.Run "./users/get-user.nap"
    if result.Response.StatusCode <> 200 then
        ctx.Fail $"User {userId} not found"
```

---

## Directory Structure

A typical Nap project:

```
my-api/
├── .napenv                    # Base variables (checked in)
├── .napenv.local              # Secrets (gitignored)
├── .napenv.staging            # Staging environment
├── auth/
│   ├── 01_login.nap
│   └── 02_refresh-token.nap
├── users/
│   ├── 01_get-user.nap
│   ├── 02_create-user.nap
│   └── 03_delete-user.nap
├── scripts/
│   ├── setup.fsx
│   └── teardown.fsx
└── smoke.naplist
```

Use numeric prefixes (`01_`, `02_`) to control execution order when running a folder.

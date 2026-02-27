<p align="center">
  <img src="src/Nap.VsCode/media/napper-icon.png" alt="Napper logo" width="100" height="100">
</p>

<h1 align="center">Napper</h1>

<p align="center">
  <strong>API Testing, Supercharged.</strong><br>
  Napper is a free, open-source API testing tool that runs from the command line and integrates natively with VS Code.
  Define HTTP requests as plain text <code>.nap</code> files, add declarative assertions, chain them into test suites, and run everything in CI/CD with JUnit output.
  As simple as curl for quick requests. As powerful as F# for full test suites.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=nimblesite.napper">VS Code Marketplace</a> &middot;
  <a href="https://napper.dev">Website</a> &middot;
  <a href="https://napper.dev/docs/">Documentation</a> &middot;
  <a href="https://github.com/MelbourneDeveloper/ApiTesting/releases">Releases</a>
</p>

---

<p align="center">
  <img src="screenshot.png" alt="Napper VS Code extension showing playlist test results with response headers and body inspection" width="720">
</p>

---

## What can Napper do?

Everything you need for API testing. Nothing you don't.

- **CLI First** &mdash; The command line is the product. Run requests, execute test suites, and integrate with CI/CD pipelines from your terminal.
- **VS Code Native** &mdash; Full extension with syntax highlighting, request explorer, environment switching, and Test Explorer integration. Never leave your editor.
- **F# Scripting** &mdash; Full power of F# for pre/post request hooks. Extract tokens, build dynamic payloads, orchestrate complex flows. No limits.
- **Declarative Assertions** &mdash; Assert on status codes, JSON paths, headers, and response times with a clean, readable syntax. No scripting required for simple checks.
- **Composable Playlists** &mdash; Chain requests into test suites with `.naplist` files. Nest playlists, reference folders, pass variables between steps.
- **Plain Text, Git Friendly** &mdash; Every request is a `.nap` file. Every environment is a `.napenv` file. Version control everything. No binary blobs, no lock-in.

## Quick Start

### Install the VS Code Extension

```sh
code --install-extension nimblesite.napper
```

### Or grab the CLI binary

Download from the [latest release](https://github.com/MelbourneDeveloper/ApiTesting/releases).

## How do you use Napper?

### Minimal request

A `.nap` file can be as simple as one line:

```
GET https://httpbin.org/get
```

### POST with body and assertions

```
[request]
POST {{baseUrl}}/posts

[request.headers]
Content-Type = application/json
Accept = application/json

[request.body]
"""
{
  "title": "Nap Integration Test",
  "body": "This post was created by the Nap API testing tool",
  "userId": {{userId}}
}
"""

[assert]
status = 201
body.id exists
body.title = Nap Integration Test
body.userId = {{userId}}
```

### Full request with metadata and scripting

```
[meta]
name = Get user by ID
description = Fetches a single user and asserts shape
tags = users, smoke

[vars]
userId = 42

[request]
GET https://api.example.com/users/{{userId}}

[request.headers]
Authorization = Bearer {{token}}
Accept = application/json

[assert]
status = 200
body.id = {{userId}}
body.name exists
headers.Content-Type contains "json"
duration < 500ms

[script]
pre = ./scripts/auth.fsx
post = ./scripts/validate-user.fsx
```

### Run from CLI

```sh
# Run a single request
napper run ./health.nap

# Run a full test suite
napper run ./smoke.naplist

# With environment + JUnit output
napper run ./tests/ --env staging --output junit
```

## What file formats does Napper use?

| Extension | Purpose | Example |
|-----------|---------|---------|
| `.nap` | Single HTTP request with optional assertions and scripts | `get-users.nap` |
| `.naplist` | Ordered playlist of steps (requests, scripts, nested playlists) | `smoke.naplist` |
| `.napenv` | Environment variables (base config, checked into git) | `.napenv` |
| `.napenv.local` | Local secrets (gitignored) | `.napenv.local` |
| `.napenv.<name>` | Named environment | `.napenv.staging` |
| `.fsx` | F# scripts for pre/post hooks and orchestration | `setup.fsx` |

### Playlists

```
[meta]
name = JSONPlaceholder CRUD
description = Full create-read-update-delete lifecycle for posts

[steps]
../scripts/setup.fsx
./01_get-posts.nap
./02_get-post-by-id.nap
./03_create-post.nap
./04_update-post.nap
./05_patch-post.nap
./06_delete-post.nap
../scripts/teardown.fsx
```

### Environments

**`.napenv`** (base, checked into git):
```
baseUrl = https://jsonplaceholder.typicode.com
userId = 1
postId = 1
```

**`.napenv.local`** (secrets, gitignored):
```
token = eyJhbGci...
apiKey = sk-secret-key
```

Select a named environment with `--env`:
```sh
napper run ./smoke.naplist --env staging
```

Variable priority (highest wins):
1. `--var key=value` CLI flags
2. `.napenv.local`
3. `.napenv.<name>` (named environment)
4. `.napenv` (base)
5. `[vars]` in `.nap`/`.naplist` files

## CLI Reference

```
Usage:
  napper run <file|folder>     Run a .nap file, .naplist playlist, or folder
  napper check <file>          Validate a .nap or .naplist file
  napper help                  Show this help

Options:
  --env <name>              Environment name (loads .napenv.<name>)
  --var <key=value>         Variable override (repeatable)
  --output <format>         Output: pretty (default), junit, json
```

| Exit Code | Meaning |
|-----------|---------|
| 0 | All assertions passed |
| 1 | One or more assertions failed |
| 2 | Runtime error (network, script error, parse error) |

## How does Napper compare to other API testing tools?

| Feature | Napper | Postman | Bruno | .http files |
|---------|--------|---------|-------|-------------|
| CLI-first design | Yes | No | GUI-first | No CLI |
| VS Code integration | Native | Separate app | Separate app | Built-in |
| Git-friendly files | Yes | JSON blobs | Yes | Yes |
| Assertions | Declarative + scripts | JS scripts | JS scripts | None |
| Full scripting language | F# (.fsx) | Sandboxed JS | Sandboxed JS | None |
| CI/CD output formats | JUnit, TAP, JSON | Via Newman | Via CLI | None |
| Test Explorer | Native | No | No | No |
| Free & open source | Yes | Freemium | Yes | Yes |
| No account required | Yes | Account needed | Yes | Yes |

## Project Structure

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

## License

MIT

---
layout: layouts/blog.njk
title: "Introducing Napper: CLI-First API Testing for VS Code with C# and F# Scripting"
date: 2026-02-27
author: Christian Findlay
tags: posts
category: announcements
excerpt: "Meet Napper — a free, open-source API testing tool that puts the CLI first, stores everything as plain text, and gives you the full power of C# and F# scripting with the entire .NET ecosystem."
description: "Introducing Napper, a free, open-source, CLI-first API testing tool for VS Code. A modern alternative to Postman, Bruno, and .http files with C# and F# scripting, declarative assertions, composable test suites, and CI/CD integration via JUnit XML."
keywords: "API testing, VS Code extension, C# scripting, F# scripting, CLI API testing, Postman alternative, Bruno alternative, HTTP testing, REST API testing, .NET API testing, CI/CD testing, JUnit XML, open source API testing tool"
---

# Introducing Napper: CLI-First API Testing for VS Code with C# and F# Scripting

API testing tools have a problem. They're either too simple ([.http files](/docs/vs-http-files/) with no assertions and no CLI) or too heavy ([Postman](/docs/vs-postman/) with its mandatory accounts, cloud sync, and paid tiers). [Bruno](/docs/vs-bruno/) moved the needle with git-friendly collections, but it's still a GUI-first tool with sandboxed JavaScript.

**[Napper](https://github.com/MelbourneDeveloper/napper)** takes a different approach. It's a free, open-source API testing tool where the CLI is the primary interface, everything is stored as plain text, and you get full C# and F# scripting with access to the entire [.NET](https://dotnet.microsoft.com/) ecosystem.

## The CLI is the product

Napper is not a GUI with a CLI bolted on. The command line is the primary interface. Every feature works from the terminal first, then from [VS Code](https://code.visualstudio.com/) second.

```bash
# Run a single request
napper run ./health.nap

# Run a full test suite
napper run ./smoke.naplist

# Run with a specific environment and JUnit XML output for CI/CD
napper run ./tests/ --env staging --output junit > results.xml
```

The CLI binary is self-contained with no runtime dependencies. It runs on Windows, macOS, and Linux. Download it from [GitHub Releases](https://github.com/MelbourneDeveloper/napper/releases) and you're ready to go.

## Plain text everything — git-friendly by design

Every request is a [.nap file](/docs/nap-files/). Every test suite is a [.naplist file](/docs/naplist-files/). Every environment is a [.napenv file](/docs/environments/). All plain text. All in your repo. Diffs are readable. Code reviews are meaningful. No binary blobs, no JSON dumps, no proprietary formats.

Here's what a `.nap` file looks like:

{% raw %}
```
[meta]
name = Create a new post
tags = posts, crud

[request]
POST {{baseUrl}}/posts

[request.headers]
Content-Type = application/json
Authorization = Bearer {{token}}

[request.body]
"""
{
  "title": "Nap Integration Test",
  "body": "Created by Napper",
  "userId": 1
}
"""

[assert]
status = 201
body.id exists
body.title = Nap Integration Test
duration < 2s
```
{% endraw %}

That's a complete HTTP request with headers, a JSON body, and [declarative assertions](/docs/assertions/) — all in one readable file. No scripting needed for the common cases.

## C# scripting — the full power of .NET, no sandbox

This is where Napper breaks away from every other API testing tool. [Postman](/docs/vs-postman/) and [Bruno](/docs/vs-bruno/) give you a sandboxed JavaScript environment with limited APIs. Napper gives you **full [C# scripting](/docs/csharp-scripting/)** with `.csx` files and access to the entire .NET ecosystem.

### Pre-request and post-request hooks in C#

Reference C# scripts directly in your `.nap` files:

```
[script]
pre = ./scripts/setup-auth.csx
post = ./scripts/validate-response.csx
```

A pre-request script that generates an auth token:

```csharp
// setup-auth.csx
var token = GenerateToken();
ctx.Set("token", token);
ctx.Log($"Token generated: {token[..8]}...");
```

A post-request script that extracts data and chains it to the next step:

```csharp
// validate-response.csx
var body = ctx.Response.Json;

// Extract the user ID and pass it to the next step
var userId = body.GetProperty("id").GetInt32();
ctx.Set("userId", userId.ToString());

// Complex validation with full .NET
if (userId <= 0)
    ctx.Fail("User ID must be positive");

ctx.Log($"Created user {userId}");
```

### C# orchestration scripts

For complex multi-step flows, C# orchestration scripts control execution directly. Use them to run data-driven tests, handle authentication flows, or orchestrate entire CRUD lifecycles:

```csharp
// orchestration.csx
using System.Net.Http;
using System.Text;

// Run a request and get the result
var loginResult = runner.Run("./auth/login.nap");

// Extract token from response
var token = loginResult.Response.Json.GetProperty("token").GetString();
runner.Vars["token"] = token;

// Run a full test suite with the token
var results = runner.RunList("./crud-tests.naplist");

// Data-driven testing with a loop
foreach (var userId in new[] { 1, 2, 3, 42, 99 })
{
    runner.Vars["userId"] = userId.ToString();
    var result = runner.Run("./users/get-user.nap");
    if (result.Failed)
        runner.Log($"Failed for user {userId}: {result.Error}");
}
```

Reference orchestration scripts as steps in a `.naplist` file:

```
[meta]
name = "CRUD Lifecycle (C#)"
description = "Full create-read-update-delete with C# scripts"

[steps]
../scripts/setup.csx
./01_get-posts.nap
./02_get-post-by-id.nap
./03_create-post.nap
./04_update-post.nap
./05_patch-post.nap
./06_delete-post.nap
../scripts/teardown.csx
```

C# scripts can use `HttpClient`, `System.Text.Json`, `System.Security.Cryptography`, LINQ, `async`/`await` — everything .NET offers. Parse XML, query databases, call gRPC services, validate JWT tokens, generate test data with [Bogus](https://github.com/bchavez/Bogus), or reference any [NuGet](https://www.nuget.org/) package. No sandbox. No limitations.

## F# scripting — functional-first with the same power

Prefer a functional approach? Napper also supports [F# scripting](/docs/fsharp-scripting/) with `.fsx` files. The same capabilities, the same .NET ecosystem, but with F#'s concise syntax, pattern matching, and immutability by default:

```fsharp
// validate-response.fsx
let body = ctx.Response.Json
let userId = body.GetProperty("id").GetInt32()
ctx.Set "userId" (string userId)

if userId <= 0 then
    ctx.Fail "User ID must be positive"

ctx.Log $"Created user {userId}"
```

You can mix C# and F# scripts in the same project. A single `.naplist` can reference both `.csx` and `.fsx` files as steps. Choose whichever .NET language your team prefers — or use both.

## Declarative assertions — no scripting needed for the common cases

Most API tests check the same things: status codes, JSON values, headers, and response times. Napper's [assertion syntax](/docs/assertions/) handles all of this declaratively — no scripting required:

```
[assert]
status = 200
body.id = 1
body.name exists
body.email contains "@"
headers.Content-Type contains "application/json"
duration < 500ms
```

All assertions are evaluated and reported individually. When the declarative syntax isn't enough, drop into [C#](/docs/csharp-scripting/) or [F#](/docs/fsharp-scripting/) for complex validation logic.

## Composable test suites with .naplist files

Chain requests into ordered test suites with [.naplist files](/docs/naplist-files/). Nest playlists inside other playlists, reference entire folders, and mix `.nap` requests with `.csx` and `.fsx` scripts:

```
[meta]
name = Full API Suite

[steps]
./scripts/setup.csx
./auth/login.nap
./crud-tests.naplist
./edge-cases/
./scripts/teardown.csx
```

## Built for CI/CD from day one

Napper is designed for [continuous integration](/docs/ci-integration/). The CLI binary is self-contained with no runtime dependencies. It outputs [JUnit XML](https://github.com/testmoapp/junitxml), TAP, JSON, and NDJSON formats natively.

### GitHub Actions

```yaml
name: API Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download Napper CLI
        run: |
          curl -L -o napper https://github.com/MelbourneDeveloper/napper/releases/latest/download/napper-linux-x64
          chmod +x napper
          sudo mv napper /usr/local/bin/

      - name: Run API tests
        run: napper run ./tests/ --env ci --output junit > results.xml

      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: api-test-results
          path: results.xml
```

Napper exits with code `0` when all assertions pass and `1` when any assertion fails. This integrates natively with [GitHub Actions](https://github.com/features/actions), [GitLab CI](https://docs.gitlab.com/ci/), [Jenkins](https://www.jenkins.io/), [Azure DevOps](https://azure.microsoft.com/en-us/products/devops), and any CI platform that fails on non-zero exit codes.

## VS Code extension — native editor integration

The [Napper VS Code extension](https://marketplace.visualstudio.com/items?itemName=nimblesite.napper) brings the full experience into your editor:

- **Syntax highlighting** for `.nap`, `.naplist`, and `.napenv` files
- **Request explorer** in the sidebar with a tree view of all requests and playlists
- **Run requests** directly from the editor with a single click
- **Environment switching** between dev, staging, production, and custom environments
- **Test Explorer integration** with native VS Code test results
- **Response inspection** with headers, body, and timing information
- **Copy as curl** to share requests with teammates who don't use Napper

Install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nimblesite.napper):

```bash
code --install-extension nimblesite.napper
```

## How does Napper compare?

| Feature | Napper | [Postman](/docs/vs-postman/) | [Bruno](/docs/vs-bruno/) | [.http files](/docs/vs-http-files/) |
|---------|--------|---------|-------|-------------|
| CLI-first design | Yes | No | GUI-first | No CLI |
| VS Code integration | Native | Separate app | Separate app | REST Client |
| Git-friendly files | Plain text | JSON blobs | Yes | Yes |
| Assertions | Declarative + scripts | JS scripts | JS scripts | None |
| Scripting language | **C# + F# (.NET)** | Sandboxed JS | Sandboxed JS | None |
| CI/CD output | JUnit, TAP, JSON | Via Newman | Via CLI | None |
| Test Explorer | Native | No | No | No |
| Account required | No | Yes | No | No |
| Price | Free (MIT) | Freemium | Free (MIT) | Free |

## Get started in 5 minutes

1. [Install the CLI or VS Code extension](/docs/installation/)
2. Follow the [Quick Start guide](/docs/quick-start/) to create your first request
3. Add [assertions](/docs/assertions/) to validate responses
4. Set up [environments](/docs/environments/) for different targets
5. Write [C# scripts](/docs/csharp-scripting/) or [F# scripts](/docs/fsharp-scripting/) for advanced flows
6. Run everything in [CI/CD](/docs/ci-integration/) with JUnit XML output

Napper is free, open source, and [MIT licensed](https://github.com/MelbourneDeveloper/napper/blob/main/LICENSE). Browse the source code and examples on [GitHub](https://github.com/MelbourneDeveloper/napper).

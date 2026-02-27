---
layout: layouts/docs.njk
title: F# Scripting
description: "Use F# scripts for pre/post request hooks and test orchestration. Full power of .NET with no limits."
keywords: "F# scripting, fsx, pre-request script, post-request script, test orchestration"
eleventyNavigation:
  key: "F# Scripting"
  order: 7
---

# F# Scripting

Napper supports F# Interactive scripts (`.fsx` files) for pre/post request hooks and test orchestration. This gives you the full power of .NET for complex testing scenarios.

## Pre/post request hooks

Reference scripts in your `.nap` file:

```
[script]
pre = ./scripts/setup-auth.fsx
post = ./scripts/validate-response.fsx
```

### Pre-request scripts

Run before the HTTP request is sent. Use them to set up authentication, generate dynamic data, or modify variables.

```fsharp
// setup-auth.fsx
let token = generateToken ()
ctx.Set "token" token
ctx.Log $"Token generated: {token.[..8]}..."
```

### Post-request scripts

Run after the response is received. Use them for complex validation, data extraction, or chaining.

```fsharp
// validate-response.fsx
let body = ctx.Response.Json

// Extract and pass to next step
let userId = body.GetProperty("id").GetInt32()
ctx.Set "userId" (string userId)

// Complex validation
if userId <= 0 then
    ctx.Fail "User ID must be positive"

ctx.Log $"Created user {userId}"
```

## NapContext

Scripts receive a `ctx` object with these members:

| Member | Available | Description |
|--------|-----------|-------------|
| `Vars` | Pre + Post | Map of all resolved variables |
| `Request` | Pre only | The `HttpRequestMessage` about to be sent |
| `Response` | Post only | Response with `StatusCode`, `Headers`, `Body`, `Json`, `Duration` |
| `Env` | Pre + Post | Current environment name |
| `Set key value` | Pre + Post | Set a variable for downstream steps |
| `Fail message` | Pre + Post | Fail the test with a message |
| `Log message` | Pre + Post | Write to test output |

## Orchestration scripts

For complex flows, use orchestration scripts that control execution directly:

```fsharp
// orchestration.fsx

// Run a request and get the result
let loginResult = runner.Run "./auth/login.nap"

// Extract token from response
let token = loginResult.Response.Json.GetProperty("token").GetString()
runner.Vars.["token"] <- token

// Run a suite of tests with the token
let results = runner.RunList "./crud-tests.naplist"

// Data-driven testing
for userId in [1; 2; 3; 42; 99] do
    runner.Vars.["userId"] <- string userId
    let result = runner.Run "./users/get-user.nap"
    if result.Failed then
        runner.Log $"Failed for user {userId}: {result.Error}"
```

Reference orchestration scripts in a `.naplist`:

```
[steps]
./scripts/orchestration.fsx
```

## NapRunner

Orchestration scripts receive a `runner` object:

| Member | Description |
|--------|-------------|
| `Run path` | Run a `.nap` file, returns result |
| `RunList path` | Run a `.naplist` file, returns result list |
| `Vars` | Shared mutable variable dictionary |
| `Log message` | Write to test output |

## Requirements

F# scripts require the **.NET 10 SDK** installed on the machine. The Napper CLI binary itself is self-contained, but `.fsx` scripts are executed via F# Interactive.

Prefer C#? See [C# Scripting](/docs/csharp-scripting/) for the same capabilities using `.csx` files.

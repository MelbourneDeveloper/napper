---
layout: layouts/docs.njk
title: C# Scripting
description: "Use C# scripts for pre/post request hooks and test orchestration. Full power of .NET with no limits."
keywords: "C# scripting, csx, pre-request script, post-request script, test orchestration, dotnet script"
eleventyNavigation:
  key: "C# Scripting"
  order: 8
---

# C# Scripting

Napper supports C# scripts (`.csx` files) for pre/post request hooks and test orchestration. This gives you the full power of .NET for complex testing scenarios, using familiar C# syntax.

## Pre/post request hooks

Reference scripts in your `.nap` file:

```
[script]
pre = ./scripts/setup-auth.csx
post = ./scripts/validate-response.csx
```

### Pre-request scripts

Run before the HTTP request is sent. Use them to set up authentication, generate dynamic data, or modify variables.

```csharp
// setup-auth.csx
var token = GenerateToken();
ctx.Set("token", token);
ctx.Log($"Token generated: {token[..8]}...");
```

### Post-request scripts

Run after the response is received. Use them for complex validation, data extraction, or chaining.

```csharp
// validate-response.csx
var body = ctx.Response.Json;

// Extract and pass to next step
var userId = body.GetProperty("id").GetInt32();
ctx.Set("userId", userId.ToString());

// Complex validation
if (userId <= 0)
    ctx.Fail("User ID must be positive");

ctx.Log($"Created user {userId}");
```

## NapContext

Scripts receive a `ctx` object with these members:

| Member | Available | Description |
|--------|-----------|-------------|
| `Vars` | Pre + Post | Dictionary of all resolved variables |
| `Request` | Pre only | The `HttpRequestMessage` about to be sent |
| `Response` | Post only | Response with `StatusCode`, `Headers`, `Body`, `Json`, `Duration` |
| `Env` | Pre + Post | Current environment name |
| `Set(key, value)` | Pre + Post | Set a variable for downstream steps |
| `Fail(message)` | Pre + Post | Fail the test with a message |
| `Log(message)` | Pre + Post | Write to test output |

## Orchestration scripts

For complex flows, use orchestration scripts that control execution directly:

```csharp
// orchestration.csx

// Run a request and get the result
var loginResult = runner.Run("./auth/login.nap");

// Extract token from response
var token = loginResult.Response.Json.GetProperty("token").GetString();
runner.Vars["token"] = token;

// Run a suite of tests with the token
var results = runner.RunList("./crud-tests.naplist");

// Data-driven testing
foreach (var userId in new[] { 1, 2, 3, 42, 99 })
{
    runner.Vars["userId"] = userId.ToString();
    var result = runner.Run("./users/get-user.nap");
    if (result.Failed)
        runner.Log($"Failed for user {userId}: {result.Error}");
}
```

Reference orchestration scripts in a `.naplist`:

```
[steps]
./scripts/orchestration.csx
```

## NapRunner

Orchestration scripts receive a `runner` object:

| Member | Description |
|--------|-------------|
| `Run(path)` | Run a `.nap` file, returns result |
| `RunList(path)` | Run a `.naplist` file, returns result list |
| `Vars` | Shared mutable variable dictionary |
| `Log(message)` | Write to test output |

## Choosing between F# and C#

Both F# and C# scripts have full access to the .NET ecosystem. Choose based on your team's preference:

| | F# (.fsx) | C# (.csx) |
|--|-----------|-----------|
| Syntax style | Functional, concise | Object-oriented, familiar |
| Pattern matching | Native | Switch expressions |
| Immutability | Default | Opt-in |
| Ecosystem familiarity | Smaller community | Most .NET developers |

You can mix F# and C# scripts in the same project. A `.naplist` can reference both `.fsx` and `.csx` files as steps.

## Requirements

C# scripts require the **.NET 10 SDK** installed on the machine. The Napper CLI binary itself is self-contained, but `.csx` scripts are executed via the .NET scripting runtime.

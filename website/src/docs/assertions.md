---
layout: layouts/docs.njk
title: Assertions
description: "Declarative assertions for HTTP responses. Check status codes, JSON paths, headers, and response times."
keywords: "assertions, testing, status code, JSON path, response validation"
eleventyNavigation:
  key: Assertions
  order: 8
---

# Assertions

The `[assert]` section in `.nap` files provides declarative assertions on HTTP responses. No scripting needed for common checks.

## Syntax

Each assertion is a single line in the form:

```
target operator value
```

## Status code

```
[assert]
status = 200
```

## JSON body paths

Assert on values in the JSON response body using dot notation:

```
[assert]
body.id = 1
body.name = "Ada Lovelace"
body.email exists
body.users.length > 0
```

## Headers

Check response headers:

```
[assert]
headers.Content-Type contains "application/json"
headers.X-Request-Id exists
```

## Response time

Assert that the response completes within a time limit:

```
[assert]
duration < 500ms
duration < 2s
```

## Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equals | `status = 200` |
| `>` | Greater than | `body.count > 0` |
| `<` | Less than | `duration < 500ms` |
| `exists` | Field is present | `body.id exists` |
| `contains` | String contains | `headers.Content-Type contains "json"` |

## Multiple assertions

Add as many assertions as you need:

```
[assert]
status = 200
body.id exists
body.name = "Ada Lovelace"
body.email contains "@"
headers.Content-Type contains "application/json"
duration < 1000ms
```

All assertions are evaluated. Napper reports each one as passed or failed.

## Complex assertions with F# scripts

For assertions that go beyond the declarative syntax, use [F# post-request scripts](/docs/fsharp-scripting/):

```
[script]
post = ./scripts/validate-schema.fsx
```

```fsharp
// validate-schema.fsx
let users = ctx.Response.Json.EnumerateArray() |> Seq.toList

for user in users do
    if not (user.TryGetProperty("email") |> fst) then
        ctx.Fail $"User {user.GetProperty("id")} missing email"
```

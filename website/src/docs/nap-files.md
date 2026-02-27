---
layout: layouts/docs.njk
title: ".nap Files"
description: "Complete reference for the .nap request file format. Sections, headers, bodies, variables, and assertions."
keywords: ".nap file format, HTTP request, API request, file format reference"
eleventyNavigation:
  key: ".nap Files"
  order: 4
---

# .nap Files

A `.nap` file defines a single HTTP request with optional metadata, headers, body, assertions, and script hooks.

## Minimal format

The simplest possible `.nap` file is just a method and URL:

```
GET https://api.example.com/health
```

## Full format

{% raw %}
```
[meta]
name = Get user by ID
description = Fetches a single user and validates the response
tags = users, smoke

[vars]
userId = 1

[request]
GET {{baseUrl}}/users/{{userId}}

[request.headers]
Authorization = Bearer {{token}}
Accept = application/json

[assert]
status = 200
body.id = {{userId}}
body.name exists
body.email exists
duration < 1000ms

[script]
post = ./scripts/log-response.fsx
```
{% endraw %}

## Sections

### `[meta]`

Optional metadata about the request.

| Field | Description |
|-------|-------------|
| `name` | Human-readable name displayed in explorers |
| `description` | Longer description for documentation |
| `tags` | Comma-separated tags for filtering |

### `[vars]`

Local variable defaults. These are overridden by environment files and CLI flags.

```
userId = 1
baseUrl = https://api.example.com
```

### `[request]`

The HTTP method and URL. This is the only required part of a `.nap` file.

{% raw %}
```
GET {{baseUrl}}/users/{{userId}}
```
{% endraw %}

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

### `[request.headers]`

Key-value pairs for HTTP headers. Variables are interpolated.

{% raw %}
```
Authorization = Bearer {{token}}
Content-Type = application/json
X-Custom-Header = {{customValue}}
```
{% endraw %}

### `[request.body]`

Request body for `POST`, `PUT`, and `PATCH` requests. Content is wrapped in triple quotes:

```
[request.body]
"""
{
  "name": "Ada Lovelace",
  "email": "ada@example.com"
}
"""
```

### `[assert]`

Declarative assertions on the response. See [Assertions](/docs/assertions/) for the full reference.

### `[script]`

References to F# or C# scripts that run before or after the request.

```
[script]
pre = ./scripts/setup.fsx
post = ./scripts/validate.csx
```

See [F# Scripting](/docs/fsharp-scripting/) and [C# Scripting](/docs/csharp-scripting/) for details.

## Variable interpolation

Use {% raw %}`{{variableName}}`{% endraw %} anywhere in the request. Variables are resolved from (highest priority first):

1. CLI `--var key=value` flags
2. `.napenv.local` (gitignored secrets)
3. `.napenv.<name>` (named environment)
4. `.napenv` (base environment)
5. `[vars]` in the `.nap` file

## Comments

Lines starting with `#` are comments:

```
# This is a comment
[request]
GET https://api.example.com/health
```

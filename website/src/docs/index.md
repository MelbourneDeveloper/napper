---
layout: layouts/docs.njk
title: Introduction
description: "Napper is a free, open-source, CLI-first API testing tool for VS Code. Define HTTP requests as plain text .nap files with declarative assertions and F# scripting. A modern alternative to Postman, Bruno, and .http files."
keywords: "API testing, HTTP client, developer tools, VS Code extension, Postman alternative, Bruno alternative"
eleventyNavigation:
  key: Introduction
  order: 1
---

# Introduction

**Napper** is a free, open-source, CLI-first API testing tool that integrates natively with VS Code. It is a modern alternative to Postman, Bruno, `.http` files, and curl.

Napper is built for developers who want:

- **Simple things to be simple** — a one-off request is nearly as terse as curl
- **Complex things to be possible** — full F# scripting for advanced flows
- **Everything in version control** — plain text files, no binary blobs
- **First-class VS Code support** — syntax highlighting, Test Explorer, environment switching

## How does Napper work?

Every HTTP request is a `.nap` file:

```
GET https://api.example.com/health
```

That's it. One line. Run it from the CLI:

```bash
napper run ./health.nap
```

Or from VS Code with a single click.

## What happens when you need more?

Add headers, bodies, assertions, and environment variables:

```
[meta]
name = Create user

[request]
POST {{baseUrl}}/users

[request.headers]
Content-Type = application/json
Authorization = Bearer {{token}}

[request.body]
"""
{
  "name": "Ada Lovelace",
  "email": "ada@example.com"
}
"""

[assert]
status = 201
body.id exists
duration < 500ms
```

Chain requests into test suites with `.naplist` files. Add F# scripts for advanced orchestration. Output JUnit XML for your CI pipeline.

## Why is the CLI the primary interface?

Napper is not a GUI-first tool with a CLI bolted on. The CLI is the primary interface. The VS Code extension operates on the same files and provides the same features in your editor. This means your API tests work the same way locally and in CI/CD, with no import/export step.

## Next steps

- [Install Napper](/docs/installation/) to get started
- Follow the [Quick Start](/docs/quick-start/) guide
- Learn about [.nap file format](/docs/nap-files/)

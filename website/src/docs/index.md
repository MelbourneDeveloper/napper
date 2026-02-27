---
layout: layouts/docs.njk
title: Introduction
description: "Napper is a CLI-first, test-oriented HTTP API testing tool for developers. An alternative to Postman, Bruno, and .http files."
keywords: "API testing, HTTP client, developer tools, VS Code extension"
eleventyNavigation:
  key: Introduction
  order: 1
---

# Introduction

**Napper** (Network API Protocol) is a CLI-first, test-oriented HTTP API testing tool. It is a modern alternative to Postman, Bruno, `.http` files, and curl.

Napper is built for developers who want:

- **Simple things to be simple** — a one-off request is nearly as terse as curl
- **Complex things to be possible** — full F# scripting for advanced flows
- **Everything in version control** — plain text files, no binary blobs
- **First-class VS Code support** — syntax highlighting, Test Explorer, environment switching

## How it works

Every HTTP request is a `.nap` file:

```
GET https://api.example.com/health
```

That's it. One line. Run it from the CLI:

```bash
napper run ./health.nap
```

Or from VS Code with a single click.

## Scale up when you need to

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

## The CLI is the product

Napper is not a GUI-first tool with a CLI bolted on. The CLI is the primary interface. The VS Code extension operates on the same files and provides the same features in your editor.

## Next steps

- [Install Napper](/docs/installation/) to get started
- Follow the [Quick Start](/docs/quick-start/) guide
- Learn about [.nap file format](/docs/nap-files/)

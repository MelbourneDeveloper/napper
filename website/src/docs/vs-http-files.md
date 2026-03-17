---
layout: layouts/docs.njk
title: "Napper vs .http Files"
description: "Comparing Napper and .http files for API testing. Napper adds assertions, test suites, environments, F# and C# scripting, CLI execution, and a built-in converter to migrate your existing .http files."
keywords: "Napper vs http files, http file alternative, REST Client alternative, VS Code API testing, http file converter, convert http to nap, JetBrains http migration"
eleventyNavigation:
  key: vs .http Files
  order: 13
---

# Napper vs .http Files (spec: nap-file, cli-run)

`.http` files are the simplest way to send HTTP requests from VS Code. Napper builds on the same plain-text philosophy but adds assertions, test suites, environments, scripting, a full CLI, and a **built-in converter** to migrate your existing `.http` files.

## What are .http files?

`.http` files (also called `.rest` files) are plain text files supported by the REST Client extension in VS Code and by JetBrains IDEs (IntelliJ, Rider, WebStorm). They let you define HTTP requests and send them directly from your editor. They are simple and lightweight, but limited in functionality.

## What does Napper add beyond .http files? (spec: nap-assert, nap-vars, script-fsx, script-csx, cli-output)

Napper adds six major capabilities that `.http` files lack:

- **Built-in .http converter** — Migrate your existing `.http` files to `.nap` format with a single CLI command. Supports both Microsoft and JetBrains dialects.
- **Declarative assertions** (spec: nap-assert) — Verify status codes, JSON body paths, headers, and response times with a clean, readable syntax directly in the request file.
- **Composable test suites** — Chain multiple requests into ordered playlists with `.naplist` files. Nest playlists and reference entire folders.
- **Environment management** (spec: nap-vars, cli-env) — Define variables in `.napenv` files, create named environments for staging and production, and override secrets locally with `.napenv.local`.
- **F# and C# scripting** (spec: script-fsx, script-csx) — Run pre-request and post-request scripts with full access to the .NET ecosystem for token generation, data setup, and complex validation.
- **CLI execution** (spec: cli-run, cli-output) — Run any request or test suite from the terminal. Output JUnit XML, JSON, or NDJSON for CI/CD pipelines.

## How do I convert .http files to Napper? (spec: cli-convert)

Napper includes a built-in converter that transforms `.http` files into `.nap` files. Run a single command to migrate:

```bash
# Convert a single file
napper convert http ./requests.http

# Convert an entire directory
napper convert http ./api-tests/ --output-dir ./nap-tests/

# Dry run to preview without writing files
napper convert http ./requests.http --dry-run
```

### What does the converter handle?

The converter parses your `.http` files and produces equivalent `.nap` files:

- **Request methods, URLs, headers, and bodies** are mapped to the corresponding `.nap` sections
- **Request names** (`# @name` in Microsoft format, `### name` in JetBrains format) become `[meta] name`
- **Variables** (`@variable = value` in Microsoft, `{{"{{variable}}"}}` in JetBrains) are extracted into `.napenv` files
- **JetBrains environment files** (`http-client.env.json`) are converted to `.napenv.<name>` files
- **JetBrains private environments** (`http-client.private.env.json`) become `.napenv.local`
- **Simple assertions** from JetBrains response handlers are extracted where possible
- **Unsupported features** (WebSocket, gRPC, GraphQL) generate warnings so you know what needs manual attention

### Which .http dialects are supported?

Napper supports both major `.http` dialects:

| Feature | Microsoft (REST Client) | JetBrains (IntelliJ/Rider) |
|---------|------------------------|---------------------------|
| Variable syntax | `@var = value` | `{{"{{var}}"}}` from env files |
| Request naming | `# @name requestName` | `### Request Name` |
| Request separator | `###` | `###` |
| Environment files | REST Client settings | `http-client.env.json` |
| Response handlers | Not supported | `> {%raw%}{%{%endraw%} ... {%raw%}%}{%endraw%}` (partial) |

The converter auto-detects the dialect, or you can specify it explicitly with `--dialect ms` or `--dialect jb`.

## Feature comparison

| Feature | Napper | .http files |
|---------|--------|-------------|
| Plain text requests | Yes (`.nap` files) | Yes (`.http` files) |
| VS Code support | Native extension | REST Client extension |
| CLI execution | Yes (primary interface) | No |
| Assertions | Declarative + F#/C# scripts | None |
| Test suites | `.naplist` playlists | None |
| Environment variables | `.napenv` files with layering | Limited (REST Client) |
| Scripting | Full F# and C# scripting | None |
| CI/CD output | JUnit, JSON, NDJSON | None |
| Test Explorer | Native VS Code support | No |
| .http migration | Built-in converter | N/A |

## When should you choose Napper over .http files?

Choose Napper when you need to verify API responses, run automated test suites, integrate with CI/CD pipelines, use environment variables across different deployment targets, or script complex request flows. If you already have `.http` files, the built-in converter makes migration straightforward. Stay with `.http` files if you only need to send quick one-off requests from your editor without any validation or automation.

## Get started

- [Install Napper](/docs/installation/)
- [Quick Start guide](/docs/quick-start/)
- [CLI Reference](/docs/cli-reference/) for full `convert http` options

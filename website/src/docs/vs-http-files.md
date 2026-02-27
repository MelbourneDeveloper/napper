---
layout: layouts/docs.njk
title: "Napper vs .http Files"
description: "Comparing Napper and .http files for API testing. Napper adds assertions, test suites, environments, F# scripting, and CLI execution to the plain-text simplicity of .http files."
keywords: "Napper vs http files, http file alternative, REST Client alternative, VS Code API testing"
eleventyNavigation:
  key: vs .http Files
  order: 13
---

# Napper vs .http Files

`.http` files are the simplest way to send HTTP requests from VS Code. Napper builds on the same plain-text philosophy but adds assertions, test suites, environments, scripting, and a full CLI.

## What are .http files?

`.http` files (also called `.rest` files) are plain text files supported by the REST Client extension in VS Code and by JetBrains IDEs. They let you define HTTP requests and send them directly from your editor. They are simple and lightweight, but limited in functionality.

## What does Napper add beyond .http files?

Napper adds five major capabilities that `.http` files lack:

- **Declarative assertions** — Verify status codes, JSON body paths, headers, and response times with a clean, readable syntax directly in the request file.
- **Composable test suites** — Chain multiple requests into ordered playlists with `.naplist` files. Nest playlists and reference entire folders.
- **Environment management** — Define variables in `.napenv` files, create named environments for staging and production, and override secrets locally with `.napenv.local`.
- **F# scripting** — Run pre-request and post-request scripts with full access to the .NET ecosystem for token generation, data setup, and complex validation.
- **CLI execution** — Run any request or test suite from the terminal. Output JUnit XML, TAP, JSON, or NDJSON for CI/CD pipelines.

## Feature comparison

| Feature | Napper | .http files |
|---------|--------|-------------|
| Plain text requests | Yes (`.nap` files) | Yes (`.http` files) |
| VS Code support | Native extension | REST Client extension |
| CLI execution | Yes (primary interface) | No |
| Assertions | Declarative + F# scripts | None |
| Test suites | `.naplist` playlists | None |
| Environment variables | `.napenv` files with layering | Limited (REST Client) |
| Scripting | Full F# Interactive | None |
| CI/CD output | JUnit, TAP, JSON, NDJSON | None |
| Test Explorer | Native VS Code support | No |

## When should you choose Napper over .http files?

Choose Napper when you need to verify API responses, run automated test suites, integrate with CI/CD pipelines, use environment variables across different deployment targets, or script complex request flows. Stay with `.http` files if you only need to send quick one-off requests from your editor without any validation or automation.

## Can I migrate from .http files to Napper?

The `.nap` file format is similar in philosophy to `.http` files. A minimal `.nap` file is just a method and URL on one line, similar to the simplest `.http` request. You can migrate by creating `.nap` files with the same requests and progressively adding assertions, environments, and test suites.

## Get started

- [Install Napper](/docs/installation/)
- [Quick Start guide](/docs/quick-start/)

---
layout: layouts/docs.njk
title: "Napper vs Bruno"
description: "Comparing Napper and Bruno for API testing. Both are open-source alternatives to Postman, but Napper is CLI-first with F# scripting while Bruno is GUI-first with sandboxed JavaScript."
keywords: "Napper vs Bruno, Bruno alternative, API testing comparison, open source API testing"
eleventyNavigation:
  key: vs Bruno
  order: 12
---

# Napper vs Bruno

Napper and Bruno are both free, open-source alternatives to Postman that store requests as plain text files. Here is how they differ.

## What is the main difference between Napper and Bruno?

Bruno is a GUI-first tool with a standalone desktop application. It focuses on providing a visual interface similar to Postman but with open-source, git-friendly storage. Napper is CLI-first: the command line is the primary interface, and the VS Code extension provides an editor experience without a separate application.

## How do the editors compare?

Bruno has its own standalone desktop application built with Electron. Napper integrates directly into VS Code as a native extension with syntax highlighting, a request explorer, environment switching, and Test Explorer integration. If you already work in VS Code, Napper fits into your existing workflow without switching applications.

## How does scripting compare?

Bruno provides sandboxed JavaScript for pre-request and post-request scripts, similar to Postman. Napper uses F# Interactive (`.fsx` scripts) with full access to the .NET ecosystem. F# scripts in Napper are not sandboxed, so you can import NuGet packages, call databases, parse XML, generate tokens, and perform any operation the .NET runtime supports.

## How do file formats compare?

Both Napper and Bruno store requests as plain text files that work well with git. Bruno uses its own Bru markup language. Napper uses `.nap` files with a TOML-inspired section-based format. Both produce clean diffs in code reviews.

## How does CI/CD integration compare?

Bruno provides a CLI for running collections from the terminal. Napper is designed CLI-first, meaning the command line is the primary interface rather than an afterthought. Napper outputs JUnit XML, TAP, JSON, and NDJSON formats natively and requires no runtime dependencies.

## Feature comparison

| Feature | Napper | Bruno |
|---------|--------|-------|
| Primary interface | CLI + VS Code | Standalone desktop app |
| CLI design | CLI-first | CLI secondary |
| File format | `.nap` (TOML-inspired) | `.bru` (custom markup) |
| Assertions | Declarative + F# scripts | JavaScript scripts |
| Scripting | Full F# with .NET access | Sandboxed JavaScript |
| Editor integration | Native VS Code extension | Standalone Electron app |
| Test Explorer | Native VS Code support | No |
| CI/CD output | JUnit, TAP, JSON, NDJSON | JSON via CLI |
| Pricing | Free, MIT license | Free, MIT license |

## When should you choose Napper over Bruno?

Choose Napper if you prefer working from the terminal, want to stay inside VS Code, need the full power of F# and the .NET ecosystem for scripting, or want native JUnit output for CI/CD pipelines. Choose Bruno if you prefer a standalone GUI application with its own visual interface.

## Get started

- [Install Napper](/docs/installation/)
- [Quick Start guide](/docs/quick-start/)

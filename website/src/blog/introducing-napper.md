---
layout: layouts/blog.njk
title: "Introducing Napper: CLI-First API Testing for VS Code"
date: 2026-02-27
author: Christian Findlay
tags: posts
category: announcements
excerpt: "Meet Napper — a developer-first HTTP testing tool that puts the CLI first, stores everything in plain text, and gives you the full power of F# and C# scripting."
description: "Introducing Napper, a CLI-first API testing tool for VS Code. An open-source alternative to Postman and Bruno with F# and C# scripting support."
---

# Introducing Napper: CLI-First API Testing for VS Code

API testing tools have a problem. They're either too simple (`.http` files with no assertions) or too heavy (Postman with its accounts, cloud sync, and paywall). Bruno moved the needle with git-friendly collections, but it's still a GUI-first tool.

**Napper** takes a different approach.

## The CLI is the product

Napper is not a GUI with a CLI bolted on. The command line is the primary interface. Every feature works from the terminal first, then from VS Code second.

```bash
# As simple as curl
napper run ./health.nap

# Full test suite with CI output
napper run ./tests/ --env staging --output junit
```

## Plain text everything

Every request is a `.nap` file. Every test suite is a `.naplist` file. Every environment is a `.napenv` file. All plain text. All in your repo. Diffs are readable. Reviews are meaningful.

## F# and C# scripting — no sandbox

Most API testing tools give you a sandboxed JavaScript environment with limited APIs. Napper gives you **full F# and C# scripting** with access to the entire .NET ecosystem. Parse XML, call databases, generate crypto tokens, run complex assertions — whatever you need. Use whichever .NET language your team prefers.

## Get started

Install the VS Code extension or grab the CLI binary from [GitHub Releases](https://github.com/MelbourneDeveloper/napper/releases). Read the [documentation](/docs/) to learn more.

Napper is free, open source, and MIT licensed.

---
layout: layouts/docs.njk
title: ".naplist Playlists"
description: "Build test suites with .naplist files. Chain requests, nest playlists, and orchestrate complex test flows."
keywords: ".naplist, playlists, test suites, test orchestration"
eleventyNavigation:
  key: ".naplist Playlists"
  order: 5
---

# .naplist Playlists

A `.naplist` file defines an ordered sequence of steps to execute. Steps can be `.nap` files, folders, other playlists, or F# scripts.

## Basic format

```
[meta]
name = Smoke Tests
description = Quick checks for core endpoints

[steps]
./health.nap
./users/get-users.nap
./users/create-user.nap
```

## Full format

```
[meta]
name = Full Regression Suite
description = Complete API test suite with setup and teardown
environment = staging

[vars]
baseUrl = https://staging.api.example.com
adminToken = {% raw %}{{ADMIN_TOKEN}}{% endraw %}

[steps]
# Setup
./scripts/seed-data.fsx

# Core CRUD
./users/
./posts/

# Integration tests
./integration/auth-flow.naplist
./integration/payment-flow.naplist

# Cleanup
./scripts/teardown.fsx
```

## Step types

### .nap files

Run a single HTTP request:

```
./users/get-user.nap
```

### Folders

Run all `.nap` files in a folder, sorted by filename:

```
./users/
```

### Nested playlists

Run another `.naplist` file:

```
./regression/core.naplist
```

Nesting is recursive — playlists can reference other playlists.

### F# scripts

Run an orchestration script:

```
./scripts/setup.fsx
```

Scripts can use the injected `NapRunner` to run requests and playlists programmatically. See [F# Scripting](/docs/fsharp-scripting/).

## Variables

Variables defined in `[vars]` are available to all steps. Steps can also set variables for downstream steps using F# scripts.

## Running playlists

From the CLI:

```bash
napper run ./smoke.naplist
```

With an environment:

```bash
napper run ./smoke.naplist --env staging
```

With JUnit output:

```bash
napper run ./smoke.naplist --output junit
```

From VS Code, click the Run button next to any playlist in the Playlists panel.

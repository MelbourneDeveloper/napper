---
layout: layouts/docs.njk
title: CLI Reference
description: "Complete reference for the Napper CLI. Commands, flags, output formats, and exit codes."
keywords: "CLI reference, napper command, command line, flags, output formats"
eleventyNavigation:
  key: CLI Reference
  order: 9
---

# CLI Reference

## Commands

### `napper run` (spec: cli-run)

Run a `.nap` file, `.naplist` file, or folder.

```bash
# Single request
napper run ./request.nap

# Playlist
napper run ./suite.naplist

# All .nap files in a folder
napper run ./tests/
```

#### Flags

| Flag | Description | Example | Spec |
|------|-------------|---------|------|
| `--env <name>` | Use a named environment | `--env staging` | (spec: cli-env) |
| `--var <key=value>` | Override a variable | `--var userId=42` | (spec: cli-var) |
| `--output <format>` | Output format | `--output junit` | (spec: cli-output) |
| `--verbose` | Enable verbose output with detailed request/response info | `--verbose` | (spec: cli-verbose) |

### `napper --version`

Print the installed CLI version.

```bash
napper --version
```

#### Output formats (spec: cli-output)

| Format | Description | Spec |
|--------|-------------|------|
| `pretty` | Human-readable colored output (default) | (spec: output-pretty) |
| `junit` | JUnit XML for CI integration | (spec: output-junit) |
| `json` | JSON report | (spec: output-json) |
| `ndjson` | Newline-delimited JSON (streaming) | (spec: output-ndjson) |

### `napper check` (spec: cli-check)

Validate syntax without executing requests.

```bash
napper check ./suite.naplist
```

### `napper convert http` (spec: cli-convert)

Convert `.http` files to `.nap` format. Supports both Microsoft (VS Code REST Client) and JetBrains (IntelliJ, Rider, WebStorm) dialects.

```bash
# Convert a single .http file
napper convert http ./requests.http

# Convert a directory of .http files
napper convert http ./api-tests/ --output-dir ./nap-tests/

# Preview without writing files
napper convert http ./requests.http --dry-run

# Specify dialect explicitly
napper convert http ./requests.http --dialect jb
```

#### Flags

| Flag | Description | Example | Spec |
|------|-------------|---------|------|
| `--output-dir <path>` | Output directory for converted files | `--output-dir ./nap/` | (spec: cli-convert) |
| `--env-file <path>` | JetBrains environment file | `--env-file http-client.env.json` | (spec: cli-convert) |
| `--dialect <ms\|jb\|auto>` | Force dialect detection | `--dialect jb` | (spec: cli-convert) |
| `--dry-run` | Preview conversion without writing | `--dry-run` | (spec: cli-convert) |
| `--verbose` | Show detailed conversion output | `--verbose` | (spec: cli-verbose) |

The converter maps variables to `.napenv` files, preserves request names, and warns about unsupported features (WebSocket, gRPC, GraphQL).

### `napper generate` (spec: cli-generate, openapi-generate)

Generate `.nap` files from an OpenAPI specification.

```bash
napper generate openapi ./openapi.json
```

## Exit codes (spec: cli-exit-codes)

| Code | Meaning |
|------|---------|
| `0` | All assertions passed |
| `1` | One or more assertions failed |
| `2` | Runtime error (network, script, parse) |

## CI/CD example

### GitHub Actions

```yaml
- name: Run API tests
  run: |
    napper run ./tests/ --env ci --output junit > results.xml

- name: Upload test results
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: test-results
    path: results.xml
```

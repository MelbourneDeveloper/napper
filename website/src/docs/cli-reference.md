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

### `napper run`

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

| Flag | Description | Example |
|------|-------------|---------|
| `--env <name>` | Use a named environment | `--env staging` |
| `--var <key=value>` | Override a variable | `--var userId=42` |
| `--output <format>` | Output format | `--output junit` |

#### Output formats

| Format | Description |
|--------|-------------|
| `pretty` | Human-readable colored output (default) |
| `junit` | JUnit XML for CI integration |
| `tap` | TAP (Test Anything Protocol) |
| `json` | JSON report |
| `ndjson` | Newline-delimited JSON (streaming) |

### `napper check`

Validate syntax without executing requests.

```bash
napper check ./suite.naplist
```

### `napper list`

List all requests in a path.

```bash
napper list ./
```

## Exit codes

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

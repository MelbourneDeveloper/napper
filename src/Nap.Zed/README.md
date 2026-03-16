# Nap — Zed Extension

Language support for [Nap](https://napapi.dev) API testing files in Zed.

## Features

- **Syntax highlighting** for `.nap`, `.naplist`, and `.napenv` files
- **Code outline** — navigate sections via the symbol outline
- **Runnables** — run requests directly from the editor gutter
- **Bracket matching** — section headers, variable interpolation, strings
- **Redactions** — `{{variable}}` values masked during screen sharing
- **Slash commands** — `/nap-run` and `/nap-import-openapi` in the Assistant

## Requirements

The [Nap CLI](https://napapi.dev/docs/installation) must be installed and on your PATH for runnables and slash commands to work.

## File Types

| Extension | Description |
|-----------|-------------|
| `.nap` | API request definition |
| `.naplist` | Playlist (ordered request sequence) |
| `.napenv` | Environment variables |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/nap-run <file>` | Run a `.nap` or `.naplist` file and show results |
| `/nap-import-openapi <spec>` | Generate `.nap` files from an OpenAPI spec |

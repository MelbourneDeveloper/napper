#!/usr/bin/env bash
set -euo pipefail

# Dump the Nap CLI --help output to a markdown document in docs/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_FILE="$ROOT_DIR/docs/cli-reference.md"

CLI_PATH="$ROOT_DIR/dist/cli/Nap.Cli"

if [ ! -x "$CLI_PATH" ]; then
    echo "CLI not found at $CLI_PATH — building first..."
    bash "$SCRIPT_DIR/build-cli.sh"
fi

echo "==> Capturing CLI help output..."

HELP_OUTPUT=$("$CLI_PATH" help 2>&1)

mkdir -p "$ROOT_DIR/docs"

cat > "$OUTPUT_FILE" << 'HEADER'
# Nap CLI Reference

> Auto-generated from `nap help`. Run `scripts/dump-cli-help.sh` to regenerate.

## Help Output

```
HEADER

echo "$HELP_OUTPUT" >> "$OUTPUT_FILE"

cat >> "$OUTPUT_FILE" << 'FOOTER'
```

## Commands

### `nap run <file|folder>`

Run a `.nap` file, `.naplist` playlist, or an entire folder of requests.

```sh
# Single request
nap run ./users/get-user.nap

# With variable overrides
nap run ./users/get-user.nap --var userId=99

# Run all .nap files in a folder (sorted by filename)
nap run ./users/

# Run a playlist
nap run ./smoke.naplist

# With a named environment
nap run ./smoke.naplist --env staging

# Output as JUnit XML (for CI)
nap run ./smoke.naplist --output junit

# Output as JSON
nap run ./smoke.naplist --output json
```

### `nap check <file>`

Validate the syntax of a `.nap` or `.naplist` file without executing it.

```sh
nap check ./users/get-user.nap
nap check ./smoke.naplist
```

### `nap help`

Display the help message. Also available as `--help` or `-h`.

## Options

| Option              | Description                                       |
|---------------------|---------------------------------------------------|
| `--env <name>`      | Load a named environment file (`.napenv.<name>`)  |
| `--var <key=value>` | Override a variable (repeatable)                  |
| `--output <format>` | Output format: `pretty` (default), `junit`, `json`|

## Exit Codes

| Code | Meaning                                          |
|------|--------------------------------------------------|
| 0    | All assertions passed                            |
| 1    | One or more assertions failed                    |
| 2    | Runtime error (network, script error, parse error) |
FOOTER

echo "==> Written to $OUTPUT_FILE"

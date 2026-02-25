# Nap CLI Reference

> Auto-generated from `nap help`. Run `scripts/dump-cli-help.sh` to regenerate.

## Help Output

```
Nap — API testing tool

Usage:
  nap run <file|folder>     Run a .nap file, .naplist playlist, or folder
  nap check <file>          Validate a .nap or .naplist file
  nap help                  Show this help

Options:
  --env <name>              Environment name (loads .napenv.<name>)
  --var <key=value>         Variable override (repeatable)
  --output <format>         Output: pretty (default), junit, json
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

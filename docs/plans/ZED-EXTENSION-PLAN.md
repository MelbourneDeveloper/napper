# Nap Zed Extension — Implementation Plan

Zed extensions are written in Rust, compiled to WebAssembly. The extension provides syntax highlighting via Tree-sitter, language intelligence via LSP, and run actions via runnables. Zed does not support webviews, sidebar panels, test explorers, or status bar items — those are VSCode-only.

---

## Architecture

```
nap-zed-extension/
├── Cargo.toml                  # crate-type = ["cdylib"], depends on zed_extension_api
├── extension.toml              # Extension manifest: languages, grammars, language servers
├── src/
│   └── lib.rs                  # Extension trait impl: language_server_command, slash commands
├── languages/
│   └── nap/
│       ├── config.toml         # Language metadata: name, path_suffixes, comments, tabs
│       ├── highlights.scm      # Syntax highlighting queries
│       ├── brackets.scm        # Bracket matching pairs
│       ├── outline.scm         # Code outline (sections as items)
│       ├── indents.scm         # Auto-indentation rules
│       ├── injections.scm      # Language injection (if needed for body blocks)
│       ├── runnables.scm       # Detect [request] blocks as runnable
│       └── redactions.scm      # Mask {{variable}} values for screen sharing
├── grammars/
│   └── tree-sitter-nap/        # Tree-sitter grammar (C, compiled to WASM)
│       ├── grammar.js          # Tree-sitter grammar definition
│       └── src/
│           └── parser.c        # Generated parser
└── LICENSE
```

---

## Implementation Phases

### Phase 1 — Tree-sitter Grammar + Syntax Highlighting

Build the Tree-sitter grammar for `.nap` and `.naplist` files. Write all query files.

- `grammar.js` — Tree-sitter grammar definition covering all `.nap` syntax: section headers, key-value pairs, `{{variable}}` interpolation, HTTP methods, comments, string literals, assertion operators
- `highlights.scm` — Map grammar nodes to theme captures (`@keyword`, `@string`, `@variable`, `@function`, `@comment`, `@operator`, `@punctuation`)
- `brackets.scm` — Pair `[` and `]` for section headers
- `outline.scm` — Expose `[meta]`, `[request]`, `[assert]`, `[script]`, `[vars]`, `[steps]` as outline items
- `indents.scm` — Auto-indent after section headers
- `config.toml` — Register `.nap` and `.naplist` file extensions, set `#` as line comment, configure tab size

### Phase 2 — Runnables (Run from Editor)

- `runnables.scm` — Detect `[request]` blocks and mark them as runnable
- The runnable label shows the HTTP method and URL
- Execution runs `nap run <file>` in the Zed terminal
- Capture `ZED_CUSTOM_` environment variables for method and URL context

### Phase 3 — LSP Integration

The Zed extension launches the language server by spawning **`napper lsp`** — the LSP is a subcommand of the `napper` CLI ([`lsp-one-binary`](../specs/LSP-SPEC.md#lsp-one-binary)), not a separate binary. Same `napper` install gives you the LSP for free. See **[LSP Spec](../specs/LSP-SPEC.md)** and **[LSP Plan](./LSP-PLAN.md)**.

- Implement `language_server_command` in `lib.rs` to resolve `napper` from the worktree PATH and return `{ command: <resolved napper path>, args: ["lsp"] }`
- Register the language server in `extension.toml` for `.nap` and `.naplist` languages
- The LSP provides completions, diagnostics, hover, symbols — no Zed-specific code needed
- Discovery: check `PATH` for `napper`. If missing, surface a notification linking to the install guide. Zed extensions cannot install dotnet tools themselves; the user runs `dotnet tool install -g napper` (or `brew install napper`) once.

### Phase 4 — Slash Commands + Redactions

- `/nap-run <file>` slash command — run a `.nap` file and return formatted results in the Assistant
- `/nap-import-openapi <file>` slash command — generate `.nap` files from an OpenAPI spec
- `redactions.scm` — Mask `{{variable}}` interpolation values during screen sharing
- Implement `complete_slash_command_argument` to suggest `.nap` and `.naplist` files from the worktree

### Phase 5 — Polish & Publishing

- Test on macOS and Linux
- Write extension description and README
- Add MIT license
- Submit PR to `zed-industries/extensions` repository
- Ensure Tree-sitter grammar produces visually identical highlighting to the VSCode TextMate grammar

---

## TODO

### Phase 1 — Tree-sitter Grammar + Syntax Highlighting
- [x] Write `grammar.js` for `.nap` file format
- [x] Write `grammar.js` for `.naplist` file format
- [x] Write `grammar.js` for `.napenv` file format
- [x] Write `highlights.scm`
- [x] Write `brackets.scm`
- [x] Write `outline.scm`
- [x] Write `indents.scm`
- [x] Write `config.toml` with language metadata
- [x] Register grammar in `extension.toml`
- [ ] Test highlighting matches VSCode TextMate grammar visually

### Phase 2 — Runnables
- [x] Write `runnables.scm` to detect `[request]` blocks
- [ ] Verify `nap run <file>` executes in Zed terminal
- [ ] Add runnable label showing HTTP method + URL

### Phase 3 — LSP Integration
- [x] Implement `language_server_command` in `lib.rs` — uses `worktree.which("napper")` and returns `{ command: napper_path, args: ["lsp"] }`
- [x] Register language server in `extension.toml`
- [x] PATH lookup for `napper` via Zed `Worktree::which`; surfaces error with install instructions if missing
- [ ] Test completions, diagnostics, hover via LSP

### Phase 4 — Slash Commands + Redactions
- [x] Implement `/nap-run` slash command
- [x] Implement `/nap-import-openapi` slash command
- [x] Implement argument completion for slash commands
- [x] Write `redactions.scm` for `{{variable}}` masking

### Phase 5 — Polish & Publishing
- [ ] Test on macOS and Linux
- [ ] Write extension README
- [ ] Add license
- [ ] Submit to zed-industries/extensions
- [ ] Visual parity check against VSCode highlighting

---

## Related Specs

- [LSP Specification](../specs/LSP-SPEC.md) — Language server capabilities, architecture, and protocol details
- [LSP Plan](./LSP-PLAN.md) — LSP implementation phases and TODO
- [IDE Extension Spec](../specs/IDE-EXTENSION-SPEC.md) — Feature matrix and shared/IDE-specific behaviour

# Nap VSCode Extension — Implementation Plan

---

## Implementation Phases

### Phase 1 — Core Extension

- Syntax highlighting for `.nap` and `.naplist` files
- Explorer tab with collection tree
- CodeLens run actions
- Basic response viewer panel

### Phase 2 — Test Explorer & Playlists

- Test Explorer integration (`vscode.TestController`)
- Playlists tab with step tree
- Run results mapped to test items

### Phase 3 — LSP Cutover

Connect the VSCode extension to `napper-lsp` via `vscode-languageclient`. The LSP itself is a separate project — see **[LSP Plan](./LSP-PLAN.md)**.

This phase **deletes duplicated TypeScript parsing code** and replaces it with LSP calls. After this phase, the VSIX is a thin UI shell — it renders data from the LSP, it does NOT parse `.nap` files itself.

**Delete and replace:**
- `extractHttpMethod` (TS) → use `textDocument/documentSymbol` from LSP
- `parseMethodAndUrl` (TS) → use `napper/requestInfo` from LSP
- `parsePlaylistStepPaths` (TS) → use `textDocument/documentSymbol` from LSP
- `detectEnvironments` (TS) → use `napper/environments` from LSP
- CodeLens section detection (TS) → use `textDocument/documentSymbol` from LSP
- Curl generation (TS) → use `napper/curlCommand` from LSP

**Wire up:**
- `vscode-languageclient` to launch `napper-lsp` over stdio
- Environment switcher (status bar + quick-pick — data from LSP `napper/environments`)
- Hover, completions, diagnostics (provided by LSP)

### Phase 4 — Polish & Distribution

- **CLI installation via `dotnet tool install`** — replace raw binary download with `dotnet tool install -g napper --version X.X.X`. Version is read from the extension's own `package.json`. Eliminates Windows SmartScreen warnings and custom HTTP download code.
- Split editor layout (request panel webview)
- New request guided flow
- OpenAPI generation command
- Publish to VS Code Marketplace and Open VSX Registry

---

## TODO

### Phase 1 — Core Extension
- [ ] Syntax highlighting for `.nap` and `.naplist` files
- [ ] Explorer tab with collection tree
- [ ] CodeLens run actions
- [ ] Basic response viewer panel

### Phase 2 — Test Explorer & Playlists
- [ ] Test Explorer integration (`vscode.TestController`)
- [ ] Playlists tab with step tree
- [ ] Run results mapped to test items

### Phase 3 — LSP Cutover
- [ ] Add `vscode-languageclient` dependency
- [ ] Wire up to launch `napper-lsp` over stdio on activation
- [ ] Delete `extractHttpMethod` — use documentSymbol
- [ ] Delete `parseMethodAndUrl` — use `napper/requestInfo`
- [ ] Delete `parsePlaylistStepPaths` — use documentSymbol
- [ ] Delete `detectEnvironments` — use `napper/environments`
- [ ] Replace curl generation — use `napper/curlCommand`
- [ ] Replace CodeLens section detection — use documentSymbol
- [ ] Environment switcher data from LSP
- [ ] Verify hover, completions, diagnostics from LSP
- [ ] Run ALL existing VSIX e2e tests — must pass

### Phase 4 — Polish & Distribution
- [ ] Replace raw binary download with `dotnet tool install -g napper --version X.X.X`
- [ ] Delete custom HTTP download code (`cliInstaller.ts` download/redirect logic)
- [ ] Split editor layout (request panel webview)
- [ ] New request guided flow
- [ ] OpenAPI generation command
- [ ] Publish to VS Code Marketplace and Open VSX Registry

---

## Related Specs

- [LSP Specification](./LSP-SPEC.md) — Language server capabilities
- [LSP Plan](./LSP-PLAN.md) — LSP implementation phases and TODO
- [IDE Extension Spec](./IDE-EXTENSION-SPEC.md) — Feature matrix and shared behaviour

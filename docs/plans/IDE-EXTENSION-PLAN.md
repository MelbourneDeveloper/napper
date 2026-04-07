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

- **CLI install resolver** — implement [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition); delete `cliInstaller.ts`.
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

- CLI install rewrite — see [IDE-EXTENSION-INSTALL-PLAN.md](./IDE-EXTENSION-INSTALL-PLAN.md).

Other Phase 4:
- [ ] Split editor layout (request panel webview)
- [ ] New request guided flow
- [ ] OpenAPI generation command
- [ ] Publish to VS Code Marketplace and Open VSX Registry

### Phase 5 — AOT collapse (blocked on [`cli-aot-migration`](../specs/CLI-SPEC.md#cli-aot-migration))

- [ ] Drop steps 2–4 of [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition); replace step 5 with `brew install napper` / `scoop install napper`
- [ ] Drop the `vscode-cli-acq-pm-prompt` path

---

## Related Specs

- [LSP Specification](../specs/LSP-SPEC.md) — Language server capabilities
- [LSP Plan](./LSP-PLAN.md) — LSP implementation phases and TODO
- [IDE Extension Spec](../specs/IDE-EXTENSION-SPEC.md) — Feature matrix and shared behaviour
- [IDE Extension Install Plan](./IDE-EXTENSION-INSTALL-PLAN.md) — VSIX CLI install resolver

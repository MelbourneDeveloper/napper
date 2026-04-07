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

- **CLI installation via `dotnet tool install`** — replace raw binary download with the multi-step algorithm specified in [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition). Probe PATH → ensure `dotnet` is installed (via brew / scoop / choco if missing) → `dotnet tool install -g napper --version X.X.X` → tank hard with manual instructions if any step fails. Version comes from the extension's own `package.json`. Eliminates Windows SmartScreen warnings, deletes the custom HTTP download code, and never silently downloads binaries.
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

#### CLI install flow rewrite (see [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition))

- [ ] Step 1 — Probe PATH: read VSIX version from `package.json`, run `<nap.cliPath || 'napper'> --version`, exact-match against VSIX version
- [ ] Step 2 — Probe `dotnet --version`
- [ ] Step 3 — Detect package manager: `brew` on macOS/Linux; `scoop` then `choco` on Windows
- [ ] Step 3 — Install .NET SDK via detected package manager (`brew install --cask dotnet-sdk`, `brew install dotnet-sdk`, `scoop bucket add extras && scoop install dotnet-sdk`, or `choco install dotnet-sdk -y`)
- [ ] Step 3 — When no package manager is detected, show `vscode-cli-acq-pm-prompt` notification with links to brew.sh / scoop.sh / chocolatey.org
- [ ] Step 3 — When `dotnet` is still missing after install (PATH not refreshed), show "restart VS Code" notification
- [ ] Step 4 — `dotnet tool install -g napper --version <VSIX_VERSION>` (or `dotnet tool update -g …` if already present)
- [ ] Step 4 — Re-probe `napper --version` against VSIX version
- [ ] Step 5 — Tank notification with "Open install guide / Open GitHub release / Open output log" buttons
- [ ] Wrap steps 3 and 4 in `vscode.window.withProgress` (`ProgressLocation.Notification`, non-cancellable)
- [ ] Stream all spawned-process stdout/stderr to the Napper output channel
- [ ] Delete `src/Napper.VsCode/src/cliInstaller.ts` raw binary download + redirect-following + checksum verification code
- [ ] Delete the related constants in `src/Napper.VsCode/src/constants.ts` (`CLI_DOWNLOAD_BASE_URL`, `CLI_CHECKSUMS_FILE`, `CLI_ASSET_PREFIX`, `CLI_RID_*`, `CLI_PLATFORM_*`, `CLI_ARCH_*`, `CLI_MAX_REDIRECTS`, `CLI_TOO_MANY_REDIRECTS`, `CLI_REDIRECT_ERROR`, `CLI_FILE_MODE_EXECUTABLE`, `CLI_CHECKSUM_*`, `CLI_DOWNLOAD_ERROR_PREFIX`, `CLI_UNSUPPORTED_PLATFORM_MSG`)
- [ ] Delete `tests/cliInstaller.unit.test.ts` (or whatever the unit tests are named) and replace with tests against the new resolver — mocking `child_process.execFile` to assert the right commands run in the right order with the right `--version` argument
- [ ] Add e2e test: VSIX activates with `nap.cliPath` pointing at a stub binary that prints the VSIX version → step 1 succeeds, no other steps run
- [ ] Add e2e test: VSIX activates with no CLI on PATH and a stub `dotnet` that prints `10.0.100` and a stub `dotnet tool install` that creates a stub `napper` printing the VSIX version → steps 1 fail, 2 success, 4 success
- [ ] Add e2e test: VSIX activates with no CLI, no dotnet, no brew → tank notification appears with the correct buttons

#### Other Phase 4 work
- [ ] Split editor layout (request panel webview)
- [ ] New request guided flow
- [ ] OpenAPI generation command
- [ ] Publish to VS Code Marketplace and Open VSX Registry

### Phase 5 — AOT migration impact (see [`cli-aot-migration`](../specs/CLI-SPEC.md#cli-aot-migration))

When the CLI migrates to NativeAOT, the install flow collapses dramatically. These items are blocked on the AOT migration landing in `Napper.Cli` and the release workflow producing AOT binaries.

- [ ] Delete steps 2 and 3 of [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition) — no more `dotnet --version` probe, no more brew/scoop/choco-install-dotnet branch
- [ ] Replace step 4 (`dotnet tool install`) with `brew install napper` / `scoop install napper` (still version-mismatch tolerant: probe and tank if not exact)
- [ ] Document in [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition) that user `.fsx` / `.csx` script hooks still require the .NET SDK separately (the AOT migration drops the dependency for the CLI's own execution, not for user scripts)
- [ ] Remove the `vscode-cli-acq-pm-prompt` notification path — package managers become optional convenience, not a hard prerequisite

---

## Related Specs

- [LSP Specification](./LSP-SPEC.md) — Language server capabilities
- [LSP Plan](./LSP-PLAN.md) — LSP implementation phases and TODO
- [IDE Extension Spec](./IDE-EXTENSION-SPEC.md) — Feature matrix and shared behaviour

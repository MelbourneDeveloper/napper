# IDE Extension — CLI Install Plan

Implements [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition).

**Canonical references (read these, don't duplicate them):**
- [Shipwright product repo adoption guide](https://github.com/MelbourneDeveloper/deployment_toolkit/blob/main/docs/agents/product-repo-adoption-guide.md)
- [Shipwright VSIX platform bundling spec](https://github.com/MelbourneDeveloper/deployment_toolkit/blob/main/docs/specs/vsix-platform-bundling.md)

---

## Approach

CLI resolution is handled by `@nimblesite/shipwright-vscode` (`activateDeploymentToolkit`) reading `deployment-toolkit.json`. The bespoke installer (cliResolver.ts, cliResolverUi.ts, cliResolverCommands.ts, cliInstaller.ts) has been deleted. Do not re-introduce it.

One install gives you both CLI and LSP. The LSP is `napper lsp` — the same binary, no second discovery ([`lsp-one-binary`](../specs/LSP-SPEC.md#lsp-one-binary)).

---

## VSIX Packaging

Per [SWR-VSIX-CI-MATRIX] and [SWR-VSIX-PACKAGE], we build **6 per-platform VSIXes**:

| Platform | Runner | vsceTarget | npm_config_arch |
|----------|--------|------------|-----------------|
| darwin-arm64 | macos-15 | darwin-arm64 | arm64 |
| darwin-x64 | macos-13 | darwin-x64 | x64 |
| linux-x64 | ubuntu-latest | linux-x64 | x64 |
| linux-arm64 | ubuntu-latest | linux-arm64 | arm64 |
| win32-x64 | windows-latest | win32-x64 | x64 |
| win32-arm64 | windows-latest | win32-arm64 | arm |

Each VSIX bundles the napper binary at `bin/${platform}/napper[.exe]`. The Marketplace delivers the correct VSIX automatically.

Local dev: `make package-vsix` builds a single-platform VSIX for the current machine only.

---

## NuGet Deployment

`napper` is published to `nuget.org` as a dotnet tool by [`.github/workflows/release.yml`](../../.github/workflows/release.yml) → `publish-nuget` job. It is available as a fallback source (source 5 in the Shipwright resolution chain) for users who prefer the dotnet tool install.

---

## TODO

### Spec & release prerequisites
- [x] [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition) updated to reference Shipwright approach
- [x] `@nimblesite/shipwright-vscode` wired in `extension.ts`
- [x] Bespoke installer files deleted (cliResolver.ts, cliResolverUi.ts, cliResolverCommands.ts, cliInstaller.ts)
- [x] `deployment-toolkit.json` present with correct `bundlePath` and `perPlatformArtifact: true`
- [x] Release CI builds 6 per-platform VSIXes (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64, win32-arm64)
- [x] Release CI uses platform-native runners and `npm_config_arch` per [SWR-VSIX-CI-MATRIX]
- [x] `publish-marketplace` job publishes all 6 VSIXes atomically per [SWR-VSIX-PUBLISH]
- [x] `engines.vscode` set to `^1.99.0` per [SWR-VSIX-PACKAGE]
- [x] [DTK-NAPPER-VSCODE-RESOLVER] Complete — Shipwright replaces bespoke resolver
- [ ] Tag `v0.12.0` to exercise the full release pipeline end-to-end

### Testing
- [ ] E2E test: install VSIX, assert Shipwright resolves bundled binary (source = `bundled`), assert `napper.runFile` succeeds against a real `.nap` fixture
- [ ] VSIX content verification test per [SWR-VSIX-VERIFY]: `unzip -l *.vsix | grep -F "bin/darwin-arm64/napper"`

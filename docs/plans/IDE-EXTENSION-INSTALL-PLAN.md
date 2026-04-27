# IDE Extension — CLI Install Plan

Implements [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition).

The VSIX guarantees that a `napper` binary on PATH reports a version exactly equal to the VSIX `package.json` version. The canonical install channel is **`dotnet tool install -g napper --version X`** because it is the only channel that pins to a historical version. Brew/Scoop/Choco are used **only** to install the .NET SDK prerequisite when missing — never to install `napper` itself. The VSIX never downloads binaries directly.

**One install gives you both the CLI and the LSP.** The Nap language server is the **`napper lsp` subcommand** of the same `napper` binary ([`lsp-one-binary`](../specs/LSP-SPEC.md#lsp-one-binary)). After this resolver puts a version-matched `napper` on PATH, the VSIX can launch `<resolvedNapperPath> lsp` to start the language server with no further discovery, no second install, no second version pin. There is no `napper-lsp` and there never will be.

---

## Resolution Algorithm

| # | Spec ID | What it does | Success → | Failure → |
|---|---------|--------------|-----------|-----------|
| 1 | [`vscode-cli-acq-path-probe`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition) | `<nap.cliPath \|\| 'napper'> --version` | done | step 2 |
| 2 | `vscode-cli-acq-dotnet-probe` | `dotnet --version` | step 5 | step 3 |
| 3 | `vscode-cli-acq-dotnet-consent` | Modal: `Napper needs the .NET 10 SDK. Install it now via <pm>?` | step 4 | tank |
| 4 | `vscode-cli-acq-install-dotnet` | Run package-manager install command | re-probe `dotnet`; if still missing → restart-VS-Code prompt | tank |
| 5 | `vscode-cli-acq-dotnet-tool-install` | `dotnet tool install -g napper --version <X>` (or `update -g`) | re-probe `napper`; match → done | tank |
| 6 | `vscode-cli-acq-tank` | Hard error notification, three buttons | — | — |

---

## Per-OS Detail

### macOS

| Step | Command |
|------|---------|
| Detect dotnet | `dotnet --version` |
| Detect package manager | `brew --version` |
| Install .NET SDK | `brew install --cask dotnet-sdk` |
| Install Napper | `dotnet tool install -g napper --version <X>` |
| If brew missing | Prompt → `https://brew.sh` → tank |

PATH after install: brew adds `/usr/local/bin` (Intel) or `/opt/homebrew/bin` (Apple Silicon). `dotnet tool` adds `~/.dotnet/tools`. Both should already be on a fresh shell PATH; the running VS Code process may still need a restart to see them.

### Linux

| Step | Command |
|------|---------|
| Detect dotnet | `dotnet --version` |
| Detect package manager | `brew --version` (Linuxbrew) |
| Install .NET SDK | `brew install dotnet-sdk` |
| Install Napper | `dotnet tool install -g napper --version <X>` |
| If brew missing | Prompt → `https://brew.sh` → tank |

We do **not** attempt apt/dnf/pacman in this iteration. Linuxbrew is the single supported path. Distro-specific package managers each have a different .NET SDK package name and repository setup; supporting them is deferred until [`cli-aot-migration`](../specs/CLI-SPEC.md#cli-aot-migration) makes the .NET prerequisite go away entirely.

### Windows

| Step | Command |
|------|---------|
| Detect dotnet | `dotnet --version` |
| Detect package manager (in order) | `scoop --version`, then `choco --version` |
| Install .NET SDK (scoop) | `scoop bucket add extras` then `scoop install dotnet-sdk` |
| Install .NET SDK (choco) | `choco install dotnet-sdk -y` |
| Install Napper | `dotnet tool install -g napper --version <X>` |
| If neither | Prompt → `https://scoop.sh` + `https://chocolatey.org/install` → tank |

`choco install` requires an elevated shell. The VSIX runs commands as the VS Code process user, so `choco` may fail with an elevation error. If detection fails, the user is asked to install via scoop instead, or to install .NET manually and reload VS Code. We do not attempt UAC elevation from inside the extension.

---

## Module Layout

| File | Responsibility |
|------|----------------|
| `src/Napper.VsCode/src/cliInstaller.ts` | **Delete.** All raw-binary download, redirect-following, checksum verification, and dotnet-tool-fallback logic goes away. |
| `src/Napper.VsCode/src/cliResolver.ts` | **New.** Pure resolver: takes `{ vsixVersion, configuredCliPath, platform, exec }`, returns a `Result<{ cliPath: string }, ResolverError>`. No vscode SDK imports. Functional, no classes. Each step is a small function returning `Result<NextStep, ResolverError>`. |
| `src/Napper.VsCode/src/cliResolverCommands.ts` | **New.** Per-OS command tables: maps `(os, packageManager)` → `{ detectCmd, installCmd }`. Single source of truth for install commands. No `if (os === 'darwin')` branches anywhere else. |
| `src/Napper.VsCode/src/cliResolverUi.ts` | **New.** vscode SDK glue: shows the consent modal, the progress notification, the pm-prompt notification, the tank notification. Calls `cliResolver` with an `exec` function that streams to the Napper output channel. Decoupled per CLAUDE.md "Decouple providers from the VSCODE SDK". |
| `src/Napper.VsCode/src/extension.ts` | Replace `ensureCliInstalled` (lines 159–180) with a single call to `cliResolverUi.ensureCli()`. Drop all `cliInstaller` imports. |
| `src/Napper.VsCode/src/constants.ts` | Delete `CLI_DOWNLOAD_BASE_URL`, `CLI_CHECKSUMS_FILE`, `CLI_ASSET_PREFIX`, `CLI_RID_*`, `CLI_PLATFORM_*` (where unused), `CLI_ARCH_*`, `CLI_MAX_REDIRECTS`, `CLI_TOO_MANY_REDIRECTS`, `CLI_REDIRECT_ERROR`, `CLI_FILE_MODE_EXECUTABLE`, `CLI_CHECKSUM_*`, `CLI_DOWNLOAD_ERROR_PREFIX`, `CLI_UNSUPPORTED_PLATFORM_MSG`, `CLI_DOTNET_FALLBACK_MSG`. Add new constants for the consent modal, progress titles, tank message, and the per-pm install commands. All strings in **one location** per CLAUDE.md. |

`cliResolver.ts` MUST stay under 250 LOC. `cliResolverUi.ts` MUST stay under 250 LOC. Any function over 20 LOC gets split. Per CLAUDE.md: pure functions, named-parameter object args, `Result<T,E>` returns, no throwing.

---

## Error Handling

All resolver functions return `Result<T, ResolverError>` from `types.ts`. `ResolverError` is a discriminated union:

```ts
type ResolverError =
  | { kind: 'path-mismatch'; expected: string; actual: string }
  | { kind: 'dotnet-missing' }
  | { kind: 'consent-declined' }
  | { kind: 'pm-missing'; os: 'darwin' | 'linux' | 'win32' }
  | { kind: 'pm-install-failed'; pm: string; stderr: string; exitCode: number }
  | { kind: 'tool-install-failed'; stderr: string; exitCode: number }
  | { kind: 'restart-required' }
```

Each `kind` maps to exactly one user-visible message and one set of notification buttons in `cliResolverUi.ts`. No string literals scattered through the resolver. All log lines use `logger.info` / `logger.error`.

---

## Progress UI

Steps 4 and 5 wrap in a single `vscode.window.withProgress` call (`location: ProgressLocation.Notification`, `cancellable: false`). Title updates per step:

- Step 4: `Installing .NET SDK via <brew|scoop|choco>...`
- Step 5: `Installing Napper CLI v<X> via dotnet tool...`

All spawned process stdout/stderr lines stream to the Napper output channel via `logger.info`. No separate terminal window opens.

---

## NuGet Deployment

`napper` is published to `nuget.org` as a dotnet tool by [`.github/workflows/release.yml`](../../.github/workflows/release.yml) → `publish-nuget` job. The job:

1. `dotnet pack src/Napper.Cli/Napper.Cli.fsproj -c Release -p:Version=$VERSION`
2. `dotnet nuget push src/Napper.Cli/nupkg/napper.${VERSION}.nupkg --api-key ${{ secrets.NIMBLESITE_NUGET_KEY }} --source https://api.nuget.org/v3/index.json --skip-duplicate`

The CLI fsproj already has `<PackAsTool>true</PackAsTool>`, `<ToolCommandName>napper</ToolCommandName>`, `<PackageId>napper</PackageId>` ([src/Napper.Cli/Napper.Cli.fsproj](../../src/Napper.Cli/Napper.Cli.fsproj)). The release workflow's `validate-tag` job derives `$VERSION` from the git tag, so the published NuGet package version is always `<git tag stripped of 'v' prefix>`. The VSIX `package.json` is bumped to the same version by the `build-vsix` job (`npm version $VERSION --no-git-tag-version --allow-same-version`) before packaging the VSIX. Both artifacts therefore land on the marketplace with matching versions.

The first end-to-end exercise of this flow happens when you tag `v0.12.0`. Until then, the latest NuGet `napper` is `0.9.0` (published manually before the v0.10/v0.11 release runs failed on the stale `NUGET_API_KEY` secret name), so the install resolver against a v0.12.0 VSIX will fall through to `tool-install-failed` until v0.12.0 is tagged and the release workflow runs to green.

---

## Testing

### Unit tests — `src/Napper.VsCode/src/test/unit/cliResolver.test.ts`

Drive `cliResolver` with a mocked `exec` function. Each test asserts the exact sequence of commands invoked and the final `Result`. No vscode SDK, no real child processes.

| Scenario | Mocked exec responses | Expected Result |
|----------|----------------------|-----------------|
| PATH match | `napper --version` → `0.12.0` | `ok({ cliPath: 'napper' })` |
| PATH mismatch, dotnet present, tool install succeeds | `napper --version` → `0.9.0`; `dotnet --version` → `10.0.100`; `dotnet tool update -g napper --version 0.12.0` → exit 0; second `napper --version` → `0.12.0` | `ok({ cliPath: 'napper' })` |
| PATH missing, dotnet missing, brew present, .NET install succeeds, tool install succeeds | `napper --version` → `ENOENT`; `dotnet --version` → `ENOENT`; `brew --version` → `4.x`; `brew install --cask dotnet-sdk` → exit 0; `dotnet --version` → `10.0.100`; `dotnet tool install -g napper --version 0.12.0` → exit 0; second `napper --version` → `0.12.0` | `ok` |
| PATH missing, dotnet missing, brew missing | `napper --version` → `ENOENT`; `dotnet --version` → `ENOENT`; `brew --version` → `ENOENT` | `err({ kind: 'pm-missing', os: 'darwin' })` |
| Consent declined | (same as above through dotnet-missing); consent stub returns `false` | `err({ kind: 'consent-declined' })` |
| brew install fails | `brew install --cask dotnet-sdk` → exit 1, stderr "no recipe" | `err({ kind: 'pm-install-failed', pm: 'brew', exitCode: 1, stderr: 'no recipe' })` |
| `dotnet tool install` fails | exit 1, stderr "Package not found" | `err({ kind: 'tool-install-failed', exitCode: 1, stderr: 'Package not found' })` |
| Windows scoop path | `napper --version` → `ENOENT`; `dotnet --version` → `ENOENT`; `scoop --version` → ok; `scoop bucket add extras` → ok; `scoop install dotnet-sdk` → ok; rest → ok | `ok` |
| Windows choco fallback | scoop missing, choco present | uses choco install command |
| Restart required | brew install ok but second `dotnet --version` → `ENOENT` | `err({ kind: 'restart-required' })` |

### E2E tests — `src/Napper.VsCode/src/test/e2e/cliResolver.e2e.test.ts`

Place a stub `napper` shell script on the test workspace's PATH (via `process.env.PATH` prefix) that prints the VSIX version. Activate the extension; assert no install runs and `napper.runFile` works against a real `.nap` fixture. This is the **only** scenario we test e2e — all other branches are too slow and brittle to drive through real VS Code activation. Per CLAUDE.md "FAILING TEST = OK. TEST THAT DOESN'T ENFORCE BEHAVIOR = ILLEGAL", the e2e test asserts on actual `napper run` output, not on internal install state.

---

## Risks

| Risk | Mitigation |
|------|------------|
| brew/scoop/choco prompt for sudo or elevation, blocking the spawned process | Detect non-zero exit + specific stderr substrings ("password", "elevation", "administrator"); surface as `pm-install-failed` with a tailored message telling the user to run the command manually in an elevated shell |
| `dotnet tool install` succeeds but `~/.dotnet/tools` is not on PATH (fresh .NET install on Windows) | After tool install, also probe the absolute path `<HOME>/.dotnet/tools/napper[.exe]`. If found there, set `nap.cliPath` to the absolute path automatically and log a warning |
| User has multiple .NET SDKs and `dotnet tool install` targets the wrong global tools dir | Use the absolute-path probe above; log the resolved `dotnet --info` output to the Napper output channel for debugging |
| Brew/scoop install runs for >60s on slow connections, user thinks VS Code is hung | Progress notification with a live message; stream brew/scoop output to the Napper channel so the user can see real activity |
| The VSIX activates before the user has any internet at all | Step 1 still works if `napper` is already on PATH at the right version; otherwise step 4 fails fast with `pm-install-failed` (network error in stderr) and tank fires |

---

## TODO

### Spec & release prerequisites
- [x] Spec section [`vscode-cli-acquisition`](../specs/IDE-EXTENSION-SPEC.md#vscode-cli-acquisition) updated with the 6-step resolver and consent prompt
- [x] [`.github/workflows/release.yml`](../../.github/workflows/release.yml) `publish-nuget` job uses `secrets.NIMBLESITE_NUGET_KEY` and `--skip-duplicate`
- [ ] Tag `v0.12.0` to publish the first NuGet package on the new release pipeline (validates the end-to-end install flow has anything to install)

### New modules
- [ ] Create `src/Napper.VsCode/src/cliResolver.ts` — pure resolver, no vscode SDK imports, returns `Result<…, ResolverError>` per the table above
- [ ] Create `src/Napper.VsCode/src/cliResolverCommands.ts` — per-OS detect/install command tables
- [ ] Create `src/Napper.VsCode/src/cliResolverUi.ts` — vscode SDK glue: consent modal, progress notification, pm-prompt notification, tank notification
- [ ] Add `ResolverError` discriminated union to `src/Napper.VsCode/src/types.ts`

### Wire-up
- [ ] In `src/Napper.VsCode/src/extension.ts`, replace `ensureCliInstalled` (lines 159–180) with `await cliResolverUi.ensureCli({ vsixVersion, logger, outputChannel, storageDir })`
- [ ] Drop the `bundledCliPath` / extension `bin/` lookup if no longer needed (extension stops bundling a CLI binary)
- [ ] After successful install, persist the resolved absolute `cliPath` to extension globalState; warm-start probes the cached path before re-running the resolver

### LSP wire-up (depends on [LSP-PLAN.md Phase 2.5](./LSP-PLAN.md))
- [x] After the resolver returns `ok`, pass the resolved `cliPath` to `vscode-languageclient` as `command` with `args: ['lsp']` via `src/lspClient.ts:startLspClient`. The LSP and CLI are the same binary ([`lsp-one-binary`](../specs/LSP-SPEC.md#lsp-one-binary)) — no second discovery, no second version pin.
- [x] `vscode-languageclient` installed and wired in `extension.ts` — called from `checkVersionAt` on success.
- [ ] If the resolver tanks, the LSP client is **not** started. Diagnostics, completions, and hover are unavailable until the user resolves the install issue and reloads VS Code.

### Cleanup
- [ ] Delete `src/Napper.VsCode/src/cliInstaller.ts`
- [ ] Delete the unused constants in `src/Napper.VsCode/src/constants.ts` (see Module Layout table)
- [ ] Add new constants to `constants.ts` for consent text, progress titles, tank message, button labels — **one location only** per CLAUDE.md
- [x] Keep VSIX packaging unbundled: `.vscodeignore` excludes `bin/**` and `build-extension` does not stage a bundled CLI binary
- [ ] Delete the remaining local-dev CLI copy to `src/Napper.VsCode/bin/` from `Makefile build-cli` once no local workflow depends on it

### Tests
- [ ] Create `src/Napper.VsCode/src/test/unit/cliResolver.test.ts` covering every scenario in the unit-test table above
- [ ] Create `src/Napper.VsCode/src/test/e2e/cliResolver.e2e.test.ts` covering the PATH-match happy path against a real `.nap` fixture
- [ ] Update `npm run lint` config if any of the new files trip ESLint rules — fix the rule violations, never disable

### Docs
- [ ] Update [README.md](../../README.md) install section: brew tap, scoop bucket, dotnet tool, "the VS Code extension installs napper for you on first activation"
- [ ] Update [website/src/docs/installation.md](../../website/src/docs/installation.md) to match
- [ ] Note in the troubleshooting section that consent-declined / pm-missing / restart-required are the three states a user can self-resolve

### Phase 5 (blocked on [`cli-aot-migration`](../specs/CLI-SPEC.md#cli-aot-migration))
- [ ] Drop `cliResolverCommands.ts` brew-install-dotnet / scoop-install-dotnet / choco-install-dotnet entries
- [ ] Drop steps 2–4 of the resolver; step 5 becomes `brew install napper` / `scoop install napper`
- [ ] Drop `dotnet-missing`, `pm-install-failed`, `restart-required` from `ResolverError`

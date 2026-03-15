# AUDIT: VSIX Binary Management

The VSIX must not contain binaries. Instead it must check the required CLI version
is installed from the GitHub release, download it if missing, and overwrite if the
version is wrong. Scripts must honor local builds during development.

---

## 1. VSIX MUST NOT CONTAIN BINARIES

**Status: OK** (with caveat)

`.vscodeignore` line 10 has `bin/**` which excludes the bin directory from the VSIX
package. The release workflow (`release.yml:34-36`) packages a universal VSIX with
no CLI inside.

**Caveat:** `build-vsix.sh` copies the CLI to `src/Nap.VsCode/bin/` then packages a
"platform-specific" VSIX — but `.vscodeignore` excludes `bin/**`, so the binary is
silently dropped. The script is misleading: it looks like it bundles the CLI but
doesn't. Same for `build-all.sh` which copies to `bin/` then packages.

## 2. Must check binary version

**Status: NOT IMPLEMENTED**

- The CLI has no `--version` flag — `Program.fs` handles `run`, `check`, `generate`,
  `help` but not `version`
- No `<Version>` property in `Nap.Cli.fsproj`
- `cliInstaller.ts` only calls `fs.existsSync()` via `isCliInstalled()` — never
  checks what version the binary is
- No `CLI_VERSION` or `CLI_REQUIRED_VERSION` in `constants.ts`

## 3. If not installed, download from GH release

**Status: PARTIALLY IMPLEMENTED**

- `ensureCliInstalled()` in `extension.ts:111-128` downloads if the binary doesn't
  exist
- Downloads from `releases/latest/download/` — no version pinning. If the VSIX is
  v0.2.0 but "latest" release is v0.3.0, you get a mismatched CLI

## 4. If version is wrong, must overwrite

**Status: NOT IMPLEMENTED**

- Once a binary exists, `isCliInstalled()` returns `true` and no download occurs,
  even if it's the wrong version
- No mechanism to detect or replace stale binaries

## 5. Scripts honor local binary

**Status: PARTIALLY OK**

- `build-cli.sh` installs to `~/.local/bin/napper` and `src/Nap.VsCode/bin/napper`
- `getCliPath()` checks the bundled path first, so VSIX finds the local binary
  during tests
- No version verification in scripts after build

---

## Issues Summary

| # | Issue | Where |
|---|-------|-------|
| 1 | CLI needs `--version` flag that prints version | `Program.fs` |
| 2 | CLI needs `<Version>` property in fsproj | `Nap.Cli.fsproj` |
| 3 | Extension needs expected version constant | `constants.ts` |
| 4 | Extension needs `getCliVersion()` that runs `napper --version` | `cliInstaller.ts` |
| 5 | `ensureCliInstalled` must check version, re-download if wrong | `extension.ts` |
| 6 | Download URL must pin to version (`/releases/download/v{ver}/`) not `latest` | `constants.ts` + `cliInstaller.ts` |
| 7 | `build-vsix.sh` is misleading — copies CLI to bin/ but `.vscodeignore` drops it | `build-vsix.sh` or `.vscodeignore` |
| 8 | Scripts should verify binary version after build | `build-cli.sh`, `build-all.sh` |

---

## TODO

- [ ] Add `<Version>` property to `Nap.Cli.fsproj`
- [ ] Add `--version` command to `Program.fs` that prints the assembly version
- [ ] Add `CLI_REQUIRED_VERSION` constant to `constants.ts` matching the VSIX package version
- [ ] Add `getCliVersion()` to `cliInstaller.ts` that runs `napper --version` and returns the version string
- [ ] Update `ensureCliInstalled` in `extension.ts` to check version, re-download if mismatched
- [ ] Pin download URL to version (`/releases/download/v{ver}/`) instead of `latest`
- [ ] Fix `build-vsix.sh` — either remove it or fix `.vscodeignore` to include `bin/` when building platform-specific VSIX
- [ ] Add version verification to `build-cli.sh` and `build-all.sh` after build

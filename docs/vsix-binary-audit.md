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

**Status: IMPLEMENTED**

- CLI has `--version` flag in `Program.fs` that prints the assembly version
- `<Version>0.1.0</Version>` set in `Nap.Cli.fsproj`
- `getCliVersion()` in `cliInstaller.ts` runs `napper --version` and returns the result
- `CLI_REQUIRED_VERSION` in `constants.ts` pins the expected version

## 3. If not installed, download from GH release

**Status: IMPLEMENTED**

- `ensureCliInstalled()` in `extension.ts` downloads if the binary doesn't exist
- Download URL pinned to version: `/releases/download/v{CLI_REQUIRED_VERSION}/`

## 4. If version is wrong, must overwrite

**Status: IMPLEMENTED**

- `ensureCliInstalled()` checks version via `getCliVersion()` after existence check
- If version doesn't match `CLI_REQUIRED_VERSION`, logs mismatch and re-downloads

## 5. Scripts honor local binary

**Status: IMPLEMENTED**

- `build-cli.sh` installs to `~/.local/bin/napper` and `src/Nap.VsCode/bin/napper`
- `getCliPath()` checks the bundled path first, so VSIX finds the local binary
  during tests (no version check on bundled path — accepts any local build)
- Build scripts verify CLI version matches `<Version>` in fsproj after build
- `build-vsix.sh` packages a universal VSIX (no CLI bundled) and relies on
  `build-cli.sh` for local CLI installation

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

- [x] Add `<Version>` property to `Nap.Cli.fsproj`
- [x] Add `--version` command to `Program.fs` that prints the assembly version
- [x] Add `CLI_REQUIRED_VERSION` constant to `constants.ts` matching the VSIX package version
- [x] Add `getCliVersion()` to `cliInstaller.ts` that runs `napper --version` and returns the version string
- [x] Update `ensureCliInstalled` in `extension.ts` to check version, re-download if mismatched
- [x] Pin download URL to version (`/releases/download/v{ver}/`) instead of `latest`
- [x] Fix `build-vsix.sh` — builds universal VSIX, delegates CLI build to `build-cli.sh`
- [x] Add version verification to `build-cli.sh` and `build-all.sh` after build

#!/usr/bin/env bash
# Build platform-specific VSIX — EXACT same process as the build-vsix job in release.yml
#
# Detects current platform if NAP_RID / VSCE_TARGET are not set.
# Output: src/Nap.VsCode/napper-<target>-<version>.vsix
set -euo pipefail
cd "$(dirname "$0")/.."

# --- Detect RID + VSCE target ---
if [ -z "${NAP_RID:-}" ] || [ -z "${VSCE_TARGET:-}" ]; then
  ARCH=$(uname -m)
  OS=$(uname -s)
  case "$OS" in
    Darwin)
      case "$ARCH" in
        arm64) NAP_RID="osx-arm64"; VSCE_TARGET="darwin-arm64" ;;
        x86_64) NAP_RID="osx-x64"; VSCE_TARGET="darwin-x64" ;;
      esac ;;
    Linux) NAP_RID="linux-x64"; VSCE_TARGET="linux-x64" ;;
  esac
fi

if [ -z "${NAP_RID:-}" ] || [ -z "${VSCE_TARGET:-}" ]; then
  echo "ERROR: Could not detect platform. Set NAP_RID and VSCE_TARGET manually."
  exit 1
fi

echo "==> Building VSIX for $VSCE_TARGET (CLI: $NAP_RID)..."

# EXACT same as release.yml build-vsix job step: "Build CLI"
dotnet publish src/Nap.Cli/Nap.Cli.fsproj \
  -r "$NAP_RID" \
  --self-contained \
  -p:PublishTrimmed=true \
  -p:PublishSingleFile=true \
  -o src/Nap.VsCode/bin \
  --nologo

# EXACT same as release.yml build-vsix job step: "Install extension dependencies"
cd src/Nap.VsCode
npm ci

# EXACT same as release.yml build-vsix job step: "Compile extension"
npx webpack --mode production

# EXACT same as release.yml build-vsix job step: "Package VSIX"
npx @vscode/vsce package --target "$VSCE_TARGET" --no-dependencies --skip-license

echo "==> VSIX packaged for $VSCE_TARGET"

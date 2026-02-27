#!/usr/bin/env bash
# Build CLI binary — EXACT same process as the build-cli job in release.yml
#
# Detects current platform if NAP_RID is not set.
# Output: out/<rid>/napper (or napper.exe on Windows)
set -euo pipefail
cd "$(dirname "$0")/.."

# --- Detect RID ---
if [ -z "${NAP_RID:-}" ]; then
  ARCH=$(uname -m)
  OS=$(uname -s)
  case "$OS" in
    Darwin)
      case "$ARCH" in
        arm64) NAP_RID="osx-arm64" ;;
        x86_64) NAP_RID="osx-x64" ;;
      esac ;;
    Linux) NAP_RID="linux-x64" ;;
  esac
fi

if [ -z "${NAP_RID:-}" ]; then
  echo "ERROR: Could not detect platform. Set NAP_RID manually."
  exit 1
fi

echo "==> Building CLI for $NAP_RID..."

# EXACT same command as release.yml build-cli job
dotnet publish src/Nap.Cli/Nap.Cli.fsproj \
  -r "$NAP_RID" \
  --self-contained \
  -p:PublishTrimmed=true \
  -p:PublishSingleFile=true \
  -o "out/$NAP_RID" \
  --nologo

echo "==> CLI built → out/$NAP_RID/"

# --- Copy into extension bin/ so tests can find it ---
EXT_BIN="src/Nap.VsCode/bin"
mkdir -p "$EXT_BIN"
case "$NAP_RID" in
  win-*) cp "out/$NAP_RID/napper.exe" "$EXT_BIN/napper.exe" ;;
  *)     cp "out/$NAP_RID/napper" "$EXT_BIN/napper" ;;
esac
echo "==> Copied CLI → $EXT_BIN/"

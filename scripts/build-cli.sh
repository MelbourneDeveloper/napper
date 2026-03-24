#!/usr/bin/env bash
# Build CLI binary and install to PATH + extension bin/
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

dotnet publish src/Napper.Cli/Napper.Cli.fsproj \
  -r "$NAP_RID" \
  --self-contained \
  -p:PublishTrimmed=true \
  -p:PublishSingleFile=true \
  -o "out/$NAP_RID" \
  --nologo

echo "==> CLI built → out/$NAP_RID/"

# --- Copy into extension bin/ so tests can find it ---
EXT_BIN="src/Napper.VsCode/bin"
mkdir -p "$EXT_BIN"
cp "out/$NAP_RID/napper" "$EXT_BIN/napper"
echo "==> Copied CLI → $EXT_BIN/"

# --- Install to PATH so it overrides any stale released binary ---
mkdir -p "$HOME/.local/bin"
cp "out/$NAP_RID/napper" "$HOME/.local/bin/napper"
chmod +x "$HOME/.local/bin/napper"
echo "==> Installed CLI → ~/.local/bin/napper"

# --- Verify CLI version matches fsproj ---
EXPECTED_VERSION=$(sed -n 's/.*<Version>\(.*\)<\/Version>.*/\1/p' Directory.Build.props)
ACTUAL_VERSION=$("out/$NAP_RID/napper" --version)
if [ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ]; then
  echo "ERROR: Version mismatch — expected $EXPECTED_VERSION, got $ACTUAL_VERSION"
  exit 1
fi
echo "==> CLI version verified: $ACTUAL_VERSION"

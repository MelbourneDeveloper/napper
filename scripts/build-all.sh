#!/usr/bin/env bash
# Full clean rebuild: nuke all artifacts → rebuild CLI → install to PATH → rebuild extension → package VSIX
set -euo pipefail
cd "$(dirname "$0")/.."

# --- Detect platform ---
ARCH=$(uname -m)
OS=$(uname -s)
case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) NAP_RID="osx-arm64" ;;
      x86_64) NAP_RID="osx-x64" ;;
      *) echo "ERROR: Unsupported arch: $ARCH"; exit 1 ;;
    esac ;;
  Linux)
    NAP_RID="linux-x64" ;;
  *)
    echo "ERROR: Unsupported OS: $OS"; exit 1 ;;
esac

echo "==> Platform: $NAP_RID"

# ============================================================
# 1. CLEAN — nuke every build artifact
# ============================================================
echo "==> Cleaning all build artifacts..."

rm -rf out/
rm -rf src/Nap.Core/bin/ src/Nap.Core/obj/
rm -rf src/Nap.Cli/bin/ src/Nap.Cli/obj/
rm -rf tests/Nap.Core.Tests/bin/ tests/Nap.Core.Tests/obj/
rm -rf src/Nap.VsCode/bin/
rm -rf src/Nap.VsCode/dist/
rm -rf src/Nap.VsCode/out/
rm -f  src/Nap.VsCode/*.vsix
rm -rf coverage/

echo "==> Clean complete"

# ============================================================
# 2. BUILD CLI
# ============================================================
echo "==> Building CLI ($NAP_RID)..."

dotnet publish src/Nap.Cli/Nap.Cli.fsproj \
  -r "$NAP_RID" \
  --self-contained \
  -p:PublishTrimmed=true \
  -p:PublishSingleFile=true \
  -o "out/$NAP_RID" \
  --nologo

# Copy to extension bin/ (for tests and VSIX packaging)
EXT_BIN="src/Nap.VsCode/bin"
mkdir -p "$EXT_BIN"
cp "out/$NAP_RID/napper" "$EXT_BIN/napper"

# Install to PATH
mkdir -p "$HOME/.local/bin"
cp "out/$NAP_RID/napper" "$HOME/.local/bin/napper"
chmod +x "$HOME/.local/bin/napper"

# Verify CLI version matches fsproj
EXPECTED_VERSION=$(sed -n 's/.*<Version>\(.*\)<\/Version>.*/\1/p' src/Nap.Cli/Nap.Cli.fsproj)
ACTUAL_VERSION=$("out/$NAP_RID/napper" --version)
if [ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ]; then
  echo "ERROR: Version mismatch — expected $EXPECTED_VERSION, got $ACTUAL_VERSION"
  exit 1
fi

echo "==> CLI built and installed → ~/.local/bin/napper (v$ACTUAL_VERSION)"

# ============================================================
# 3. BUILD EXTENSION
# ============================================================
echo "==> Building VS Code extension..."

cd src/Nap.VsCode
npm ci
npx webpack --mode production
npm run compile:tests

echo "==> Extension compiled"

# ============================================================
# 4. PACKAGE VSIX
# ============================================================
echo "==> Packaging VSIX (universal)..."

npx @vscode/vsce package --no-dependencies --skip-license

VSIX_FILE=$(ls -1 *.vsix 2>/dev/null | head -1)
cd ../..

echo ""
echo "==> BUILD COMPLETE"
echo "    CLI:  ~/.local/bin/napper"
echo "    CLI:  $EXT_BIN/napper"
[ -n "${VSIX_FILE:-}" ] && echo "    VSIX: src/Nap.VsCode/$VSIX_FILE"
echo ""
napper --help | head -1

#!/usr/bin/env bash
# Clean install: uninstall old binary, rebuild everything, install fresh.
# Uses the EXACT same build process as the release.yml GitHub Action.
set -euo pipefail
cd "$(dirname "$0")/.."

# --- Detect platform ---
ARCH=$(uname -m)
OS=$(uname -s)
case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) NAP_RID="osx-arm64"; VSCE_TARGET="darwin-arm64" ;;
      x86_64) NAP_RID="osx-x64"; VSCE_TARGET="darwin-x64" ;;
      *) echo "ERROR: Unsupported arch: $ARCH"; exit 1 ;;
    esac ;;
  Linux)
    NAP_RID="linux-x64"; VSCE_TARGET="linux-x64" ;;
  *)
    echo "ERROR: Unsupported OS: $OS"; exit 1 ;;
esac

echo "==> Platform: $NAP_RID / $VSCE_TARGET"

# ============================================================
# 1. UNINSTALL
# ============================================================
echo "==> Uninstalling old napper..."
rm -f "$HOME/.local/bin/napper"
rm -rf out/
rm -rf src/Nap.VsCode/bin/
rm -f src/Nap.VsCode/*.vsix

# ============================================================
# 2. BUILD CLI BINARY  (exact same as release.yml build-cli job)
# ============================================================
echo "==> Building CLI binary ($NAP_RID)..."

dotnet publish src/Nap.Cli/Nap.Cli.fsproj \
  -r "$NAP_RID" \
  --self-contained \
  -p:PublishTrimmed=true \
  -p:PublishSingleFile=true \
  -o "out/$NAP_RID" \
  --nologo

# Install to PATH (same as release.yml "Prepare asset" step)
mkdir -p "$HOME/.local/bin"
cp "out/$NAP_RID/napper" "$HOME/.local/bin/napper"
chmod +x "$HOME/.local/bin/napper"
echo "==> CLI installed → ~/.local/bin/napper"

# ============================================================
# 3. BUILD VSIX  (exact same as release.yml build-vsix job)
# ============================================================
echo "==> Building VSIX ($VSCE_TARGET)..."

# Step: "Build CLI" — into src/Nap.VsCode/bin
dotnet publish src/Nap.Cli/Nap.Cli.fsproj \
  -r "$NAP_RID" \
  --self-contained \
  -p:PublishTrimmed=true \
  -p:PublishSingleFile=true \
  -o src/Nap.VsCode/bin \
  --nologo

# Step: "Install extension dependencies"
cd src/Nap.VsCode
npm ci

# Step: "Compile extension"
npx webpack --mode production

# Step: "Package VSIX"
npx @vscode/vsce package --target "$VSCE_TARGET" --no-dependencies --skip-license

# ============================================================
# 4. INSTALL VSIX
# ============================================================
VSIX_FILE=$(ls -1 *.vsix | head -1)
echo "==> Installing VSIX: $VSIX_FILE"
code --install-extension "$VSIX_FILE" --force

echo ""
echo "==> DONE"
echo "    CLI:  ~/.local/bin/napper"
echo "    VSIX: $VSIX_FILE (installed)"
echo ""
napper --help || echo "    (napper not on PATH — add ~/.local/bin to PATH)"

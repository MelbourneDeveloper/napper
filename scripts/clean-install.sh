#!/usr/bin/env bash
# Full clean rebuild + install VSIX into VS Code
set -euo pipefail
cd "$(dirname "$0")/.."

# Build everything (clean → CLI → extension → VSIX)
bash scripts/build-all.sh

# Install VSIX into VS Code
cd src/Nap.VsCode
VSIX_FILE=$(ls -1 *.vsix 2>/dev/null | head -1)

if [ -z "${VSIX_FILE:-}" ]; then
  echo "ERROR: No VSIX file found after build"
  exit 1
fi

echo "==> Installing VSIX: $VSIX_FILE"
code --install-extension "$VSIX_FILE" --force

echo ""
echo "==> DONE — restart VS Code to load the new extension"

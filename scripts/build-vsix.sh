#!/usr/bin/env bash
# Build CLI + universal VSIX (no binary bundled — VSIX downloads CLI at runtime)
#
# 1. Builds the CLI and installs to PATH + extension bin/ (for local testing)
# 2. Verifies CLI version matches the extension's expected version
# 3. Packages a universal VSIX (bin/ excluded by .vscodeignore)
set -euo pipefail
cd "$(dirname "$0")/.."

# --- Build CLI first (installs to PATH + bin/) ---
bash scripts/build-cli.sh

# --- Build extension + package VSIX ---
echo "==> Building VS Code extension..."
cd src/Nap.VsCode
npm ci
npx webpack --mode production
npx @vscode/vsce package --no-dependencies --skip-license

VSIX_FILE=$(ls -1 *.vsix 2>/dev/null | head -1)
cd ../..

echo ""
echo "==> VSIX packaged (universal — no CLI bundled)"
[ -n "${VSIX_FILE:-}" ] && echo "    VSIX: src/Nap.VsCode/$VSIX_FILE"
echo "    CLI installed at: ~/.local/bin/napper (for local use)"

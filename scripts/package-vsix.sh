#!/usr/bin/env bash
# Build extension and package a universal VSIX (no CLI binary bundled).
# The extension downloads the CLI binary on first activation.

set -euo pipefail
cd "$(dirname "$0")/.."

# --- Extension ---
bash scripts/build-extension.sh

# --- VSIX ---
echo "==> Packaging universal VSIX..."
cd src/Nap.VsCode
npx @vscode/vsce package --no-dependencies --skip-license
echo "==> VSIX packaged"

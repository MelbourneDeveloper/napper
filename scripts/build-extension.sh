#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> Compiling VSCode extension..."
cd src/Napper.VsCode
npm ci
npx webpack --mode production
echo "==> Extension compiled"

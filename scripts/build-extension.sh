#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> Compiling VSCode extension..."
cd src/Nap.VsCode
npx webpack --mode production
echo "==> Extension compiled"

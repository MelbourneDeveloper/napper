#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/build-cli.sh

echo "==> Compiling test TypeScript..."
cd src/Nap.VsCode
npm run compile
npm run compile:tests

echo "==> Running e2e tests..."
npx vscode-test

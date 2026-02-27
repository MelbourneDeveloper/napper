#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/build-cli.sh

COVERAGE_DIR="coverage/typescript"
rm -rf "$COVERAGE_DIR"
mkdir -p "$COVERAGE_DIR"

echo "==> Compiling TypeScript..."
cd src/Nap.VsCode
npm run compile
npm run compile:tests

echo "==> Running unit tests with coverage..."
npx c8 \
  --temp-directory "../../$COVERAGE_DIR/tmp" \
  --report-dir "../../$COVERAGE_DIR/report" \
  mocha out/test/unit/**/*.test.js --ui tdd --timeout 5000

echo "==> Running e2e tests..."
npx vscode-test

echo ""
echo "=== TypeScript Coverage Summary ==="
echo "Report: $COVERAGE_DIR/report/index.html"

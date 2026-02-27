#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../src/Nap.VsCode"

COVERAGE_DIR="../../coverage/typescript"
rm -rf "$COVERAGE_DIR"
mkdir -p "$COVERAGE_DIR"

echo "==> Compiling TypeScript tests..."
npm run compile:tests

echo "==> Running unit tests with coverage..."
npx c8 \
  --report-dir "$COVERAGE_DIR/report" \
  mocha out/test/unit/**/*.test.js --ui tdd --timeout 5000

echo ""
echo "  HTML report: $COVERAGE_DIR/report/index.html"
echo "  LCOV report: $COVERAGE_DIR/report/lcov.info"

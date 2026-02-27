#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

COVERAGE_DIR="coverage/fsharp"
rm -rf "$COVERAGE_DIR"
mkdir -p "$COVERAGE_DIR"

echo "==> Running F# tests with coverage..."
dotnet test tests/Nap.Core.Tests --nologo \
  --settings tests/Nap.Core.Tests/coverage.runsettings \
  --results-directory "$COVERAGE_DIR/raw"

echo "==> Generating coverage report..."
reportgenerator \
  -reports:"$COVERAGE_DIR/raw/*/coverage.cobertura.xml" \
  -targetdir:"$COVERAGE_DIR/report" \
  -reporttypes:"Html;TextSummary;Cobertura;lcov"

echo ""
echo "=== F# Coverage Summary ==="
cat "$COVERAGE_DIR/report/Summary.txt"
echo ""
echo "  HTML report: $COVERAGE_DIR/report/index.html"
echo "  LCOV report: $COVERAGE_DIR/report/lcov.info"

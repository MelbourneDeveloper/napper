#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

NAPCORE_COVERAGE_DIR="coverage/fsharp"
DOTHTTP_COVERAGE_DIR="coverage/dothttp"

# ─── Napper.Core tests ─────────────────────────────────────────

echo "========================================="
echo "  Napper.Core Tests + Coverage"
echo "========================================="

rm -rf "$NAPCORE_COVERAGE_DIR"
mkdir -p "$NAPCORE_COVERAGE_DIR"

echo "==> Running Napper.Core tests with coverage..."
dotnet test src/Napper.Core.Tests --nologo \
  --settings src/Napper.Core.Tests/coverage.runsettings \
  --results-directory "$NAPCORE_COVERAGE_DIR/raw"

echo "==> Generating Napper.Core coverage report..."
reportgenerator \
  -reports:"$NAPCORE_COVERAGE_DIR/raw/*/coverage.cobertura.xml" \
  -targetdir:"$NAPCORE_COVERAGE_DIR/report" \
  -reporttypes:"Html;TextSummary;Cobertura;lcov"

echo ""
echo "=== Napper.Core Coverage Summary ==="
cat "$NAPCORE_COVERAGE_DIR/report/Summary.txt"

# ─── DotHttp tests ──────────────────────────────────────────

echo ""
echo "========================================="
echo "  DotHttp Tests + Coverage"
echo "========================================="

rm -rf "$DOTHTTP_COVERAGE_DIR"
mkdir -p "$DOTHTTP_COVERAGE_DIR"

echo "==> Running DotHttp tests with coverage..."
dotnet test src/DotHttp.Tests --nologo \
  --settings src/DotHttp.Tests/coverage.runsettings \
  --results-directory "$DOTHTTP_COVERAGE_DIR/raw"

echo "==> Generating DotHttp coverage report..."
reportgenerator \
  -reports:"$DOTHTTP_COVERAGE_DIR/raw/*/coverage.cobertura.xml" \
  -targetdir:"$DOTHTTP_COVERAGE_DIR/report" \
  -reporttypes:"Html;TextSummary;Cobertura;lcov"

echo ""
echo "=== DotHttp Coverage Summary ==="
cat "$DOTHTTP_COVERAGE_DIR/report/Summary.txt"

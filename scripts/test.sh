#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

FSHARP_COVERAGE_DIR="coverage/fsharp"
DOTHTTP_COVERAGE_DIR="coverage/dothttp"
TS_COVERAGE_DIR="coverage/typescript"
RUST_COVERAGE_DIR="coverage/rust"

# ─── F# tests with coverage ─────────────────────────────────

echo "========================================="
echo "  F# Tests + Coverage (Nap.Core)"
echo "========================================="

rm -rf "$FSHARP_COVERAGE_DIR"
mkdir -p "$FSHARP_COVERAGE_DIR"

echo "==> Building CLI..."
bash scripts/build-cli.sh

echo "==> Running Nap.Core tests with coverage..."
dotnet test src/Nap.Core.Tests --nologo \
  --settings src/Nap.Core.Tests/coverage.runsettings \
  --results-directory "$FSHARP_COVERAGE_DIR/raw"

echo "==> Generating Nap.Core coverage report..."
reportgenerator \
  -reports:"$FSHARP_COVERAGE_DIR/raw/*/coverage.cobertura.xml" \
  -targetdir:"$FSHARP_COVERAGE_DIR/report" \
  -reporttypes:"Html;TextSummary;Cobertura;lcov"

echo ""
echo "=== Nap.Core Coverage Summary ==="
cat "$FSHARP_COVERAGE_DIR/report/Summary.txt"

# ─── DotHttp F# tests with coverage ─────────────────────────

echo ""
echo "========================================="
echo "  F# Tests + Coverage (DotHttp)"
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

# ─── Rust tests with coverage ────────────────────────────────

echo ""
echo "========================================="
echo "  Rust Tests + Coverage (Nap.Zed)"
echo "========================================="

rm -rf "$RUST_COVERAGE_DIR"
mkdir -p "$RUST_COVERAGE_DIR"

echo "==> Running Rust checks..."
cargo fmt --manifest-path src/Nap.Zed/Cargo.toml -- --check
cargo clippy --manifest-path src/Nap.Zed/Cargo.toml

echo "==> Running Rust tests with coverage..."
pushd src/Nap.Zed > /dev/null
cargo tarpaulin --out html lcov xml --output-dir "../../$RUST_COVERAGE_DIR/report" --skip-clean
popd > /dev/null

echo ""
echo "=== Rust Coverage Summary ==="
LINE_RATE=$(sed -n 's/.*line-rate="\([0-9.]*\)".*/\1/p' "$RUST_COVERAGE_DIR/report/cobertura.xml" 2>/dev/null | head -1)
LINE_RATE=${LINE_RATE:-0}
echo "  Line coverage: $(echo "$LINE_RATE * 100" | bc -l | xargs printf "%.1f")%"

# ─── TypeScript tests with coverage ─────────────────────────

echo ""
echo "========================================="
echo "  TypeScript Tests + Coverage"
echo "========================================="

rm -rf "$TS_COVERAGE_DIR"
mkdir -p "$TS_COVERAGE_DIR"

cd src/Nap.VsCode

echo "==> Compiling TypeScript..."
npm run compile
npm run compile:tests

echo "==> Running unit tests with coverage..."
npx c8 \
  --temp-directory "../../$TS_COVERAGE_DIR/tmp" \
  --report-dir "../../$TS_COVERAGE_DIR/report" \
  --reporter html --reporter text --reporter lcov \
  mocha out/test/unit/**/*.test.js --ui tdd --timeout 5000

echo "==> Running e2e tests..."
npx vscode-test

cd ../..

echo ""
echo "========================================="
echo "  Coverage Reports"
echo "========================================="
echo "  Nap.Core:   $FSHARP_COVERAGE_DIR/report/index.html"
echo "  DotHttp:    $DOTHTTP_COVERAGE_DIR/report/index.html"
echo "  Rust:       $RUST_COVERAGE_DIR/report/index.html"
echo "  TypeScript: $TS_COVERAGE_DIR/report/index.html"
echo "========================================="

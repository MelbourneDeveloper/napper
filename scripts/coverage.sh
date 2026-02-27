#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "========================================"
echo "  Running all coverage reports"
echo "========================================"

echo ""
bash scripts/coverage-fsharp.sh

echo ""
echo "----------------------------------------"
echo ""

bash scripts/coverage-typescript.sh

echo ""
echo "========================================"
echo "  Coverage reports complete"
echo "========================================"
echo "  F# report:         coverage/fsharp/report/index.html"
echo "  TypeScript report:  coverage/typescript/report/index.html"
echo "========================================"

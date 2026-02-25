#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> Running F# tests..."
dotnet test tests/Nap.Core.Tests --nologo

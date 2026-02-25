#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/build-cli.sh
bash scripts/build-extension.sh
echo "==> All builds complete"

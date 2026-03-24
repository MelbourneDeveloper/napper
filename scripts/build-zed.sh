#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

ZED_DIR="src/Napper.Zed"
GRAMMARS_DIR="$ZED_DIR/grammars"

echo "==> Checking prerequisites..."

if ! command -v cargo &>/dev/null; then
  echo "ERROR: cargo not found. Install Rust: https://rustup.rs"
  exit 1
fi

if ! command -v tree-sitter &>/dev/null; then
  echo "ERROR: tree-sitter CLI not found. Install: npm install -g tree-sitter-cli"
  exit 1
fi

if ! rustup target list --installed 2>/dev/null | grep -q wasm32-wasi; then
  echo "==> Adding wasm32-wasip1 target..."
  rustup target add wasm32-wasip1
fi

echo "==> Generating Tree-sitter parsers..."

for grammar in nap naplist napenv; do
  echo "    $grammar"
  (cd "$GRAMMARS_DIR/tree-sitter-$grammar" && tree-sitter generate)
done

echo "==> Building Rust extension (WASM)..."
(cd "$ZED_DIR" && cargo build --release --target wasm32-wasip1)

echo "==> Running clippy..."
(cd "$ZED_DIR" && cargo clippy --target wasm32-wasip1)

echo "==> Build complete"
echo ""
echo "To test in Zed:"
echo "  1. Open Zed"
echo "  2. Run: zed: install dev extension"
echo "  3. Select: $(pwd)/$ZED_DIR"

#!/usr/bin/env bash
# Install Napper CLI on macOS / Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/MelbourneDeveloper/napper/main/scripts/install.sh | bash
# Or:    ./scripts/install.sh [version]
#   e.g. ./scripts/install.sh 0.2.0
set -euo pipefail

REPO="MelbourneDeveloper/napper"
VERSION="${1:-latest}"
INSTALL_DIR="${NAPPER_INSTALL_DIR:-$HOME/.local/bin}"
CHECKSUM_FILE="checksums-sha256.txt"

# --- Detect platform ---
ARCH=$(uname -m)
OS=$(uname -s)
case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  ASSET="napper-osx-arm64" ;;
      x86_64) ASSET="napper-osx-x64" ;;
      *)      echo "ERROR: Unsupported arch: $ARCH"; exit 1 ;;
    esac ;;
  Linux)
    ASSET="napper-linux-x64" ;;
  *)
    echo "ERROR: Unsupported OS: $OS (use install.ps1 for Windows)"; exit 1 ;;
esac

# --- Resolve version ---
if [ "$VERSION" = "latest" ]; then
  echo "==> Fetching latest release..."
  TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | cut -d '"' -f 4)
else
  TAG="v${VERSION}"
fi

echo "==> Installing napper $TAG ($ASSET)"

BASE_URL="https://github.com/$REPO/releases/download/$TAG"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# --- Download binary and checksums ---
echo "==> Downloading $ASSET..."
curl -fSL -o "$TMP_DIR/$ASSET" "$BASE_URL/$ASSET"

echo "==> Downloading checksums..."
curl -fSL -o "$TMP_DIR/$CHECKSUM_FILE" "$BASE_URL/$CHECKSUM_FILE"

# --- Verify checksum ---
echo "==> Verifying SHA256 checksum..."
EXPECTED_HASH=$(grep "$ASSET" "$TMP_DIR/$CHECKSUM_FILE" | awk '{print $1}')

if [ -z "$EXPECTED_HASH" ]; then
  echo "ERROR: $ASSET not found in checksums file"
  exit 1
fi

ACTUAL_HASH=$(shasum -a 256 "$TMP_DIR/$ASSET" | awk '{print $1}')

if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
  echo "ERROR: Checksum mismatch"
  echo "  Expected: $EXPECTED_HASH"
  echo "  Actual:   $ACTUAL_HASH"
  exit 1
fi

echo "    Checksum verified: $ACTUAL_HASH"

# --- Install ---
mkdir -p "$INSTALL_DIR"
mv "$TMP_DIR/$ASSET" "$INSTALL_DIR/napper"
chmod +x "$INSTALL_DIR/napper"

echo ""
echo "==> napper $TAG installed to $INSTALL_DIR/napper"
echo "    Run: napper --help"

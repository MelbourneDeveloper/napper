#!/usr/bin/env bash
# Bump version across all projects (F#, TypeScript) and optionally commit+push.
# Usage: ./scripts/bump-version.sh <version> [--commit]
#   e.g. ./scripts/bump-version.sh 0.2.0 --commit
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <version> [--commit]"
  echo "  e.g. $0 0.2.0 --commit"
  exit 1
fi

VERSION="$1"
COMMIT="${2:-}"

echo "==> Bumping all projects to v${VERSION}"

# --- F# (Directory.Build.props) ---
sed -i.bak "s|<Version>.*</Version>|<Version>${VERSION}</Version>|" Directory.Build.props
rm -f Directory.Build.props.bak
echo "    Directory.Build.props → ${VERSION}"

# --- TypeScript / VS Code extension (package.json) ---
cd src/Napper.VsCode
npm version "${VERSION}" --no-git-tag-version --allow-same-version
cd ../..
echo "    src/Napper.VsCode/package.json → ${VERSION}"

# --- Rust (Cargo.toml) — bump if present ---
if [ -f Cargo.toml ]; then
  sed -i.bak "s/^version = \".*\"/version = \"${VERSION}\"/" Cargo.toml
  rm -f Cargo.toml.bak
  echo "    Cargo.toml → ${VERSION}"
fi

echo "==> All projects bumped to v${VERSION}"

# --- Commit + push if requested ---
if [ "$COMMIT" = "--commit" ]; then
  echo "==> Committing and pushing version bump..."
  # Set git identity in CI if not already configured
  if [ -n "${CI:-}" ]; then
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
  fi
  git add Directory.Build.props src/Napper.VsCode/package.json src/Napper.VsCode/package-lock.json
  [ -f Cargo.toml ] && git add Cargo.toml
  git commit -m "release: update version to v${VERSION}"
  git push
  echo "==> Committed and pushed v${VERSION}"
fi

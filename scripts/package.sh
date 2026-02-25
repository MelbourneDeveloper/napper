#!/usr/bin/env bash
# Package a universal (unplatformed) VSIX for local development.
# For platform-specific builds, use package-vsix.sh with NAP_RID + VSCE_TARGET.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/package-vsix.sh

#!/usr/bin/env bash
# scripts/sync-brand-assets.sh
#
# Thin POSIX shell wrapper around the cross-platform Node implementation.
# Delegates to scripts/sync-brand-assets.mjs so logic lives in one place.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/sync-brand-assets.mjs" "$@"

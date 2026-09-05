#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BUN_VERSION="$(sed -n 's/.*"packageManager": "bun@\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -n 1)"
OFFICIAL_PROBE="https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION/SHASUMS256.txt"
CHINA_PROBE="https://registry.npmmirror.com/-/binary/bun/bun-v$BUN_VERSION/SHASUMS256.txt"
SOURCE="$("$PROJECT_ROOT/scripts/select-download-source.sh" "$OFFICIAL_PROBE" "$CHINA_PROBE")"
echo "Selected download source: $SOURCE"

"$PROJECT_ROOT/scripts/bootstrap-local-bun.sh"
"$PROJECT_ROOT/scripts/bootstrap-local-node.sh"
"$PROJECT_ROOT/scripts/bun-local.sh" install --frozen-lockfile

cd "$PROJECT_ROOT/launcher"
"$PROJECT_ROOT/scripts/bun-local.sh" install --frozen-lockfile --cwd "$PROJECT_ROOT/launcher"

echo "Local Bun, Node.js, and all project dependencies are ready."
echo "Use ./scripts/bun-local.sh instead of a global bun command."

#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
NODE_VERSION="$(sed -n 's/.*"node": "\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -n 1)"
LOCAL_NODE="$PROJECT_ROOT/.tools/node/$NODE_VERSION/bin/node"
if [ ! -x "$LOCAL_NODE" ]; then
  echo "Local Node.js is not installed. Run ./scripts/setup-local.sh first." >&2
  exit 1
fi
export npm_config_cache="$PROJECT_ROOT/.cache/npm"
cd "$PROJECT_ROOT"
exec "$LOCAL_NODE" "$@"

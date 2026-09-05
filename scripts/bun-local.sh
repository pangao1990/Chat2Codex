#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BUN_VERSION="$(sed -n 's/.*"packageManager": "bun@\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -n 1)"
NODE_VERSION="$(sed -n 's/.*"node": "\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -n 1)"
LOCAL_BUN="$PROJECT_ROOT/.tools/bun/$BUN_VERSION/bin/bun"
LOCAL_NODE_BIN="$PROJECT_ROOT/.tools/node/$NODE_VERSION/bin"

if [ ! -x "$LOCAL_BUN" ]; then
  echo "Local Bun is not installed. Run ./scripts/setup-local.sh first." >&2
  exit 1
fi

mkdir -p \
  "$PROJECT_ROOT/.cache/bun/install" \
  "$PROJECT_ROOT/.cache/bun/transpiler" \
  "$PROJECT_ROOT/.cache/electron" \
  "$PROJECT_ROOT/.cache/electron-builder" \
  "$PROJECT_ROOT/.cache/npm" \
  "$PROJECT_ROOT/.tools/bun-home"
printf '%s\n' '{"type":"commonjs","private":true}' > "$PROJECT_ROOT/.cache/package.json"

export BUN_INSTALL="$PROJECT_ROOT/.tools/bun-home"
export BUN_INSTALL_CACHE_DIR="$PROJECT_ROOT/.cache/bun/install"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH="$PROJECT_ROOT/.cache/bun/transpiler"
SOURCE="${CHAT2CODEX_SOURCE:-auto}"
if [ "$SOURCE" = "auto" ] && [ -f "$PROJECT_ROOT/.tools/download-source" ]; then
  SOURCE="$(sed -n '1p' "$PROJECT_ROOT/.tools/download-source")"
fi
if [ "$SOURCE" = "china" ]; then REGISTRY="https://registry.npmmirror.com"; else REGISTRY="https://registry.npmjs.org"; fi
export BUN_CONFIG_REGISTRY="$REGISTRY"
export npm_config_registry="$REGISTRY"
export npm_config_cache="$PROJECT_ROOT/.cache/npm"
export ELECTRON_CACHE="$PROJECT_ROOT/.cache/electron"
export ELECTRON_BUILDER_CACHE="$PROJECT_ROOT/.cache/electron-builder"
export PATH="$PROJECT_ROOT/.tools/bun/$BUN_VERSION/bin:$LOCAL_NODE_BIN:$PATH"

cd "$PROJECT_ROOT"
exec "$LOCAL_BUN" "$@"

#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
NODE_VERSION="$(sed -n 's/.*"node": "\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -n 1)"
if [ -z "$NODE_VERSION" ]; then
  echo "Could not read the pinned Node.js version from package.json" >&2
  exit 1
fi
if ! printf '%s\n' "$NODE_VERSION" | awk '/^[0-9]+\.[0-9]+\.[0-9]+$/ { valid = 1 } END { exit valid ? 0 : 1 }'; then
  echo "package.json must pin Node.js as x.y.z" >&2
  exit 1
fi
for command_name in curl tar awk; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing operating-system command: $command_name" >&2
    exit 1
  fi
done

case "$(uname -s):$(uname -m)" in
  Darwin:arm64) NODE_PLATFORM="darwin-arm64" ;;
  Darwin:x86_64) NODE_PLATFORM="darwin-x64" ;;
  Linux:aarch64|Linux:arm64) NODE_PLATFORM="linux-arm64" ;;
  Linux:x86_64|Linux:amd64) NODE_PLATFORM="linux-x64" ;;
  *)
    echo "Unsupported platform for local Node.js: $(uname -s) $(uname -m)" >&2
    exit 1
    ;;
esac

LOCAL_NODE="$PROJECT_ROOT/.tools/node/$NODE_VERSION/bin/node"
if [ -x "$LOCAL_NODE" ] && [ "$("$LOCAL_NODE" --version)" = "v$NODE_VERSION" ]; then
  echo "Local Node.js $NODE_VERSION is already installed"
  exit 0
fi

ASSET="node-v$NODE_VERSION-$NODE_PLATFORM.tar.gz"
RELEASE_URL="https://nodejs.org/download/release/v$NODE_VERSION"
CHINA_RELEASE_URL="https://registry.npmmirror.com/-/binary/node/v$NODE_VERSION"
SOURCE="$("$PROJECT_ROOT/scripts/select-download-source.sh" "$RELEASE_URL/SHASUMS256.txt" "$CHINA_RELEASE_URL/SHASUMS256.txt")"
if [ "$SOURCE" = "china" ]; then DOWNLOAD_URL="$CHINA_RELEASE_URL"; else DOWNLOAD_URL="$RELEASE_URL"; fi
DOWNLOAD_DIR="$PROJECT_ROOT/.cache/node/downloads/$NODE_VERSION"
ARCHIVE="$DOWNLOAD_DIR/$ASSET"
CHECKSUMS="$DOWNLOAD_DIR/SHASUMS256.txt"
mkdir -p "$DOWNLOAD_DIR" "$PROJECT_ROOT/.tools/node/$NODE_VERSION"
echo "Downloading Node.js $NODE_VERSION from the $SOURCE source"
curl -fsSL --retry 3 --retry-all-errors "$DOWNLOAD_URL/$ASSET" -o "$ARCHIVE"
curl -fsSL --retry 3 --retry-all-errors "$RELEASE_URL/SHASUMS256.txt" -o "$CHECKSUMS"

EXPECTED="$(awk -v asset="$ASSET" '$2 == asset { print $1 }' "$CHECKSUMS")"
if command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "$ARCHIVE" | awk '{ print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$ARCHIVE" | awk '{ print $1}')"
else
  echo "A SHA-256 tool (shasum or sha256sum) is required" >&2
  exit 1
fi
if [ -z "$EXPECTED" ] || [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "SHA-256 verification failed for $ASSET" >&2
  exit 1
fi

STAGE_DIR="$(mktemp -d "$PROJECT_ROOT/.tools/.node-stage.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT HUP INT TERM
tar -xzf "$ARCHIVE" -C "$STAGE_DIR"
EXTRACTED="$STAGE_DIR/node-v$NODE_VERSION-$NODE_PLATFORM"
if [ ! -x "$EXTRACTED/bin/node" ]; then
  echo "Downloaded Node.js archive is incomplete" >&2
  exit 1
fi
rm -rf "$PROJECT_ROOT/.tools/node/$NODE_VERSION"
mv "$EXTRACTED" "$PROJECT_ROOT/.tools/node/$NODE_VERSION"
if [ "$("$LOCAL_NODE" --version)" != "v$NODE_VERSION" ]; then
  echo "Installed Node.js version does not match $NODE_VERSION" >&2
  exit 1
fi
echo "Installed local Node.js $NODE_VERSION at $LOCAL_NODE"

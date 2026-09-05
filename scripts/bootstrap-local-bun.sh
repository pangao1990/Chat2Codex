#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BUN_VERSION="$(sed -n 's/.*"packageManager": "bun@\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | head -n 1)"

for command_name in curl unzip awk; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing operating-system command: $command_name" >&2
    echo "Install it with your operating system's package manager, then run this script again." >&2
    exit 1
  fi
done

if [ -z "$BUN_VERSION" ]; then
  echo "Could not read the pinned Bun version from package.json" >&2
  exit 1
fi

case "$(uname -s):$(uname -m)" in
  Darwin:arm64) BUN_PLATFORM="darwin-aarch64" ;;
  Darwin:x86_64) BUN_PLATFORM="darwin-x64-baseline" ;;
  Linux:aarch64|Linux:arm64) BUN_PLATFORM="linux-aarch64" ;;
  Linux:x86_64|Linux:amd64) BUN_PLATFORM="linux-x64-baseline" ;;
  *)
    echo "Unsupported platform for local Bun: $(uname -s) $(uname -m)" >&2
    exit 1
    ;;
esac

LOCAL_BUN="$PROJECT_ROOT/.tools/bun/$BUN_VERSION/bin/bun"
if [ -x "$LOCAL_BUN" ] && [ "$("$LOCAL_BUN" --version)" = "$BUN_VERSION" ]; then
  ln -sfn bun "$(dirname "$LOCAL_BUN")/bunx"
  echo "Local Bun $BUN_VERSION is already installed"
  exit 0
fi

ASSET="bun-$BUN_PLATFORM.zip"
RELEASE_URL="https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION"
CHINA_RELEASE_URL="https://registry.npmmirror.com/-/binary/bun/bun-v$BUN_VERSION"
SOURCE="$("$PROJECT_ROOT/scripts/select-download-source.sh" "$RELEASE_URL/SHASUMS256.txt" "$CHINA_RELEASE_URL/SHASUMS256.txt")"
if [ "$SOURCE" = "china" ]; then DOWNLOAD_URL="$CHINA_RELEASE_URL"; else DOWNLOAD_URL="$RELEASE_URL"; fi
DOWNLOAD_DIR="$PROJECT_ROOT/.cache/bun/downloads/$BUN_VERSION"
ARCHIVE="$DOWNLOAD_DIR/$ASSET"
CHECKSUMS="$DOWNLOAD_DIR/SHASUMS256.txt"
mkdir -p "$DOWNLOAD_DIR" "$PROJECT_ROOT/.tools/bun/$BUN_VERSION/bin"

echo "Downloading Bun $BUN_VERSION from the $SOURCE source"
curl -fsSL --retry 3 --retry-all-errors "$DOWNLOAD_URL/$ASSET" -o "$ARCHIVE"
curl -fsSL --retry 3 --retry-all-errors "$RELEASE_URL/SHASUMS256.txt" -o "$CHECKSUMS"

EXPECTED="$(awk -v asset="$ASSET" '$2 == asset { print $1 }' "$CHECKSUMS")"
if [ -z "$EXPECTED" ]; then
  echo "Official checksum list has no entry for $ASSET" >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "$ARCHIVE" | awk '{ print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$ARCHIVE" | awk '{ print $1}')"
else
  echo "A SHA-256 tool (shasum or sha256sum) is required" >&2
  exit 1
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "SHA-256 verification failed for $ASSET" >&2
  exit 1
fi

STAGE_DIR="$(mktemp -d "$PROJECT_ROOT/.tools/.bun-stage.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT HUP INT TERM
unzip -q "$ARCHIVE" -d "$STAGE_DIR"
EXTRACTED_BUN="$STAGE_DIR/bun-$BUN_PLATFORM/bun"
if [ ! -x "$EXTRACTED_BUN" ]; then
  echo "Downloaded Bun archive is incomplete" >&2
  exit 1
fi

install -m 0755 "$EXTRACTED_BUN" "$LOCAL_BUN"
ln -sfn bun "$(dirname "$LOCAL_BUN")/bunx"
if [ "$("$LOCAL_BUN" --version)" != "$BUN_VERSION" ]; then
  echo "Installed Bun version does not match $BUN_VERSION" >&2
  exit 1
fi

echo "Installed local Bun $BUN_VERSION at $LOCAL_BUN"

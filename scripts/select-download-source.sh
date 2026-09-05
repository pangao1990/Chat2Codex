#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
REQUESTED="${CHAT2CODEX_SOURCE:-auto}"
SOURCE_FILE="$PROJECT_ROOT/.tools/download-source"
case "$REQUESTED" in
  china|official) SELECTED="$REQUESTED" ;;
  auto)
    if [ -f "$SOURCE_FILE" ] && [ "${CHAT2CODEX_SOURCE+x}" != "x" ]; then
      SELECTED="$(sed -n '1p' "$SOURCE_FILE")"
    else
      OFFICIAL_TIME="$(curl -fsSL -o /dev/null --connect-timeout 4 --max-time 12 -w '%{time_starttransfer}' "$1" 2>/dev/null || printf '999999')"
      CHINA_TIME="$(curl -fsSL -o /dev/null --connect-timeout 4 --max-time 12 -w '%{time_starttransfer}' "$2" 2>/dev/null || printf '999999')"
      SELECTED="$(awk -v official="$OFFICIAL_TIME" -v china="$CHINA_TIME" 'BEGIN { print (china + 0 < official + 0) ? "china" : "official" }')"
    fi
    ;;
  *)
    echo "CHAT2CODEX_SOURCE must be auto, china, or official" >&2
    exit 1
    ;;
esac
case "$SELECTED" in china|official) ;; *) SELECTED="official" ;; esac
mkdir -p "$PROJECT_ROOT/.tools"
printf '%s\n' "$SELECTED" > "$SOURCE_FILE"
printf '%s\n' "$SELECTED"

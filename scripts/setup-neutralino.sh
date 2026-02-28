#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

mkdir -p "$ROOT_DIR/resources/js" "$ROOT_DIR/resources/icon"

SOURCE_WEBAPP_DIR="/Volumes/mm4-data/fcs/web-dev/dashboard.local"

if [[ -f "$ROOT_DIR/assets/icon/app-icon.png" ]]; then
  cp "$ROOT_DIR/assets/icon/app-icon.png" "$ROOT_DIR/resources/icon/app-icon.png"
fi

if [[ -f "$ROOT_DIR/resources/api-keys" ]]; then
  rm "$ROOT_DIR/resources/api-keys"
fi

if [[ -d "$ROOT_DIR/resources/api-keys" ]]; then
  rm -rf "$ROOT_DIR/resources/api-keys"
fi

npx @neutralinojs/neu update --latest

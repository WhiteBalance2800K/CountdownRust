#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
PACKAGE_VERSION="${VERSION%.0}"

npm run tauri -- build --bundles app

OUT_DIR="$ROOT_DIR/dist-packages/macos"
APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/Countdown.app"
ZIP_PATH="$OUT_DIR/Countdown-v$PACKAGE_VERSION-macOS.zip"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"

echo "Created $ZIP_PATH"

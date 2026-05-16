#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run tauri -- build --bundles appimage

OUT_DIR="$ROOT_DIR/dist-packages/linux"
APPIMAGE_DIR="$ROOT_DIR/src-tauri/target/release/bundle/appimage"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp "$APPIMAGE_DIR"/*.AppImage "$OUT_DIR/"

echo "Created Linux AppImage in $OUT_DIR"

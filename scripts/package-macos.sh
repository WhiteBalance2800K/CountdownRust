#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' app/Cargo.toml | head -1)"
cargo build --manifest-path app/Cargo.toml --release

OUT_DIR="$ROOT_DIR/dist-packages/macos"
APP_DIR="$OUT_DIR/Countdown.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"
RES_DIR="$APP_DIR/Contents/Resources"
ZIP_PATH="$OUT_DIR/Countdown-v$VERSION-macOS.zip"

rm -rf "$OUT_DIR"
mkdir -p "$MACOS_DIR" "$RES_DIR"
cp "$ROOT_DIR/app/target/release/countdown" "$MACOS_DIR/Countdown"
cp "$ROOT_DIR/app/icons/icon.icns" "$RES_DIR/icon.icns"
cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>Countdown</string>
  <key>CFBundleIdentifier</key><string>com.whitebalance2800k.countdown</string>
  <key>CFBundleName</key><string>Countdown</string>
  <key>CFBundleDisplayName</key><string>Countdown</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
</dict></plist>
PLIST

ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$ZIP_PATH"
echo "Created $ZIP_PATH"

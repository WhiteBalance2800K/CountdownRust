#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' app/Cargo.toml | head -1)"
cargo build --manifest-path app/Cargo.toml --release

OUT_DIR="$ROOT_DIR/dist-packages/linux"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/Countdown"
cp "$ROOT_DIR/app/target/release/countdown" "$OUT_DIR/Countdown/Countdown"
cp "$ROOT_DIR/README.md" "$OUT_DIR/Countdown/README.md"
(cd "$OUT_DIR" && tar -czf "Countdown-v$VERSION-linux-portable.tar.gz" Countdown)
echo "Created $OUT_DIR/Countdown-v$VERSION-linux-portable.tar.gz"

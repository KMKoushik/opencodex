#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
IDENTITY=-
while [ "$#" -gt 0 ]; do
  case "$1" in
    --identity) IDENTITY="${2:?--identity needs a signing identity}"; shift 2 ;;
    *) echo "Usage: $0 [--identity 'Developer ID Application: …']" >&2; exit 2 ;;
  esac
done
cd "$ROOT"
VERSION=$(bun -e 'console.log(require("./apps/desktop/package.json").version)')
# Read the actual pinned Electron runtime's deployment requirement, not a guessed OS version.
ELECTRON=$(cd apps/desktop && node -p 'require("electron")')
MIN_OS=$(plutil -extract LSMinimumSystemVersion raw -o - "$(dirname "$ELECTRON")/../Info.plist")
TARGET_ARGS=()
BINARY=apps/rune/target/release/opencodex
if ! rustc -vV | grep -q '^host: aarch64-apple-darwin$'; then
  TARGET_ARGS=(--target aarch64-apple-darwin)
  BINARY=apps/rune/target/aarch64-apple-darwin/release/opencodex
fi
MACOSX_DEPLOYMENT_TARGET="$MIN_OS" cargo build --manifest-path apps/rune/Cargo.toml --profile release "${TARGET_ARGS[@]}" --workspace
bun run gateway:compile --target bun-darwin-arm64
APP="$ROOT/apps/rune/dist/OpenCodex Rune.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINARY" "$APP/Contents/MacOS/opencodex"
cp packages/gateway/dist/opencodex-gateway "$APP/Contents/Resources/"
cp apps/desktop/build/icon.icns "$APP/Contents/Resources/icon.icns"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.opencodex.rune</string>
<key>CFBundleName</key><string>OpenCodex Rune</string>
<key>CFBundleDisplayName</key><string>OpenCodex Rune</string>
<key>CFBundleExecutable</key><string>opencodex</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
<key>CFBundleVersion</key><string>$VERSION</string>
<key>CFBundleIconFile</key><string>icon.icns</string>
<key>LSMinimumSystemVersion</key><string>$MIN_OS</string>
<key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
EOF
codesign --force --sign "$IDENTITY" "$APP/Contents/Resources/opencodex-gateway"
codesign --force --deep --sign "$IDENTITY" "$APP"
codesign --verify --deep --strict "$APP"
echo "Bundle size (KiB, allocated on disk):"
du -sk "$APP/Contents/MacOS/opencodex" "$APP/Contents/Resources/opencodex-gateway" "$APP/Contents/Resources/icon.icns" "$APP"

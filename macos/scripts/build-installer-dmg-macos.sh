#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
VERSION="$(LC_ALL=C /usr/bin/tr -d '[:space:]' < "$PROJECT_ROOT/VERSION")"
APP_OUTPUT=""
DMG_OUTPUT=""
SKIP_DMG="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --app-output) APP_OUTPUT="${2:-}"; shift 2 ;;
    --output) DMG_OUTPUT="${2:-}"; shift 2 ;;
    --skip-dmg) SKIP_DMG="true"; shift ;;
    *) printf 'Unknown installer package argument: %s\n' "$1" >&2; exit 1 ;;
  esac
done

[ "$(/usr/bin/uname -s)" = "Darwin" ] || { printf 'The installer app can only be built on macOS.\n' >&2; exit 1; }
case "$VERSION" in ''|*[!0-9A-Za-z.-]*) printf 'Invalid VERSION: %s\n' "$VERSION" >&2; exit 1 ;; esac
if [ -n "$APP_OUTPUT" ]; then
  case "$APP_OUTPUT" in /*.app) ;; *) printf '%s\n' '--app-output must be an absolute .app path.' >&2; exit 1 ;; esac
  [ ! -e "$APP_OUTPUT" ] || { printf 'Refusing to overwrite: %s\n' "$APP_OUTPUT" >&2; exit 1; }
  [ -d "$(dirname "$APP_OUTPUT")" ] || { printf 'Output directory does not exist: %s\n' "$(dirname "$APP_OUTPUT")" >&2; exit 1; }
fi
if [ "$SKIP_DMG" = "true" ]; then
  [ -n "$APP_OUTPUT" ] || { printf '%s\n' '--skip-dmg requires --app-output.' >&2; exit 1; }
else
  if [ -z "$DMG_OUTPUT" ]; then
    /bin/mkdir -p "$PROJECT_ROOT/release"
    DMG_OUTPUT="$PROJECT_ROOT/release/Codex-Weixin-Skin-v${VERSION}.dmg"
  fi
  case "$DMG_OUTPUT" in /*.dmg) ;; *) printf '%s\n' '--output must be an absolute .dmg path.' >&2; exit 1 ;; esac
  [ ! -e "$DMG_OUTPUT" ] || { printf 'Refusing to overwrite: %s\n' "$DMG_OUTPUT" >&2; exit 1; }
  [ -d "$(dirname "$DMG_OUTPUT")" ] || { printf 'Output directory does not exist: %s\n' "$(dirname "$DMG_OUTPUT")" >&2; exit 1; }
fi

for required in /usr/bin/xcrun /usr/bin/lipo /usr/bin/codesign /usr/bin/sips /usr/bin/iconutil /usr/bin/rsync /usr/bin/ditto /usr/bin/plutil /usr/bin/hdiutil; do
  [ -x "$required" ] || { printf 'Required build tool is missing: %s\n' "$required" >&2; exit 1; }
done

WORK_ROOT="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/codex-weixin-installer.XXXXXX")"
cleanup() { /bin/rm -rf "$WORK_ROOT"; }
trap cleanup EXIT HUP INT TERM

APP_NAME="Install Codex WeChat Skin.app"
APP_PATH="$WORK_ROOT/$APP_NAME"
CONTENTS="$APP_PATH/Contents"
RESOURCES="$CONTENTS/Resources"
PAYLOAD="$RESOURCES/payload"
/bin/mkdir -p "$CONTENTS/MacOS" "$PAYLOAD"
/bin/cp "$PROJECT_ROOT/installer-app/Info.plist" "$CONTENTS/Info.plist"
/usr/bin/plutil -replace CFBundleShortVersionString -string "$VERSION" "$CONTENTS/Info.plist"
/usr/bin/plutil -replace CFBundleVersion -string "${VERSION//./}" "$CONTENTS/Info.plist"

SDK_PATH="$(/usr/bin/xcrun --sdk macosx --show-sdk-path)"
for architecture in arm64 x86_64; do
  /usr/bin/xcrun swiftc \
    -parse-as-library -O \
    -sdk "$SDK_PATH" \
    -target "${architecture}-apple-macos12.0" \
    -framework AppKit \
    "$PROJECT_ROOT/installer-app/InstallerApp.swift" \
    -o "$WORK_ROOT/installer-${architecture}"
done
/usr/bin/lipo -create \
  "$WORK_ROOT/installer-arm64" "$WORK_ROOT/installer-x86_64" \
  -output "$CONTENTS/MacOS/CodexWeChatSkinInstaller"
/bin/chmod 755 "$CONTENTS/MacOS/CodexWeChatSkinInstaller"

ICONSET="$WORK_ROOT/AppIcon.iconset"
/bin/mkdir -p "$ICONSET"
/usr/bin/sips -s format png "$PROJECT_ROOT/installer-app/AppIcon.svg" --out "$WORK_ROOT/AppIcon-1024.png" >/dev/null
for specification in "16 icon_16x16" "32 icon_16x16@2x" "32 icon_32x32" "64 icon_32x32@2x" \
  "128 icon_128x128" "256 icon_128x128@2x" "256 icon_256x256" "512 icon_256x256@2x" \
  "512 icon_512x512" "1024 icon_512x512@2x"; do
  size="${specification%% *}"
  name="${specification#* }"
  /usr/bin/sips -z "$size" "$size" "$WORK_ROOT/AppIcon-1024.png" --out "$ICONSET/${name}.png" >/dev/null
done
/usr/bin/iconutil -c icns "$ICONSET" -o "$RESOURCES/AppIcon.icns"

for runtime_file in VERSION LICENSE README.md; do
  [ -f "$PROJECT_ROOT/$runtime_file" ] || { printf 'Required runtime file is missing: %s\n' "$runtime_file" >&2; exit 1; }
  /bin/cp "$PROJECT_ROOT/$runtime_file" "$PAYLOAD/$runtime_file"
done
for launcher in "$PROJECT_ROOT"/*.command; do
  [ -f "$launcher" ] || { printf 'No graphical command launchers were found.\n' >&2; exit 1; }
  /bin/cp "$launcher" "$PAYLOAD/$(/usr/bin/basename "$launcher")"
done
for runtime_directory in assets menubar presets; do
  [ -d "$PROJECT_ROOT/$runtime_directory" ] || { printf 'Required runtime directory is missing: %s\n' "$runtime_directory" >&2; exit 1; }
  /bin/mkdir -p "$PAYLOAD/$runtime_directory"
  /usr/bin/rsync -a --exclude '.DS_Store' \
    "$PROJECT_ROOT/$runtime_directory/" "$PAYLOAD/$runtime_directory/"
done
/bin/mkdir -p "$PAYLOAD/scripts"
/usr/bin/rsync -a \
  --exclude 'build-installer-dmg-macos.sh' \
  --exclude 'generate-design-tokens.mjs' \
  "$PROJECT_ROOT/scripts/" "$PAYLOAD/scripts/"
/bin/chmod 700 "$PAYLOAD"/*.command "$PAYLOAD"/scripts/*.sh 2>/dev/null || true
/bin/cp "$PROJECT_ROOT/installer-app/README.txt" "$WORK_ROOT/README.txt"

SIGN_IDENTITY="${WEIXIN_INSTALLER_SIGN_IDENTITY:--}"
if [ "$SIGN_IDENTITY" = "-" ]; then
  printf '%s\n' 'Building an ad-hoc signed community installer; macOS may require Open Anyway on first launch.' >&2
  /usr/bin/codesign --force --deep --timestamp=none --sign - "$APP_PATH"
else
  /usr/bin/codesign --force --deep --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP_PATH"
fi
/usr/bin/codesign --verify --deep --strict "$APP_PATH"

if [ -n "$APP_OUTPUT" ]; then
  /usr/bin/ditto --norsrc "$APP_PATH" "$APP_OUTPUT"
fi

if [ "$SKIP_DMG" = "false" ]; then
  DMG_STAGE="$WORK_ROOT/dmg"
  /bin/mkdir -p "$DMG_STAGE"
  /usr/bin/ditto --norsrc "$APP_PATH" "$DMG_STAGE/$APP_NAME"
  /bin/cp "$PROJECT_ROOT/installer-app/README.txt" "$DMG_STAGE/README.txt"
  /usr/bin/hdiutil create -quiet -fs HFS+ -format UDZO \
    -volname "Codex WeChat Skin ${VERSION}" \
    -srcfolder "$DMG_STAGE" "$DMG_OUTPUT"
  /bin/chmod 644 "$DMG_OUTPUT"
  printf '%s\n' "$DMG_OUTPUT"
fi
if [ -n "$APP_OUTPUT" ]; then printf '%s\n' "$APP_OUTPUT"; fi

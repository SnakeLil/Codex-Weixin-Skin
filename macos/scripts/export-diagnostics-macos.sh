#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

OUTPUT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) OUTPUT="${2:-}"; shift 2 ;;
    *) fail "Unknown diagnostics argument: $1" ;;
  esac
done

discover_codex_app
require_macos_runtime

if [ -z "$OUTPUT" ]; then
  /bin/mkdir -p "$HOME/Desktop"
  OUTPUT="$HOME/Desktop/Codex-WeChat-Skin-Diagnostics-$(/bin/date '+%Y%m%d-%H%M%S').zip"
fi
case "$OUTPUT" in
  /*.zip) ;;
  *) fail "Diagnostic output must be an absolute .zip path." ;;
esac
[ ! -e "$OUTPUT" ] || fail "Refusing to overwrite an existing file: $OUTPUT"
[ -d "$(dirname "$OUTPUT")" ] || fail "Diagnostic output directory does not exist: $(dirname "$OUTPUT")"

WORK_ROOT="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/codex-weixin-diagnostics.XXXXXX")"
/bin/chmod 700 "$WORK_ROOT"
cleanup() { /bin/rm -rf "$WORK_ROOT"; }
trap cleanup EXIT HUP INT TERM

STATUS_FILE="$WORK_ROOT/status.json"
PAYLOAD_FILE="$WORK_ROOT/payload.json"
REPORT_DIR="$WORK_ROOT/Codex-WeChat-Skin-Diagnostics"

# Deliberately do not use --deep: exporting diagnostics must not connect to CDP
# or otherwise interact with the renderer of a running Codex session.
if ! "$SCRIPT_DIR/status-weixin-skin-macos.sh" --anonymous-json > "$STATUS_FILE"; then
  printf '%s\n' '{"session":"unknown","operation":"","port":null,"injectorAlive":false,"codexRunning":false}' > "$STATUS_FILE"
fi

PAYLOAD_THEME_DIR="$THEME_DIR"
[ -f "$PAYLOAD_THEME_DIR/theme.json" ] || PAYLOAD_THEME_DIR="$PROJECT_ROOT/assets"
if ! "$NODE" "$INJECTOR" --check-payload --anonymous-check \
  --theme-dir "$PAYLOAD_THEME_DIR" > "$PAYLOAD_FILE" 2>/dev/null; then
  printf '%s\n' '{"pass":false,"version":"unknown","imageBytes":null,"payloadBytes":null}' > "$PAYLOAD_FILE"
fi

SOURCE_CHECK_PASSED="false"
if WEIXIN_SKIN_SOURCE_NODE="$NODE" "$SCRIPT_DIR/check-source-macos.sh" >/dev/null 2>&1; then
  SOURCE_CHECK_PASSED="true"
fi

MACOS_VERSION="$(/usr/bin/sw_vers -productVersion 2>/dev/null || printf 'unknown')"
ARCHITECTURE="$(/usr/bin/uname -m 2>/dev/null || printf 'unknown')"
CODEX_RUNNING="false"
codex_is_running && CODEX_RUNNING="true"
"$NODE" "$SCRIPT_DIR/diagnostics.mjs" \
  --output-dir "$REPORT_DIR" \
  --status-file "$STATUS_FILE" \
  --payload-file "$PAYLOAD_FILE" \
  --skin-version "$SKIN_VERSION" \
  --codex-version "$CODEX_VERSION" \
  --macos-version "$MACOS_VERSION" \
  --architecture "$ARCHITECTURE" \
  --codex-running "$CODEX_RUNNING" \
  --source-check-passed "$SOURCE_CHECK_PASSED" \
  --contract-file "$SCRIPT_DIR/compatibility-contract.mjs"

/usr/bin/ditto --norsrc -c -k --keepParent "$REPORT_DIR" "$OUTPUT"
/bin/chmod 600 "$OUTPUT"
printf '%s\n' "$OUTPUT"

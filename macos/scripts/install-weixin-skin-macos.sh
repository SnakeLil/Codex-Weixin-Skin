#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9342
CREATE_LAUNCHERS="true"
LAUNCH_AFTER_INSTALL="true"
IN_PLACE="false"
SAFE_LAUNCH="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --no-launchers) CREATE_LAUNCHERS="false"; shift ;;
    --no-launch) LAUNCH_AFTER_INSTALL="false"; shift ;;
    --safe-launch) SAFE_LAUNCH="true"; shift ;;
    --in-place) IN_PLACE="true"; shift ;;
    *) fail "Unknown installer argument: $1" ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) fail "Invalid port: $PORT" ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "Port must be between 1024 and 65535."

discover_codex_app
safe_codex_is_closed() {
  [ "$SAFE_LAUNCH" = "false" ] || ! codex_is_running
}
safe_require_codex_closed() {
  safe_codex_is_closed \
    || fail "Codex opened during graphical installation. It was not injected or restarted; some theme files or settings may already be prepared. Close it and run the installer again."
}
safe_require_codex_closed

deploy_project() {
  local temporary="$INSTALL_ROOT.installing.$$"
  local previous="$INSTALL_ROOT.previous.$$"
  /bin/rm -rf "$temporary"
  /bin/mkdir -p "$temporary"
  /usr/bin/rsync -a \
    --exclude '.git/' \
    --exclude '.DS_Store' \
    --exclude 'release/' \
    --exclude 'runtime/' \
    "$PROJECT_ROOT/" "$temporary/"
  /bin/chmod 700 "$temporary"/*.command "$temporary"/scripts/*.sh 2>/dev/null || true
  if ! safe_codex_is_closed; then
    /bin/rm -rf "$temporary"
    fail "Codex opened while the graphical installer was preparing files. The active theme runtime was not replaced."
  fi
  if [ -e "$INSTALL_ROOT" ]; then /bin/mv "$INSTALL_ROOT" "$previous"; fi
  if ! /bin/mv "$temporary" "$INSTALL_ROOT"; then
    [ -e "$previous" ] && /bin/mv "$previous" "$INSTALL_ROOT"
    fail "Could not install the project at $INSTALL_ROOT"
  fi
  /bin/rm -rf "$previous"
}

if [ "$IN_PLACE" = "false" ] && [ "$PROJECT_ROOT" != "$INSTALL_ROOT" ]; then
  /bin/mkdir -p "$(dirname "$INSTALL_ROOT")"
  deploy_project
  install_args=(--in-place --port "$PORT")
  [ "$CREATE_LAUNCHERS" = "true" ] || install_args+=(--no-launchers)
  [ "$LAUNCH_AFTER_INSTALL" = "true" ] || install_args+=(--no-launch)
  [ "$SAFE_LAUNCH" = "false" ] || install_args+=(--safe-launch)
  exec "$INSTALL_ROOT/scripts/install-weixin-skin-macos.sh" "${install_args[@]}"
fi

discover_codex_app
require_macos_runtime
ensure_state_root
safe_require_codex_closed
codex_is_running && fail "Close Codex before installation so config.toml cannot be rewritten while the app is saving it."
safe_require_codex_closed
seed_bundled_presets
if [ ! -f "$THEME_DIR/theme.json" ]; then
  safe_require_codex_closed
  "$SCRIPT_DIR/switch-theme-macos.sh" --id preset-wechat-light --no-apply >/dev/null
fi
[ -f "$CONFIG_PATH" ] || fail "Codex config not found: $CONFIG_PATH. Launch Codex once, close it, and rerun the installer."
"$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null
safe_require_codex_closed
"$NODE" "$SCRIPT_DIR/theme-config.mjs" install "$CONFIG_PATH" "$THEME_BACKUP_PATH"

shell_quote() {
  "$NODE" -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

write_launcher() {
  local target="$1"
  local command="$2"
  safe_require_codex_closed
  if [ -e "$target" ] && ! /usr/bin/grep -q '^# CodexWeixinSkinStudio launcher$' "$target" 2>/dev/null; then
    fail "Refusing to overwrite an unrelated Desktop file: $target"
  fi
  /usr/bin/printf '%s\n' \
    '#!/bin/bash' \
    '# CodexWeixinSkinStudio launcher' \
    'set -e' \
    "$command" > "$target"
  /bin/chmod 700 "$target"
}

if [ "$CREATE_LAUNCHERS" = "true" ]; then
  /bin/mkdir -p "$HOME/Desktop"
  start_script="$(shell_quote "$SCRIPT_DIR/start-weixin-skin-macos.sh")"
  customize_script="$(shell_quote "$SCRIPT_DIR/customize-theme-macos.sh")"
  diagnostics_script="$(shell_quote "$SCRIPT_DIR/export-diagnostics-macos.sh")"
  verify_script="$(shell_quote "$SCRIPT_DIR/verify-weixin-skin-macos.sh")"
  restore_script="$(shell_quote "$SCRIPT_DIR/restore-weixin-skin-macos.sh")"
  screenshot="$(shell_quote "$HOME/Desktop/Codex WeChat Skin Verification.png")"
  write_launcher "$HOME/Desktop/Codex WeChat Skin.command" "exec $start_script --port $PORT --prompt-restart"
  write_launcher "$HOME/Desktop/Codex WeChat Skin - Customize.command" "exec $customize_script"
  write_launcher "$HOME/Desktop/Codex WeChat Skin - Diagnostics.command" "output=\$($diagnostics_script) && /usr/bin/open -R \"\$output\""
  write_launcher "$HOME/Desktop/Codex WeChat Skin - Verify.command" "$verify_script --screenshot $screenshot && /usr/bin/open $screenshot"
  write_launcher "$HOME/Desktop/Codex WeChat Skin - Restore.command" "exec $restore_script --restore-base-theme --restart-codex"
fi

printf 'Codex WeChat Skin Studio %s installed at %s for Codex %s using its signed Node.js %s.\n' \
  "$SKIN_VERSION" "$PROJECT_ROOT" "$CODEX_VERSION" "$NODE_VERSION"
printf 'Use the Desktop launchers to customize, diagnose, start, verify, or restore the official appearance.\n'
printf 'Bundled presets are ready in your theme library — pick one from the menu bar (已保存的主题) or switch-theme.\n'

if [ "$LAUNCH_AFTER_INSTALL" = "true" ]; then
  safe_require_codex_closed
  launch_args=(--port "$PORT")
  if [ "$SAFE_LAUNCH" = "true" ]; then
    launch_args+=(--refuse-running)
  else
    launch_args+=(--prompt-restart)
  fi
  "$SCRIPT_DIR/start-weixin-skin-macos.sh" "${launch_args[@]}"
fi

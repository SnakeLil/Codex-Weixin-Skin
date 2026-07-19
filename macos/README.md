# Codex WeChat Skin Studio (macOS)

Unofficial macOS theme engine for the **official Codex Desktop** app that restyles Codex into a **WeChat (微信)** chat interface.

It injects through **local‑loopback CDP**. It does **not** modify the official `.app`, `app.asar`, or code signature. Only appearance keys in `~/.codex/config.toml` are touched (backed up first), plus this project’s own state directory.

> Not affiliated with OpenAI. Codex and WeChat are trademarks of their respective owners.

## Requirements

- macOS
- Official Codex Desktop installed and launched at least once (`~/.codex/config.toml` exists)
- No global Node.js required (uses Codex’s signed bundled Node after validation)

## Quick start

```bash
# Install to the stable path + create Desktop launchers (no auto‑launch)
./scripts/install-weixin-skin-macos.sh --no-launch

# Switch bundled theme
~/.codex/codex-weixin-skin-studio/scripts/switch-theme-macos.sh --id preset-wechat-light

# Start / verify / restore via Desktop:
#   Codex WeChat Skin.command
#   Codex WeChat Skin - Customize.command
#   Codex WeChat Skin - Verify.command
#   Codex WeChat Skin - Restore.command

# Optional menu bar (SwiftBar)
./Install\ Menu\ Bar.command
```

## Layout

| Path | Purpose |
| --- | --- |
| `assets/weixin-skin.css` | The WeChat stylesheet (flat panels, green/white bubbles, light/dark tokens) |
| `assets/renderer-inject.js` | Self‑contained payload injected into the renderer |
| `assets/theme.json` | Default theme tokens (WeChat green palette) |
| `assets/portal-hero.png` | Default flat chat background |
| `scripts/injector.mjs` | CDP engine: build payload, inject, verify, remove |
| `scripts/common-macos.sh` | Shared paths, Codex discovery, launchd, safety checks |
| `scripts/*-weixin-skin-macos.sh` | install / start / restore / verify / status / pause |
| `scripts/switch-theme-macos.sh` · `customize-theme-macos.sh` · `load-image-theme-macos.sh` | theme library + wallpaper import |
| `presets/preset-wechat-*` | 微信 · 浅色 / 深色 |
| `menubar/codex_weixin_skin.10s.sh` | SwiftBar plugin |

## Design tokens

Accent (WeChat green) `#07C160` · sent bubble `#95EC69` (light) / `#3EB575` (dark) · panels `#FFFFFF` / `#2C2C2C` · chat backdrop `#EDEDED` / `#191919`. The injector rewrites the accent tokens from `theme.json`; neutral surfaces and bubble colours are owned by `weixin-skin.css` and keyed on `data-weixin-shell` so light/dark render independently.

## Restore

```bash
~/.codex/codex-weixin-skin-studio/scripts/restore-weixin-skin-macos.sh --restore-base-theme --restart-codex
```

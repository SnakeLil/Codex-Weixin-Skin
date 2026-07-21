# Codex WeChat Skin · Codex 微信主题

Bring a desktop-WeChat-inspired experience to the official Codex app for macOS: WeChat green, a three-column shell, chat bubbles, conversation previews, real user avatars, and consistent styling for search, settings, and feature pages.

[![Release](https://img.shields.io/github/v/release/SnakeLil/Codex-Weixin-Skin?display_name=tag&style=flat-square&color=07c160)](https://github.com/SnakeLil/Codex-Weixin-Skin/releases/latest)
[![macOS](https://img.shields.io/badge/macOS-12%2B-111111?style=flat-square&logo=apple)](#compatibility)
[![License](https://img.shields.io/github/license/SnakeLil/Codex-Weixin-Skin?style=flat-square&color=07c160)](./LICENSE)

English · [简体中文](./README.md)

[**Download the latest release**](https://github.com/SnakeLil/Codex-Weixin-Skin/releases/latest/download/Codex-Weixin-Skin-v1.0.0.zip) · [CodeDrobe Lite store edition](https://codedrobe.app/en/themes/codex-wechat-skin-lite) · [Install guide](#graphical-install-recommended) · [Report an issue](https://github.com/SnakeLil/Codex-Weixin-Skin/issues/new/choose)

![Codex WeChat Skin feature demo](./docs/demo/codex-weixin-skin-demo.gif)

> [!IMPORTANT]
> This is an unofficial theme and is not affiliated with OpenAI, Tencent, or WeChat. Codex and WeChat are trademarks of their respective owners.

## Highlights

- **WeChat-style three-column shell** with a 60px app rail, project/conversation list, and main content area.
- **Chat bubbles** with green sent messages, white received messages, and familiar bubble tails.
- **Real avatars** for the current Codex user in the rail and outgoing chat messages.
- **Complete page coverage** for chat, global search, settings, Sites, Scheduled Tasks, and Plugins.
- **WeChat interaction details** including selection states, unread dots, search fields, buttons, switches, and hairline separators.
- **Light and dark presets** bundled as `微信 · 浅色` and `微信 · 深色`.
- **Custom wallpaper support** for your own chat background and colour preferences.
- **Fully reversible** without modifying the Codex app bundle or its signature.

## Gallery

![Codex WeChat Skin chat view](./docs/screenshots/chat.png)

| Search | Settings |
| --- | --- |
| ![Themed search](./docs/screenshots/search.png) | ![Themed settings](./docs/screenshots/settings.png) |

| Sites | Scheduled Tasks |
| --- | --- |
| ![Themed Sites page](./docs/screenshots/sites.png) | ![Themed Scheduled Tasks page](./docs/screenshots/scheduled.png) |

| Plugins |
| --- |
| ![Themed Plugins page](./docs/screenshots/plugins.png) |

## CodeDrobe Lite store edition

[Codex WeChat Skin Lite](https://codedrobe.app/en/themes/codex-wechat-skin-lite) is a CSS-only edition for CodeDrobe Desktop that can be applied and restored directly from the store. It retains the WeChat-green palette, chat bubbles, search, settings, and feature-page styling without executable scripts.

Choose Lite for a quick, low-friction preview. The full edition in this repository continues to provide the WeChat-style three-column shell, real user avatars, unread dots, light/dark presets, and custom wallpaper support. Its store-edition source lives in [`integrations/codedrobe/codex-wechat-skin-lite`](./integrations/codedrobe/codex-wechat-skin-lite).

## Requirements

- macOS
- The official Codex desktop app installed (the application name may currently appear as ChatGPT)
- Codex launched normally at least once
- No separate Node.js installation required

Only macOS is supported at this time. A Codex UI update may require corresponding selector updates in the theme.

## Compatibility

| Item | Status |
| --- | --- |
| macOS | 12.0 or later, following the current official Codex app requirement |
| Apple Silicon | Supported; v1.0.0 was verified on Apple Silicon with macOS 15.5 |
| Intel Mac | The installer includes architecture checks; real-device reports are welcome |
| Codex Desktop | v1.0.0 was verified with `26.715.31925`; please report regressions after app updates |
| Windows / Linux | Not supported yet |

“Verified” describes the environment used for live UI testing; it is not an exclusive version requirement.

## Install and use

### Graphical install (recommended)

1. Download `Codex-Weixin-Skin-v1.0.0.zip` from the latest [Release](https://github.com/SnakeLil/Codex-Weixin-Skin/releases/latest) and extract it. Developers can also clone the repository:

   ```bash
   git clone https://github.com/SnakeLil/Codex-Weixin-Skin.git
   ```

2. Launch Codex once, then **fully quit Codex**.
3. Open the repository's `macos` folder.
4. Right-click **Install Codex Weixin Skin.command** and choose **Open**.
5. The installer copies the theme to a stable location, creates Desktop launchers, and starts Codex with the theme.

If macOS blocks the launcher, use **System Settings → Privacy & Security → Open Anyway**, or right-click the file and choose **Open** again.

### Starting Codex later

The installer creates these Desktop launchers:

| Launcher | Purpose |
| --- | --- |
| **Codex WeChat Skin.command** | Start or re-apply the WeChat skin |
| **Codex WeChat Skin - Customize.command** | Switch presets, edit colours, or load a chat wallpaper |
| **Codex WeChat Skin - Verify.command** | Verify the live skin and capture a screenshot |
| **Codex WeChat Skin - Restore.command** | Remove the skin and restore the official appearance |

> [!TIP]
> If Codex returns to its default appearance after a restart, quit it and use the Desktop **Codex WeChat Skin.command** launcher. The skin depends on a loopback-only debugging connection that a normal Codex launch does not expose.

### Command-line install

```bash
cd Codex-Weixin-Skin/macos

# Install to ~/.codex/codex-weixin-skin-studio without launching
./scripts/install-weixin-skin-macos.sh --no-launch

# Start / re-apply the theme
~/.codex/codex-weixin-skin-studio/scripts/start-weixin-skin-macos.sh --prompt-restart
```

## Presets and customization

```bash
# WeChat Light (default)
~/.codex/codex-weixin-skin-studio/scripts/switch-theme-macos.sh \
  --id preset-wechat-light

# WeChat Dark
~/.codex/codex-weixin-skin-studio/scripts/switch-theme-macos.sh \
  --id preset-wechat-dark
```

You can also double-click **Customize Codex Weixin Skin.command** to choose a preset, change theme colours, or load your own background image.

Optionally install [SwiftBar](https://swiftbar.app/) and double-click **Install Menu Bar.command** for quick menu-bar controls to apply, pause, verify, or restore the skin.

## How it works and its security boundary

- Does not modify the official `.app`, `app.asar`, or code signature.
- Opens CDP (Chrome DevTools Protocol) only on `127.0.0.1` when starting Codex.
- Uses Codex's signed bundled Node.js runtime after validating it; no global Node environment is required.
- Injects self-contained CSS and renderer logic over local CDP and observes UI changes to keep the skin applied.
- Backs up `~/.codex/config.toml` before managing appearance-related settings.
- Keeps theme state under `~/Library/Application Support/CodexWeixinSkinStudio/`.
- Never binds the debugging endpoint to a LAN or public network address.

## Verify the skin

```bash
~/.codex/codex-weixin-skin-studio/scripts/verify-weixin-skin-macos.sh \
  --screenshot "$HOME/Desktop/Codex-WeChat-Skin.png"
```

Verification checks the active theme ID, payload revision, page layout, and horizontal overflow, then captures the current interface.

## Restore / uninstall

Double-click **Codex WeChat Skin - Restore.command**, or run:

```bash
~/.codex/codex-weixin-skin-studio/scripts/restore-weixin-skin-macos.sh \
  --restore-base-theme --restart-codex
```

This removes the runtime theme, restores the backed-up appearance settings, and removes Desktop launchers created by the theme.

## Troubleshooting

### The theme disappears after restarting Codex

Codex was started normally without the local theme debugging connection. Quit Codex and launch it with the Desktop **Codex WeChat Skin.command** shortcut.

### The installer does not open

Right-click the `.command` file and choose **Open**. If it is still blocked, allow it under **System Settings → Privacy & Security**.

### The installer says Codex is running

Fully quit Codex before the first installation so the app cannot overwrite its configuration while closing.

### A Codex update breaks the layout

Run the installer again to refresh the installed theme files. If the issue remains, open an Issue with the Codex version, reproduction steps, and a redacted screenshot.

## Project structure

```text
Codex-Weixin-Skin/
├── README.md / README.en.md
├── LICENSE
├── docs/screenshots/              # Screenshots of the live theme
└── macos/
    ├── assets/                    # CSS, renderer payload, and default assets
    ├── presets/                   # WeChat light / dark presets
    ├── scripts/                   # Install, start, inject, verify, and restore tools
    ├── menubar/                   # Optional SwiftBar plugin
    └── *.command                  # Double-click launchers
```

## Contributing

Issues and pull requests are welcome. UI bug reports are most useful when they include:

- Codex and macOS versions
- The affected page and exact reproduction steps
- A screenshot with sensitive content redacted
- Output from **Verify Codex Weixin Skin.command**

## Credits

The installation and local-CDP approach was inspired by [Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin). This project re-designs and implements the WeChat layout, styling, and interaction adaptations.

## License and disclaimer

Released under the [MIT License](./LICENSE).

This project is intended only for local interface personalization. Users are responsible for risks arising from Codex version changes, third-party application terms, and runtime debugging interfaces.

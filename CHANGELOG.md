# Changelog

All notable changes to Codex WeChat Skin are documented in this file.

## [1.1.0] - 2026-08-30

### Added

- A one-click universal macOS installer app, ad-hoc signed and distributed in a DMG.
- Privacy-safe diagnostics that exclude chats, account data, screenshots, raw
  logs, custom theme names, and local paths.
- Sanitized compatibility regression coverage for conversation, search,
  settings, Sites, Scheduled Tasks, Plugins, and pinned summary layouts.
- A read-only installed-app source audit tied to the validated ChatGPT/Codex
  version, build number, and `app.asar` digest.
- Shared canonical WeChat design tokens for the Full and CodeDrobe Lite editions.
- The CSS-only CodeDrobe Lite store edition.

### Changed

- Refined the WeChat-style navigation rail, real user avatars, outgoing message
  avatars, unread project dots, compact titlebar spacing, chat gutters, global
  search, settings, utility pages, and pinned summary layout.
- Updated compatibility validation to ChatGPT/Codex `26.820.60940` (build `7119`)
  on Apple Silicon with macOS 15.5.
- Release automation now tests the complete payload and publishes DMG, ZIP, and
  SHA-256 checksum assets.

### Safety

- The installer fails closed when Codex is running. It never force-quits a live
  session or modifies the signed ChatGPT/Codex application bundle.

## [1.0.0] - 2026-07-20

- Initial public release of the Codex WeChat Skin for macOS.

[1.1.0]: https://github.com/SnakeLil/Codex-Weixin-Skin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/SnakeLil/Codex-Weixin-Skin/releases/tag/v1.0.0

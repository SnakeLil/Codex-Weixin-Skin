# Codex WeChat Skin Lite for CodeDrobe

This directory contains the CSS-only CodeDrobe Store edition of
[Codex-Weixin-Skin](https://github.com/SnakeLil/Codex-Weixin-Skin).

## Why it lives in this repository

The Lite and full editions share the same visual system, screenshots, release
notes, and compatibility work. Keeping the CodeDrobe source beside the full
theme prevents the two editions from drifting while still producing a portable
`.codedrobe-theme` package.

## Lite versus full edition

The store package follows CodeDrobe's safety model and contains styles and an
image only—no executable scripts.

- **Lite:** WeChat colors and surfaces, chat bubbles, sidebar, composer, search,
  settings controls, dialogs, home, and utility-page styling.
- **Full:** Adds the injected WeChat navigation rail, authenticated profile
  avatar, project-level unread badges, route-aware shortcuts, and deeper runtime
  repair/verification.

## Build and verify

```bash
npx -y @codedrobe/core@0.6.1 theme pack theme.json \
  --output /tmp/codex-wechat-skin-lite.codedrobe-theme

npx -y @codedrobe/core@0.6.1 theme inspect \
  /tmp/codex-wechat-skin-lite.codedrobe-theme
```

Apply and verify against a Codex instance launched with a local debugging port:

```bash
npx -y @codedrobe/core@0.6.1 apply \
  --app codex \
  --theme /tmp/codex-wechat-skin-lite.codedrobe-theme

npx -y @codedrobe/core@0.6.1 verify \
  --app codex \
  --theme /tmp/codex-wechat-skin-lite.codedrobe-theme
```

Codex, ChatGPT, WeChat, OpenAI, and Tencent are trademarks of their respective
owners. This community theme is unofficial and is not affiliated with or
endorsed by OpenAI or Tencent.

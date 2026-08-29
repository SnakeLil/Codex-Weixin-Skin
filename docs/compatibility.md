# Compatibility evidence

The latest validated build is recorded in
[`macos/compatibility/validated-builds.json`](../macos/compatibility/validated-builds.json).

For ChatGPT/Codex `26.820.60940` (build `7119`), release validation combines three
independent signals:

1. The user confirmed the already-running themed UI was working. No automated
   process connected to or restarted that app.
2. A read-only scan of the signed app's `app.asar` confirmed that every native
   DOM anchor required by the theme remains present. The evidence is bound to
   the source archive's SHA-256 digest.
3. Seven sanitized DOM snapshots were rendered with the real Full and Lite CSS
   in an isolated headless browser. The suite covers conversation, search,
   settings, Sites, Scheduled Tasks, Plugins, and pinned summary layouts.

Run the isolated regression suite:

```bash
WEIXIN_SKIN_TEST_BROWSER=system npm test --prefix macos
```

Audit an installed app without launching, stopping, or connecting to it:

```bash
npm run verify:installed-source --prefix macos -- \
  --expected-version 26.820.60940 \
  --expected-build 7119 \
  --expected-sha256 c964aebbf9a6a0f70799d01215c611d8ef6ee63f816b3d57beccddd47a811fd9
```

The source audit reads only `Info.plist` and `Contents/Resources/app.asar`. It
does not read account or conversation data, launch the desktop app, or access a
Chrome DevTools Protocol endpoint. A source scan and sanitized snapshots reduce
regression risk, but they do not replace real-device testing for every macOS and
hardware combination.

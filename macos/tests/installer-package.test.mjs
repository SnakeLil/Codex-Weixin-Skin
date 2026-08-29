import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120_000, ...options });
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

test("one-click installer builds as a signed universal app without launching it", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "weixin-installer-test-"));
  const app = path.join(temporary, "Install Codex WeChat Skin.app");
  try {
    run("/bin/bash", [
      path.join(macosRoot, "scripts", "build-installer-dmg-macos.sh"),
      "--app-output", app,
      "--skip-dmg",
    ]);
    const contents = path.join(app, "Contents");
    const executable = path.join(contents, "MacOS", "CodexWeChatSkinInstaller");
    const payload = path.join(contents, "Resources", "payload");
    run("/usr/bin/plutil", ["-lint", path.join(contents, "Info.plist")]);
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
    const architectures = run("/usr/bin/lipo", ["-archs", executable]).split(/\s+/).sort();
    assert.deepEqual(architectures, ["arm64", "x86_64"]);
    assert.equal(await fs.stat(path.join(contents, "Resources", "AppIcon.icns")).then((stat) => stat.size > 1000), true);
    const requiredRuntimeFiles = [
      "VERSION",
      "LICENSE",
      "README.md",
      "Install Codex Weixin Skin.command",
      "Install Menu Bar.command",
      "Customize Codex Weixin Skin.command",
      "Export Diagnostics.command",
      "Restore Codex Weixin Skin.command",
      "Start Codex Weixin Skin.command",
      "Verify Codex Weixin Skin.command",
      "assets/theme.json",
      "assets/weixin-skin.css",
      "assets/renderer-inject.js",
      "assets/route-state.mjs",
      "menubar/codex_weixin_skin.10s.sh",
      "presets/preset-wechat-light/theme.json",
      "presets/preset-wechat-light/background.png",
      "presets/preset-wechat-dark/theme.json",
      "presets/preset-wechat-dark/background.png",
      "scripts/common-macos.sh",
      "scripts/install-weixin-skin-macos.sh",
      "scripts/start-weixin-skin-macos.sh",
      "scripts/switch-theme-macos.sh",
      "scripts/theme-config.mjs",
      "scripts/injector.mjs",
    ];
    for (const relative of requiredRuntimeFiles) {
      assert.equal(
        await fs.stat(path.join(payload, relative)).then((stat) => stat.isFile()),
        true,
        `missing runtime payload file: ${relative}`,
      );
    }
    const runtimeEntries = await fs.readdir(path.join(payload, "scripts"));
    for (const entry of runtimeEntries) {
      const script = path.join(payload, "scripts", entry);
      if (entry.endsWith(".sh")) {
        assert.notEqual((await fs.stat(script)).mode & 0o111, 0, `shell runtime is not executable: ${entry}`);
        run("/bin/bash", ["-n", script]);
      } else if (entry.endsWith(".mjs")) {
        run(process.execPath, ["--check", script]);
      }
    }
    for (const entry of await fs.readdir(payload)) {
      if (!entry.endsWith(".command")) continue;
      const launcher = path.join(payload, entry);
      assert.notEqual((await fs.stat(launcher)).mode & 0o111, 0, `launcher is not executable: ${entry}`);
      run("/bin/bash", ["-n", launcher]);
    }
    await assert.rejects(() => fs.access(path.join(payload, "node_modules")));
    await assert.rejects(() => fs.access(path.join(payload, "design")));
    await assert.rejects(() => fs.access(path.join(payload, "tests")));
    await assert.rejects(() => fs.access(path.join(payload, "installer-app")));
    await assert.rejects(() => fs.access(path.join(payload, "package.json")));
    await assert.rejects(() => fs.access(path.join(payload, "scripts", "build-installer-dmg-macos.sh")));
    await assert.rejects(() => fs.access(path.join(payload, "scripts", "generate-design-tokens.mjs")));
    const check = run(process.execPath, [
      path.join(payload, "scripts", "injector.mjs"),
      "--check-payload", "--anonymous-check", "--theme-dir", path.join(payload, "assets"),
    ]);
    assert.equal(JSON.parse(check).pass, true);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("release version is consistent across every distributable surface", async () => {
  const version = (await fs.readFile(path.join(macosRoot, "VERSION"), "utf8")).trim();
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const packageJson = JSON.parse(await fs.readFile(path.join(macosRoot, "package.json"), "utf8"));
  const packageLock = JSON.parse(await fs.readFile(path.join(macosRoot, "package-lock.json"), "utf8"));
  const lite = JSON.parse(await fs.readFile(
    path.resolve(macosRoot, "..", "integrations", "codedrobe", "codex-wechat-skin-lite", "theme.json"),
    "utf8",
  ));
  const evidence = JSON.parse(await fs.readFile(
    path.join(macosRoot, "compatibility", "validated-builds.json"),
    "utf8",
  ));
  const infoVersion = run("/usr/bin/plutil", [
    "-extract", "CFBundleShortVersionString", "raw", "-o", "-",
    path.join(macosRoot, "installer-app", "Info.plist"),
  ]);
  const infoBuild = run("/usr/bin/plutil", [
    "-extract", "CFBundleVersion", "raw", "-o", "-",
    path.join(macosRoot, "installer-app", "Info.plist"),
  ]);
  const common = await fs.readFile(path.join(macosRoot, "scripts", "common-macos.sh"), "utf8");
  const injector = await fs.readFile(path.join(macosRoot, "scripts", "injector.mjs"), "utf8");
  assert.deepEqual({
    package: packageJson.version,
    lock: packageLock.version,
    lockRoot: packageLock.packages[""].version,
    installerApp: infoVersion,
    installerBuild: infoBuild,
    runtimeShell: common.match(/^SKIN_VERSION="([^"]+)"/m)?.[1],
    runtimeInjector: injector.match(/^const SKIN_VERSION = "([^"]+)";/m)?.[1],
    lite: lite.version,
    compatibilityEvidence: evidence.latest.themeVersion,
  }, {
    package: version,
    lock: version,
    lockRoot: version,
    installerApp: version,
    installerBuild: version.replaceAll(".", ""),
    runtimeShell: version,
    runtimeInjector: version,
    lite: version,
    compatibilityEvidence: version,
  });
});

test("tag releases validate, test, verify, and checksum both distribution formats", async () => {
  const workflow = await fs.readFile(path.resolve(macosRoot, "..", ".github", "workflows", "release.yml"), "utf8");
  assert.match(workflow, /test "\$version" = "\$\(tr -d '\[:space:\]' < macos\/VERSION\)"/);
  assert.match(workflow, /working-directory: macos\n\s+run: npm test/);
  assert.match(workflow, /build-installer-dmg-macos\.sh/);
  assert.match(workflow, /hdiutil verify/);
  assert.match(workflow, /Codex-Weixin-Skin-v\$\{version\}\.zip/);
  assert.match(workflow, /cp README\.md README\.en\.md CHANGELOG\.md LICENSE/);
  assert.match(workflow, /shasum -a 256/);
  assert.match(workflow, /softprops\/action-gh-release@v2/);
});

test("installer source protects running Codex sessions instead of terminating them", async () => {
  const source = await fs.readFile(path.join(macosRoot, "installer-app", "InstallerApp.swift"), "utf8");
  const installer = await fs.readFile(path.join(macosRoot, "scripts", "install-weixin-skin-macos.sh"), "utf8");
  const starter = await fs.readFile(path.join(macosRoot, "scripts", "start-weixin-skin-macos.sh"), "utf8");
  const common = await fs.readFile(path.join(macosRoot, "scripts", "common-macos.sh"), "utf8");
  assert.match(source, /runningApplications\(withBundleIdentifier: "com\.openai\.codex"\)/);
  assert.match(source, /安装器不会替你退出 Codex/);
  assert.match(source, /process\.arguments = \[installer\.path, "--safe-launch"\]/);
  assert.match(source, /applicationShouldTerminate\(_ sender: NSApplication\)/);
  assert.match(source, /windowShouldClose\(_ sender: NSWindow\)/);
  assert.match(installer, /--safe-launch\) SAFE_LAUNCH="true"/);
  assert.match(installer, /\[ "\$SAFE_LAUNCH" = "false" \] \|\| install_args\+=\(--safe-launch\)/);
  assert.match(installer, /launch_args\+=\(--refuse-running\)/);
  assert.match(installer, /safe_require_codex_closed/);
  const firstInstallRefusal = installer.indexOf("safe_require_codex_closed\n\ndeploy_project()");
  assert.notEqual(firstInstallRefusal, -1);
  assert.equal(firstInstallRefusal < installer.indexOf("  deploy_project\n"), true);
  const deployBody = installer.slice(installer.indexOf("deploy_project()"), installer.indexOf("\n}\n\nif [ \"$IN_PLACE\""));
  assert.equal(deployBody.indexOf("if ! safe_codex_is_closed") < deployBody.indexOf('if [ -e "$INSTALL_ROOT" ]'), true);
  assert.match(starter, /--refuse-running\) REFUSE_RUNNING="true"/);
  assert.match(starter, /launch_codex_with_cdp "\$PORT" "\$REFUSE_RUNNING"/);
  assert.match(common, /\[ "\$refuse_running" = "true" \] && codex_is_running/);
  const firstRefusal = starter.indexOf("refuse_running_codex || fail");
  assert.notEqual(firstRefusal, -1);
  assert.equal(firstRefusal < starter.indexOf("write_operation_state applying"), true);
  assert.equal(firstRefusal < starter.indexOf("verified_cdp_endpoint"), true);
  for (const forbidden of [".terminate()", ".forceTerminate()", "/bin/kill", "killall", "pkill"]) {
    assert.equal(source.includes(forbidden), false, `installer contains forbidden termination path: ${forbidden}`);
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildDiagnosticReport,
  sanitizePayloadCheck,
  sanitizeStatus,
} from "../scripts/diagnostics.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.join(here, "..");

test("runtime status is allowlisted and drops user-controlled fields", () => {
  const status = sanitizeStatus({
    session: "active",
    operation: "success",
    port: 9342,
    injectorAlive: true,
    cdpOk: true,
    codexRunning: true,
    operationMessage: "private conversation title",
    themeName: "Client Alpha",
    appliedThemeName: "Client Alpha",
    nodePath: "/Users/private/bin/node",
    arbitrary: "secret",
  });
  assert.deepEqual(status, {
    session: "active",
    operation: "success",
    loopbackPort: 9342,
    injectorAlive: true,
    codexRunning: true,
  });
  assert.equal(JSON.stringify(status).includes("private"), false);
  assert.equal(JSON.stringify(status).includes("Client Alpha"), false);
});

test("invalid runtime values fail closed", () => {
  assert.deepEqual(sanitizeStatus({
    session: "a custom session",
    operation: "running arbitrary command",
    port: 1,
    injectorAlive: "true",
    codexRunning: 1,
  }), {
    session: "unknown",
    operation: "",
    loopbackPort: null,
    injectorAlive: false,
    codexRunning: false,
  });
});

test("payload diagnostics omit custom theme identity and timing data", () => {
  const payload = sanitizePayloadCheck({
    pass: true,
    version: "1.1.0",
    themeId: "customer-secret",
    themeName: "Secret Project",
    imageBytes: 4189,
    payloadBytes: 94689,
    timings: { buildMs: 3.1 },
  });
  assert.deepEqual(payload, {
    passed: true,
    skinVersion: "1.1.0",
    imageBytes: 4189,
    payloadBytes: 94689,
  });
});

test("generated report contains only anonymous, bounded diagnostics", () => {
  const report = buildDiagnosticReport({
    generatedAt: "2026-08-28T00:00:00.000Z",
    skinVersion: "1.1.0",
    codexVersion: "26.820.60940",
    macosVersion: "15.5",
    architecture: "arm64",
    status: {
      session: "active",
      operation: "",
      port: 9342,
      injectorAlive: true,
      codexRunning: true,
      themeName: "Top Secret",
      accountEmail: "person@example.com",
    },
    payload: {
      pass: true,
      version: "1.1.0",
      imageBytes: 1,
      payloadBytes: 2,
      themeName: "Top Secret",
    },
    sourceCheckPassed: true,
    compatibilityContractVersion: 1,
    compatibilityContexts: ["shell", "conversation", "bad/private", "search"],
  });
  const serialized = JSON.stringify(report);
  for (const forbidden of ["Top Secret", "person@example.com", "/Users/", "bad/private"]) {
    assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`);
  }
  assert.equal(report.overallPass, true);
  assert.deepEqual(report.compatibility.coveredContexts, ["shell", "conversation", "search"]);
  assert.deepEqual(report.privacy, {
    allowlistOnly: true,
    chatContentCollected: false,
    screenshotsCollected: false,
    rawLogsCollected: false,
    accountDataCollected: false,
    customThemeNamesCollected: false,
    localPathsCollected: false,
    debuggerConnected: false,
  });
});

test("generated timestamps and compatibility context names fail closed", () => {
  const report = buildDiagnosticReport({
    generatedAt: "person@example.com /Users/private",
    skinVersion: "private/path",
    codexVersion: "26.820.60940",
    macosVersion: "15.5",
    architecture: "arm64",
    status: {},
    payload: {},
    sourceCheckPassed: false,
    compatibilityContexts: ["settings", "project/private"],
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("person@example.com"), false);
  assert.equal(serialized.includes("/Users/"), false);
  assert.equal(report.environment.skinVersion, "unknown");
  assert.deepEqual(report.compatibility.coveredContexts, ["settings"]);
});

test("anonymous status output never stages user-controlled identity fields", async () => {
  const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), "weixin-status-test-"));
  try {
    const stateRoot = path.join(fakeHome, "Library", "Application Support", "CodexWeixinSkinStudio");
    await fs.mkdir(path.join(stateRoot, "theme"), { recursive: true });
    await fs.writeFile(path.join(stateRoot, "state.json"), JSON.stringify({
      session: "paused",
      port: "person@example.com /Users/private",
      appliedThemeName: "Private Customer Theme",
    }));
    await fs.writeFile(path.join(stateRoot, "theme", "theme.json"), JSON.stringify({
      id: "private-project",
      name: "Private Customer Theme",
    }));
    const result = spawnSync("/bin/bash", [
      path.join(macosRoot, "scripts", "status-weixin-skin-macos.sh"),
      "--anonymous-json",
    ], {
      encoding: "utf8",
      env: { HOME: fakeHome, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    });
    assert.equal(result.status, 0, result.stderr);
    const status = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(status).sort(), [
      "codexRunning", "injectorAlive", "operation", "port", "session",
    ]);
    assert.equal(status.port, null);
    assert.equal(result.stdout.includes("Private Customer Theme"), false);
    assert.equal(result.stdout.includes("private-project"), false);
    assert.equal(result.stdout.includes("person@example.com"), false);
    assert.equal(result.stdout.includes("/Users/private"), false);

    await fs.writeFile(path.join(stateRoot, "state.json"), JSON.stringify({
      session: "paused",
      port: "009342",
    }));
    const leadingZeroResult = spawnSync("/bin/bash", [
      path.join(macosRoot, "scripts", "status-weixin-skin-macos.sh"),
      "--anonymous-json",
    ], {
      encoding: "utf8",
      env: { HOME: fakeHome, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    });
    assert.equal(leadingZeroResult.status, 0, leadingZeroResult.stderr);
    assert.equal(JSON.parse(leadingZeroResult.stdout).port, 9342);
  } finally {
    await fs.rm(fakeHome, { recursive: true, force: true });
  }
});

test("anonymous payload check emits only diagnostic allowlist fields", () => {
  const result = spawnSync(process.execPath, [
    path.join(macosRoot, "scripts", "injector.mjs"),
    "--check-payload",
    "--anonymous-check",
    "--theme-dir",
    path.join(macosRoot, "assets"),
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Object.keys(JSON.parse(result.stdout)).sort(), [
    "imageBytes", "pass", "payloadBytes", "version",
  ]);
  assert.equal(result.stdout.includes("themeName"), false);
  assert.equal(result.stdout.includes("themeId"), false);
});

test("source check accepts the validated bundled Node with a minimal PATH", () => {
  const result = spawnSync("/bin/bash", [
    path.join(macosRoot, "scripts", "check-source-macos.sh"),
  ], {
    encoding: "utf8",
    env: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      WEIXIN_SKIN_SOURCE_NODE: process.execPath,
    },
  });
  assert.equal(result.status, 0, result.stderr);
});

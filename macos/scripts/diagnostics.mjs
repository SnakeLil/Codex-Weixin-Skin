#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SESSION_VALUES = new Set(["active", "applying", "paused", "stale", "off", "unknown"]);
const OPERATION_VALUES = new Set(["", "applying", "pausing", "success", "paused", "cancelled", "failed"]);
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function safeBoolean(value) {
  return value === true;
}

function safeVersion(value, fallback = "unknown") {
  return typeof value === "string" && VERSION_PATTERN.test(value) ? value : fallback;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function sanitizeStatus(input = {}) {
  const port = Number.isSafeInteger(input.port) && input.port >= 1024 && input.port <= 65535
    ? input.port
    : null;
  return {
    session: SESSION_VALUES.has(input.session) ? input.session : "unknown",
    operation: OPERATION_VALUES.has(input.operation) ? input.operation : "",
    loopbackPort: port,
    injectorAlive: safeBoolean(input.injectorAlive),
    codexRunning: safeBoolean(input.codexRunning),
  };
}

export function sanitizePayloadCheck(input = {}) {
  return {
    passed: input.pass === true,
    skinVersion: safeVersion(input.version),
    imageBytes: safeCount(input.imageBytes),
    payloadBytes: safeCount(input.payloadBytes),
  };
}

export function buildDiagnosticReport({
  generatedAt,
  skinVersion,
  codexVersion,
  macosVersion,
  architecture,
  status,
  payload,
  sourceCheckPassed,
  compatibilityContractVersion,
  compatibilityContexts,
}) {
  const contexts = Array.isArray(compatibilityContexts)
    ? compatibilityContexts
      .filter((value) => typeof value === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(value))
      .slice(0, 32)
    : [];
  const sanitizedStatus = sanitizeStatus(status);
  const sanitizedPayload = sanitizePayloadCheck(payload);
  const report = {
    schemaVersion: 1,
    product: "Codex WeChat Skin Studio",
    generatedAt: typeof generatedAt === "string" && ISO_DATE_PATTERN.test(generatedAt)
      ? generatedAt
      : new Date().toISOString(),
    environment: {
      skinVersion: safeVersion(skinVersion),
      codexVersion: safeVersion(codexVersion),
      macosVersion: safeVersion(macosVersion),
      architecture: architecture === "arm64" || architecture === "x86_64" ? architecture : "unknown",
    },
    runtime: sanitizedStatus,
    payload: sanitizedPayload,
    compatibility: {
      sourceCheckPassed: sourceCheckPassed === true,
      contractVersion: Number.isSafeInteger(compatibilityContractVersion)
        ? compatibilityContractVersion
        : null,
      coveredContexts: contexts,
      liveUiCheck: "not-run-by-design",
      note: "Live Codex UI verification is intentionally excluded so exporting diagnostics cannot affect an active session.",
    },
    privacy: {
      allowlistOnly: true,
      chatContentCollected: false,
      screenshotsCollected: false,
      rawLogsCollected: false,
      accountDataCollected: false,
      customThemeNamesCollected: false,
      localPathsCollected: false,
      debuggerConnected: false,
    },
  };
  report.overallPass = report.payload.passed && report.compatibility.sourceCheckPassed;
  return report;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    options[key] = value;
    index += 1;
  }
  for (const required of [
    "output-dir", "status-file", "payload-file", "skin-version", "codex-version",
    "macos-version", "architecture", "codex-running", "source-check-passed", "contract-file",
  ]) {
    if (!options[required]) throw new Error(`Missing --${required}`);
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function renderText(report) {
  const yesNo = (value) => value ? "yes" : "no";
  return [
    "Codex WeChat Skin — Anonymous Diagnostic Report",
    "================================================",
    "",
    `Generated: ${report.generatedAt}`,
    `Overall checks passed: ${yesNo(report.overallPass)}`,
    "",
    "Environment",
    `- Skin: ${report.environment.skinVersion}`,
    `- Codex Desktop: ${report.environment.codexVersion}`,
    `- macOS: ${report.environment.macosVersion} (${report.environment.architecture})`,
    "",
    "Runtime (read-only snapshot)",
    `- Codex running: ${yesNo(report.runtime.codexRunning)}`,
    `- Skin session: ${report.runtime.session}`,
    `- Skin operation: ${report.runtime.operation || "none"}`,
    `- Injector alive: ${yesNo(report.runtime.injectorAlive)}`,
    `- Loopback port: ${report.runtime.loopbackPort ?? "unknown"}`,
    "",
    "Payload and compatibility",
    `- Payload valid: ${yesNo(report.payload.passed)}`,
    `- Payload version: ${report.payload.skinVersion}`,
    `- Source integrity check: ${yesNo(report.compatibility.sourceCheckPassed)}`,
    `- Compatibility contract: ${report.compatibility.contractVersion ?? "unknown"}`,
    `- Covered states: ${report.compatibility.coveredContexts.join(", ") || "unknown"}`,
    `- Live UI check: ${report.compatibility.liveUiCheck}`,
    "",
    "Privacy",
    "This bundle contains allowlisted diagnostics only. It does not contain chat content,",
    "screenshots, raw logs, account data, custom theme names, or local file paths.",
    "Exporting it does not connect to the Codex debugging endpoint.",
    "",
    "Attach this ZIP to a GitHub Issue:",
    "https://github.com/SnakeLil/Codex-Weixin-Skin/issues/new/choose",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [status, payload, contract] = await Promise.all([
    readJson(options["status-file"]),
    readJson(options["payload-file"]),
    import(pathToFileURL(path.resolve(options["contract-file"])).href),
  ]);
  const report = buildDiagnosticReport({
    generatedAt: new Date().toISOString(),
    skinVersion: options["skin-version"],
    codexVersion: options["codex-version"],
    macosVersion: options["macos-version"],
    architecture: options.architecture,
    status: { ...status, codexRunning: options["codex-running"] === "true" },
    payload,
    sourceCheckPassed: options["source-check-passed"] === "true",
    compatibilityContractVersion: contract.COMPATIBILITY_CONTRACT_VERSION,
    compatibilityContexts: contract.COMPATIBILITY_CONTEXTS.map(({ id }) => id),
  });
  await fs.mkdir(options["output-dir"], { recursive: false, mode: 0o700 });
  await Promise.all([
    fs.writeFile(path.join(options["output-dir"], "diagnostic.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
    fs.writeFile(path.join(options["output-dir"], "diagnostic.txt"), renderText(report), { mode: 0o600 }),
  ]);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((error) => {
    console.error(`Codex WeChat Skin diagnostics: ${error.message}`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const SOURCE_COMPATIBILITY_SCHEMA_VERSION = 1;
export const REQUIRED_NATIVE_ANCHORS = Object.freeze([
  { id: "main-surface", token: "main-surface" },
  { id: "session-sidebar", token: "app-shell-left-panel" },
  { id: "conversation-timeline", token: "data-app-action-timeline-scroll" },
  { id: "thread-footer", token: "data-thread-scroll-footer" },
  { id: "composer", token: "composer-surface-chrome" },
  { id: "search-dialog", token: "global-command-menu-dialog" },
  { id: "command-root", token: "cmdk-root" },
  { id: "command-input", token: "cmdk-input" },
]);

function countOccurrences(buffer, token) {
  const needle = Buffer.from(token);
  let count = 0;
  let offset = 0;
  while (offset < buffer.length) {
    const index = buffer.indexOf(needle, offset);
    if (index === -1) break;
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

export function scanNativeAnchors(buffer, anchors = REQUIRED_NATIVE_ANCHORS) {
  const results = anchors.map(({ id, token }) => {
    const occurrences = countOccurrences(buffer, token);
    return { id, token, occurrences, pass: occurrences > 0 };
  });
  return {
    pass: results.every((result) => result.pass),
    anchors: results,
    missing: results.filter((result) => !result.pass).map((result) => result.id),
  };
}

async function plistValue(plist, key) {
  const { stdout } = await execFileAsync("/usr/bin/plutil", [
    "-extract", key, "raw", "-o", "-", plist,
  ]);
  return stdout.trim();
}

async function resolveAppPath(requestedPath) {
  if (requestedPath) return path.resolve(requestedPath);
  for (const candidate of ["/Applications/ChatGPT.app", "/Applications/Codex.app"]) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next supported application name.
    }
  }
  throw new Error("ChatGPT/Codex app was not found under /Applications");
}

export async function inspectInstalledAppSource(requestedPath) {
  const appPath = await resolveAppPath(requestedPath);
  const plist = path.join(appPath, "Contents", "Info.plist");
  const asar = path.join(appPath, "Contents", "Resources", "app.asar");
  const [name, bundleIdentifier, version, build, source] = await Promise.all([
    plistValue(plist, "CFBundleName"),
    plistValue(plist, "CFBundleIdentifier"),
    plistValue(plist, "CFBundleShortVersionString"),
    plistValue(plist, "CFBundleVersion"),
    fs.readFile(asar),
  ]);
  if (bundleIdentifier !== "com.openai.codex") {
    throw new Error(`Unexpected bundle identifier: ${bundleIdentifier}`);
  }
  const sourceScan = scanNativeAnchors(source);
  return {
    schemaVersion: SOURCE_COMPATIBILITY_SCHEMA_VERSION,
    app: { name, bundleIdentifier, version, build },
    sourceArtifact: {
      relativePath: "Contents/Resources/app.asar",
      sha256: createHash("sha256").update(source).digest("hex"),
    },
    sourceScan,
  };
}

function requiredArgumentValue(argv, index, argument) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${argument}`);
  }
  return value;
}

export function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--app") {
      options.appPath = requiredArgumentValue(argv, index, argument);
      index += 1;
    } else if (argument === "--expected-version") {
      options.expectedVersion = requiredArgumentValue(argv, index, argument);
      index += 1;
    } else if (argument === "--expected-build") {
      options.expectedBuild = requiredArgumentValue(argv, index, argument);
      index += 1;
    } else if (argument === "--expected-sha256") {
      options.expectedSha256 = requiredArgumentValue(argv, index, argument);
      index += 1;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: verify-installed-app-source.mjs [--app PATH] [--expected-version VERSION] [--expected-build BUILD] [--expected-sha256 HASH]");
    return;
  }
  const evidence = await inspectInstalledAppSource(options.appPath);
  const expectations = [
    ["version", options.expectedVersion, evidence.app.version],
    ["build", options.expectedBuild, evidence.app.build],
    ["sha256", options.expectedSha256, evidence.sourceArtifact.sha256],
  ];
  const mismatches = expectations
    .filter(([, expected]) => expected)
    .filter(([, expected, actual]) => expected !== actual)
    .map(([field, expected, actual]) => ({ field, expected, actual }));
  const result = {
    ...evidence,
    expected: {
      version: options.expectedVersion || null,
      build: options.expectedBuild || null,
      sha256: options.expectedSha256 || null,
    },
    pass: evidence.sourceScan.pass && mismatches.length === 0,
    mismatches,
    safety: {
      launchesApplication: false,
      connectsToDebuggingPort: false,
      readsUserData: false,
    },
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

const isEntrypoint = process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

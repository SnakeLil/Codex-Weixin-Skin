#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(macosRoot, "..");
export const tokenFile = path.join(macosRoot, "design", "wechat-tokens.json");
export const targetFiles = {
  full: path.join(macosRoot, "assets", "weixin-skin.css"),
  lite: path.join(repositoryRoot, "integrations", "codedrobe", "codex-wechat-skin-lite", "codex.css"),
  liteManifest: path.join(repositoryRoot, "integrations", "codedrobe", "codex-wechat-skin-lite", "theme.json"),
};

const TOKEN_NAME = /^--(?:wx|wxs)-[a-z0-9-]+$/;
const UNSAFE_VALUE = /[;{}\r\n]/;

export function validateTokenDocument(document) {
  if (!document || document.schemaVersion !== 1) throw new Error("Unsupported design token schema");
  for (const group of ["light", "dark", "metrics"]) {
    const entries = document[group];
    if (!entries || Array.isArray(entries) || typeof entries !== "object") {
      throw new Error(`Missing token group: ${group}`);
    }
    for (const [name, value] of Object.entries(entries)) {
      if (!TOKEN_NAME.test(name)) throw new Error(`Invalid token name: ${name}`);
      if (typeof value !== "string" || !value || value.length > 120 || UNSAFE_VALUE.test(value)) {
        throw new Error(`Invalid value for token: ${name}`);
      }
    }
  }
  for (const name of Object.keys(document.dark)) {
    if (!(name in document.light)) throw new Error(`Dark token has no light counterpart: ${name}`);
  }
  for (const name of Object.keys(document.light)) {
    if (name.startsWith("--wxs-") && !(name in document.dark)) {
      throw new Error(`Theme-dependent light token has no dark counterpart: ${name}`);
    }
  }
  return document;
}

export function renderTokenBlock(name, entries) {
  const declarations = Object.entries(entries).map(([token, value]) => `  ${token}: ${value};`);
  return [
    `  /* weixin-shared-tokens:${name}:start — generated; run npm run generate:tokens */`,
    ...declarations,
    `  /* weixin-shared-tokens:${name}:end */`,
  ].join("\n");
}

export function replaceTokenBlock(css, name, block) {
  const start = `  /* weixin-shared-tokens:${name}:start`;
  const end = `  /* weixin-shared-tokens:${name}:end */`;
  const startIndex = css.indexOf(start);
  const endIndex = css.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) throw new Error(`Missing generated token markers: ${name}`);
  const afterEnd = endIndex + end.length;
  if (css.indexOf(start, startIndex + start.length) >= 0) throw new Error(`Duplicate token block: ${name}`);
  return `${css.slice(0, startIndex)}${block}${css.slice(afterEnd)}`;
}

export async function expectedTokenTargets() {
  const document = validateTokenDocument(JSON.parse(await fs.readFile(tokenFile, "utf8")));
  const lightBlock = renderTokenBlock("light", { ...document.light, ...document.metrics });
  const darkBlock = renderTokenBlock("dark", document.dark);
  const [full, lite, liteManifestSource] = await Promise.all([
    fs.readFile(targetFiles.full, "utf8"),
    fs.readFile(targetFiles.lite, "utf8"),
    fs.readFile(targetFiles.liteManifest, "utf8"),
  ]);
  const liteManifest = JSON.parse(liteManifestSource);
  const baseTheme = liteManifest?.targets?.codex?.options?.baseTheme;
  if (!baseTheme) throw new Error("CodeDrobe Lite manifest is missing targets.codex.options.baseTheme");
  baseTheme.accent = document.light["--wx-green"];
  baseTheme.ink = document.light["--wxs-text"];
  baseTheme.surface = document.light["--wxs-bg"];
  baseTheme.semanticColors.skill = document.light["--wx-green"];
  const expectedLiteManifest = `${JSON.stringify(liteManifest, null, 2)}\n`;
  return {
    document,
    expected: {
      full: replaceTokenBlock(replaceTokenBlock(full, "light", lightBlock), "dark", darkBlock),
      lite: replaceTokenBlock(lite, "light", lightBlock),
      liteManifest: expectedLiteManifest,
    },
    current: { full, lite, liteManifest: liteManifestSource },
  };
}

export async function writeTargetsAtomically(files, contents) {
  const nonce = `${process.pid}.${Date.now()}`;
  const descriptors = Object.keys(contents).map((name, index) => {
    const target = files[name];
    if (!target) throw new Error(`Missing output path for generated target: ${name}`);
    return {
      name,
      target,
      temporary: `${target}.weixin-tokens-${nonce}-${index}.tmp`,
      content: contents[name],
    };
  });
  try {
    const prepared = await Promise.allSettled(descriptors.map(async (descriptor) => {
      const targetStat = await fs.stat(descriptor.target);
      await fs.writeFile(descriptor.temporary, descriptor.content, {
        encoding: "utf8",
        flag: "wx",
        mode: targetStat.mode & 0o777,
      });
    }));
    const failed = prepared.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
    for (const descriptor of descriptors) {
      await fs.rename(descriptor.temporary, descriptor.target);
    }
  } finally {
    await Promise.allSettled(descriptors.map(({ temporary }) => fs.unlink(temporary)));
  }
}

async function main() {
  const check = process.argv.includes("--check");
  const unknown = process.argv.slice(2).filter((argument) => argument !== "--check");
  if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
  const { expected, current } = await expectedTokenTargets();
  const stale = Object.keys(expected).filter((target) => expected[target] !== current[target]);
  if (check && stale.length) {
    throw new Error(`Generated design tokens are stale: ${stale.join(", ")}. Run npm run generate:tokens.`);
  }
  if (!check) {
    await writeTargetsAtomically(targetFiles, expected);
  }
  console.log(check ? "Shared design tokens are current." : "Shared design tokens updated.");
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Codex WeChat Skin tokens: ${error.message}`);
    process.exitCode = 1;
  });
}

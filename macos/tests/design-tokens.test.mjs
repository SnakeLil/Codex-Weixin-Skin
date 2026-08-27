import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  expectedTokenTargets,
  renderTokenBlock,
  replaceTokenBlock,
  validateTokenDocument,
  writeTargetsAtomically,
} from "../scripts/generate-design-tokens.mjs";

test("Full and Lite CSS are current outputs of the canonical token source", async () => {
  const { current, expected } = await expectedTokenTargets();
  assert.equal(current.full, expected.full, "Full token block is stale");
  assert.equal(current.lite, expected.lite, "Lite token block is stale");
});

test("Full and Lite share the exact light colour, radius, and spacing block", async () => {
  const { current } = await expectedTokenTargets();
  const extract = (css) => css.match(
    /  \/\* weixin-shared-tokens:light:start[^\n]*\n([\s\S]*?)\n  \/\* weixin-shared-tokens:light:end \*\//,
  )?.[1];
  const full = extract(current.full);
  const lite = extract(current.lite);
  assert.ok(full && lite, "both editions must contain the generated light block");
  assert.equal(full, lite);
  for (const token of [
    "--wx-green", "--wxs-bg", "--wxs-sent", "--wxs-radius",
    "--wxs-control-height", "--wxs-list-padding-x", "--wxs-motion-fast",
  ]) {
    assert.match(full, new RegExp(`${token.replaceAll("-", "\\-")}:`));
  }
});

test("canonical token validation rejects unsafe CSS and incomplete dark tokens", () => {
  assert.throws(() => validateTokenDocument({
    schemaVersion: 1,
    light: { "--wxs-bg": "red; } body { display:none" },
    dark: {},
    metrics: {},
  }), /Invalid value/);
  assert.throws(() => validateTokenDocument({
    schemaVersion: 1,
    light: { "--wxs-bg": "#ffffff", "--wxs-panel": "#ffffff" },
    dark: { "--wxs-bg": "#000000" },
    metrics: {},
  }), /light token has no dark counterpart/);
  assert.throws(() => validateTokenDocument({
    schemaVersion: 1,
    light: {},
    dark: { "--wxs-bg": "#000000" },
    metrics: {},
  }), /Dark token has no light counterpart/);
});

test("marker replacement fails on missing or duplicate generated blocks", () => {
  const block = renderTokenBlock("light", { "--wxs-bg": "#ededed" });
  assert.throws(() => replaceTokenBlock("body {}", "light", block), /Missing/);
  assert.throws(() => replaceTokenBlock(`${block}\n${block}`, "light", block), /Duplicate/);
});

test("shared metric tokens are consumed by both editions", async () => {
  const { current } = await expectedTokenTargets();
  for (const name of ["full", "lite"]) {
    const css = current[name];
    for (const token of [
      "--wxs-control-height", "--wxs-control-radius", "--wxs-list-padding-x", "--wxs-motion-fast",
    ]) {
      const uses = css.match(new RegExp(`var\\(${token}\\)`, "g"))?.length ?? 0;
      assert.ok(uses >= 1, `${name} must consume ${token}`);
    }
  }
});

test("Lite does not retain legacy aliases that bypass the shared source", async () => {
  const { current } = await expectedTokenTargets();
  for (const legacy of ["--wx-red", "--wx-green-rgb", "--wxs-selected", "--wxs-received"]) {
    assert.equal(current.lite.includes(legacy), false, `Lite still uses legacy token ${legacy}`);
  }
});

test("CodeDrobe base palette inherits the canonical shared colours", async () => {
  const { current, document } = await expectedTokenTargets();
  const baseTheme = JSON.parse(current.liteManifest).targets.codex.options.baseTheme;
  assert.equal(baseTheme.accent, document.light["--wx-green"]);
  assert.equal(baseTheme.surface, document.light["--wxs-bg"]);
  assert.equal(baseTheme.ink, document.light["--wxs-text"]);
  assert.equal(baseTheme.semanticColors.skill, document.light["--wx-green"]);
});

test("shared tokens cannot be redeclared outside generated blocks", async () => {
  const { current, document } = await expectedTokenTargets();
  const sharedTokens = new Set([
    ...Object.keys(document.light),
    ...Object.keys(document.dark),
    ...Object.keys(document.metrics),
  ]);
  const withoutGeneratedBlocks = (css) => css.replace(
    /  \/\* weixin-shared-tokens:(?:light|dark):start[^\n]*\n[\s\S]*?\n  \/\* weixin-shared-tokens:(?:light|dark):end \*\//g,
    "",
  );
  for (const name of ["full", "lite"]) {
    const outside = withoutGeneratedBlocks(current[name]);
    const declarations = [...outside.matchAll(/^\s*(--(?:wx|wxs)-[a-z0-9-]+)\s*:/gm)]
      .map((match) => match[1])
      .filter((token) => sharedTokens.has(token));
    assert.deepEqual(declarations, [], `${name} overrides generated tokens: ${declarations.join(", ")}`);
  }
});

test("generation prepares every sibling temp before replacing final artifacts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weixin-token-write-test-"));
  try {
    const first = path.join(root, "first.css");
    const unavailable = path.join(root, "missing", "second.css");
    await fs.writeFile(first, "original\n");
    await assert.rejects(() => writeTargetsAtomically(
      { first, second: unavailable },
      { first: "updated\n", second: "updated\n" },
    ));
    assert.equal(await fs.readFile(first, "utf8"), "original\n");
    const leftovers = (await fs.readdir(root)).filter((name) => name.includes(".weixin-tokens-"));
    assert.deepEqual(leftovers, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

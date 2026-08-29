import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_NATIVE_ANCHORS,
  SOURCE_COMPATIBILITY_SCHEMA_VERSION,
  parseArguments,
  scanNativeAnchors,
} from "../scripts/verify-installed-app-source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");

test("installed app source scanner fails closed when a native anchor is missing", () => {
  const complete = Buffer.from(REQUIRED_NATIVE_ANCHORS.map(({ token }) => token).join("\n"));
  assert.equal(scanNativeAnchors(complete).pass, true);

  const missingComposer = Buffer.from(REQUIRED_NATIVE_ANCHORS
    .filter(({ id }) => id !== "composer")
    .map(({ token }) => token)
    .join("\n"));
  assert.deepEqual(scanNativeAnchors(missingComposer).missing, ["composer"]);
});

test("installed app source audit fails closed when a CLI value is missing", () => {
  for (const argument of ["--app", "--expected-version", "--expected-build", "--expected-sha256"]) {
    assert.throws(() => parseArguments([argument]), new RegExp(`Missing value for ${argument}`));
    assert.throws(
      () => parseArguments([argument, "--help"]),
      new RegExp(`Missing value for ${argument}`),
    );
  }
});

test("latest compatibility evidence is complete and tied to the sanitized fixture suite", async () => {
  const evidence = JSON.parse(await fs.readFile(
    path.join(macosRoot, "compatibility", "validated-builds.json"),
    "utf8",
  ));
  const fixtures = JSON.parse(await fs.readFile(
    path.join(macosRoot, "tests", "fixtures", "compatibility-pages.json"),
    "utf8",
  ));
  assert.equal(evidence.schemaVersion, SOURCE_COMPATIBILITY_SCHEMA_VERSION);
  assert.equal(evidence.latest.app.bundleIdentifier, "com.openai.codex");
  assert.match(evidence.latest.app.version, /^\d+\.\d+\.\d+$/);
  assert.match(evidence.latest.sourceArtifact.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    evidence.latest.sourceScan.requiredAnchors,
    REQUIRED_NATIVE_ANCHORS.map(({ id }) => id),
  );
  assert.deepEqual(
    evidence.latest.isolatedRegression.surfaces.sort(),
    fixtures.pages.map(({ id }) => id).sort(),
  );
  assert.deepEqual(fixtures.revalidatedAgainst, {
    appVersion: evidence.latest.app.version,
    build: evidence.latest.app.build,
    date: evidence.latest.validatedOn,
  });
  assert.equal(evidence.latest.sourceScan.status, "passed");
  assert.equal(evidence.latest.isolatedRegression.status, "passed");
});

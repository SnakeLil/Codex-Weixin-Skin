import assert from "node:assert/strict";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  COMPATIBILITY_CONTEXTS,
  COMPATIBILITY_CONTRACT_VERSION,
  evaluateCompatibilityContracts,
} from "../scripts/compatibility-contract.mjs";
import { synchronizeWeixinRouteState } from "../assets/route-state.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures");
const manifest = JSON.parse(await fs.readFile(path.join(fixtureRoot, "compatibility-pages.json"), "utf8"));
const nativeCss = await fs.readFile(path.join(fixtureRoot, "native-shell.css"), "utf8");
const themeCss = await fs.readFile(path.join(here, "..", "assets", "weixin-skin.css"), "utf8");
const liteCss = await fs.readFile(
  path.join(here, "..", "..", "integrations", "codedrobe", "codex-wechat-skin-lite", "codex.css"),
  "utf8",
);
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let browser;

const htmlWithCss = (html, css) => html.replace(
  "</head>",
  `<style data-fixture-native>${nativeCss}</style><style id="codex-weixin-skin-style">${css}</style></head>`,
);
const htmlWithStyles = (html) => htmlWithCss(html, themeCss);

before(async () => {
  const useSystemChrome = process.env.WEIXIN_SKIN_TEST_BROWSER === "system" &&
    fsSync.existsSync(systemChrome);
  browser = await chromium.launch({
    headless: true,
    ...(useSystemChrome ? { executablePath: systemChrome } : {}),
  });
});

after(async () => browser?.close());

test("fixture schema covers every route contract", () => {
  assert.equal(manifest.schemaVersion, COMPATIBILITY_CONTRACT_VERSION);
  const contextIds = new Set(COMPATIBILITY_CONTEXTS.map((context) => context.id));
  assert.equal(contextIds.size, COMPATIBILITY_CONTEXTS.length, "context ids must be unique");
  assert.deepEqual(
    [...contextIds].filter((id) => id !== "shell").sort(),
    manifest.pages.map((page) => page.id).sort(),
  );
});

for (const fixture of manifest.pages) {
  test(`${fixture.id} sanitized DOM snapshot passes structure and layout regression`, async () => {
    const page = await browser.newPage({ viewport: fixture.viewport });
    try {
      const html = await fs.readFile(path.join(fixtureRoot, fixture.file), "utf8");
      await page.setContent(htmlWithStyles(html), { waitUntil: "load" });
      const result = await page.evaluate(({ contexts, evaluatorSource, routeStateSource }) => {
        const prebakedRouteMarkers = Boolean(
          document.documentElement.hasAttribute("data-weixin-page") ||
          document.documentElement.hasAttribute("data-weixin-settings-open") ||
          document.documentElement.hasAttribute("data-weixin-search-open") ||
          document.documentElement.hasAttribute("data-weixin-summary-open") ||
          document.querySelector(".weixin-skin-settings-content, .weixin-skin-summary-panel, [class*='weixin-skin-page-']"),
        );
        const synchronizeRouteState = (0, eval)(`(${routeStateSource})`);
        const routeState = synchronizeRouteState(document);
        const evaluator = (0, eval)(`(${evaluatorSource})`);
        const compatibility = evaluator(contexts, (selector) => Boolean(document.querySelector(selector)));
        return {
          compatibility,
          prebakedRouteMarkers,
          detected: {
            page: routeState.page,
            searchOpen: routeState.searchOpen,
            summaryOpen: routeState.summaryOpen,
          },
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          shell: document.querySelector("main.main-surface")?.getBoundingClientRect().toJSON(),
          sidebar: document.querySelector("aside.app-shell-left-panel")?.getBoundingClientRect().toJSON(),
        };
      }, {
        contexts: COMPATIBILITY_CONTEXTS,
        evaluatorSource: evaluateCompatibilityContracts.toString(),
        routeStateSource: synchronizeWeixinRouteState.toString(),
      });
      assert.equal(result.compatibility.pass, true, JSON.stringify(result.compatibility.missing));
      assert.equal(result.prebakedRouteMarkers, false, "fixtures must contain native state only");
      assert.deepEqual(result.compatibility.active, fixture.expectedActive);
      assert.equal(result.overflowX, false, `${fixture.id} must not overflow horizontally`);
      assert.ok(result.shell?.width > 300 && result.sidebar?.width > 200);

      if (fixture.id === "conversation") {
        const styles = await page.evaluate(() => ({
          sent: getComputedStyle(document.querySelector("[data-user-message-bubble='true']")).backgroundColor,
          received: getComputedStyle(document.querySelector("[data-content-search-unit-key$=':assistant']")).backgroundColor,
          composer: document.querySelector(".composer-surface-chrome").getBoundingClientRect().toJSON(),
        }));
        assert.equal(styles.sent, "rgb(149, 236, 105)");
        assert.equal(styles.received, "rgb(255, 255, 255)");
        assert.ok(styles.composer.width > 500);
      } else if (fixture.id === "search") {
        const search = await page.evaluate(() => {
          const dialog = document.querySelector(".global-command-menu-dialog").getBoundingClientRect();
          const input = document.querySelector("[cmdk-input]").getBoundingClientRect();
          return { dialog: dialog.toJSON(), input: input.toJSON() };
        });
        assert.ok(search.dialog.width <= 520 && search.dialog.width >= 320);
        assert.ok(search.input.width > 300 && search.input.height === 40);
      } else if (fixture.id === "settings") {
        const settings = await page.evaluate(() => {
          const nav = document.querySelector(".settings-nav").getBoundingClientRect();
          const content = document.querySelector(".weixin-skin-settings-content").getBoundingClientRect();
          return {
            railDisplay: getComputedStyle(document.querySelector(".weixin-skin-navrail")).display,
            nav: nav.toJSON(),
            content: content.toJSON(),
          };
        });
        assert.equal(settings.railDisplay, "none");
        assert.ok(settings.content.x >= settings.nav.x + settings.nav.width);
        assert.ok(settings.content.width > 500);
      } else if (["sites", "scheduled", "plugins"].includes(fixture.id)) {
        const utility = await page.evaluate(() => ({
          wallpaperOpacity: getComputedStyle(document.querySelector("main.main-surface"), "::before").opacity,
          fadeContent: getComputedStyle(document.querySelector(".utility-sticky"), "::after").content,
          backgroundImage: getComputedStyle(document.querySelector(".utility-sticky")).backgroundImage,
        }));
        assert.equal(utility.wallpaperOpacity, "0");
        assert.equal(utility.fadeContent, "none");
        assert.equal(utility.backgroundImage, "none");
      } else if (fixture.id === "pinned-summary") {
        const pinned = await page.evaluate(() => {
          const composer = document.querySelector(".composer-surface-chrome").getBoundingClientRect();
          const summary = document.querySelector(".weixin-skin-summary-panel").getBoundingClientRect();
          return { composer: composer.toJSON(), summary: summary.toJSON() };
        });
        assert.ok(pinned.composer.right <= pinned.summary.left + 1, "composer must stop before summary panel");
        assert.ok(pinned.summary.width >= 300);
      }
    } finally {
      await page.close();
    }
  });
}

test("removing an active required DOM node fails the contract", async () => {
  const fixture = manifest.pages.find((page) => page.id === "search");
  const page = await browser.newPage({ viewport: fixture.viewport });
  try {
    const html = await fs.readFile(path.join(fixtureRoot, fixture.file), "utf8");
    await page.setContent(htmlWithStyles(html));
    const result = await page.evaluate(({ contexts, evaluatorSource, routeStateSource }) => {
      const synchronizeRouteState = (0, eval)(`(${routeStateSource})`);
      synchronizeRouteState(document);
      document.querySelector("[cmdk-input]").remove();
      const evaluator = (0, eval)(`(${evaluatorSource})`);
      return evaluator(contexts, (selector) => Boolean(document.querySelector(selector)));
    }, {
      contexts: COMPATIBILITY_CONTEXTS,
      evaluatorSource: evaluateCompatibilityContracts.toString(),
      routeStateSource: synchronizeWeixinRouteState.toString(),
    });
    assert.equal(result.pass, false);
    assert.deepEqual(result.missing, [{ context: "search", requirement: "search input" }]);
  } finally {
    await page.close();
  }
});

test("a generic top-right popover is not misclassified as pinned summary", async () => {
  const fixture = manifest.pages.find((page) => page.id === "conversation");
  const page = await browser.newPage({ viewport: fixture.viewport });
  try {
    const html = await fs.readFile(path.join(fixtureRoot, fixture.file), "utf8");
    await page.setContent(htmlWithStyles(html));
    const result = await page.evaluate((routeStateSource) => {
      const popover = document.createElement("div");
      popover.className = "origin-top-right";
      popover.style.cssText = "position:absolute;right:8px;top:8px;width:120px;height:44px";
      document.querySelector("main.main-surface").appendChild(popover);
      const synchronizeRouteState = (0, eval)(`(${routeStateSource})`);
      const state = synchronizeRouteState(document);
      return {
        summaryOpen: state.summaryOpen,
        marker: document.documentElement.getAttribute("data-weixin-summary-open"),
        semanticClass: popover.classList.contains("weixin-skin-summary-panel"),
      };
    }, synchronizeWeixinRouteState.toString());
    assert.deepEqual(result, { summaryOpen: false, marker: null, semanticClass: false });
  } finally {
    await page.close();
  }
});

test("invalid selectors are reported instead of crashing live verification", () => {
  const result = evaluateCompatibilityContracts([
    { id: "invalid", label: "Invalid", always: true, required: [{ name: "broken", any: ["["] }] },
  ], () => { throw new Error("Invalid selector"); });
  assert.equal(result.pass, false);
  assert.equal(result.selectorErrors.length, 1);
});

test("CodeDrobe Lite consumes the shared WeChat tokens in a rendered conversation", async () => {
  const fixture = manifest.pages.find((page) => page.id === "conversation");
  const page = await browser.newPage({ viewport: fixture.viewport });
  try {
    const nativeHtml = await fs.readFile(path.join(fixtureRoot, fixture.file), "utf8");
    const liteHtml = nativeHtml.replace(
      'class="codex-weixin-skin" data-weixin-shell="light"',
      'class="codedrobe-host-codex"',
    );
    await page.setContent(htmlWithCss(liteHtml, liteCss));
    const result = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const sent = getComputedStyle(document.querySelector("[data-user-message-bubble='true']"));
      const received = getComputedStyle(document.querySelector("[data-content-search-unit-key$=':assistant']"));
      const sidebar = document.querySelector("aside.app-shell-left-panel").getBoundingClientRect();
      return {
        tokens: {
          green: root.getPropertyValue("--wx-green").trim(),
          background: root.getPropertyValue("--wxs-bg").trim(),
          radius: root.getPropertyValue("--wxs-radius").trim(),
          controlHeight: root.getPropertyValue("--wxs-control-height").trim(),
        },
        sent: { background: sent.backgroundColor, radius: sent.borderRadius },
        received: { background: received.backgroundColor, radius: received.borderRadius },
        sidebarWidth: sidebar.width,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert.deepEqual(result.tokens, {
      green: "#07c160",
      background: "#ededed",
      radius: "4px",
      controlHeight: "34px",
    });
    assert.deepEqual(result.sent, { background: "rgb(149, 236, 105)", radius: "4px" });
    assert.deepEqual(result.received, { background: "rgb(255, 255, 255)", radius: "4px" });
    assert.equal(result.sidebarWidth, 292);
    assert.equal(result.overflowX, false);
  } finally {
    await page.close();
  }
});

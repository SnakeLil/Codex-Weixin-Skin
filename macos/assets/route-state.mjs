/**
 * Detect the current Codex surface and stamp stable, theme-owned route markers.
 * This function is injected into Codex and also executed unchanged by the
 * isolated compatibility suite.
 */
export function synchronizeWeixinRouteState(document) {
  const root = document.documentElement;
  const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
  const setFlag = (name, enabled) => {
    if (enabled) root?.setAttribute(name, "true");
    else root?.removeAttribute(name);
  };

  const settingsPanel = [...document.querySelectorAll(".app-shell-left-panel")].find(
    (candidate) => candidate.tagName !== "ASIDE" && candidate.querySelector('input[role="searchbox"]'),
  ) || null;
  const settingsSiblings = settingsPanel?.parentElement
    ? [...settingsPanel.parentElement.children].filter((candidate) => candidate !== settingsPanel)
    : [];
  const settingsContent = settingsSiblings.find((candidate) =>
    candidate.matches("main, [role='main']") || candidate.querySelector("main, [role='main'], h1"),
  ) || settingsSiblings[0] || null;
  for (const candidate of document.querySelectorAll(".weixin-skin-settings-content")) {
    if (candidate !== settingsContent) candidate.classList.remove("weixin-skin-settings-content");
  }
  settingsContent?.classList.add("weixin-skin-settings-content");
  setFlag("data-weixin-settings-open", Boolean(settingsPanel && settingsContent));

  const homeIndicator = document.querySelector('[data-testid="home-icon"]');
  const home = homeIndicator?.closest('[role="main"]') ||
    [...document.querySelectorAll('[role="main"]')].find((candidate) =>
      candidate.querySelector('[data-feature="game-source"]') &&
      candidate.querySelector('[class*="home-suggestions"]')) || null;
  for (const candidate of document.querySelectorAll('[role="main"].weixin-skin-home')) {
    if (candidate !== home) candidate.classList.remove("weixin-skin-home");
  }
  home?.classList.add("weixin-skin-home");
  const homeUtilityBars = new Set(home
    ? home.querySelectorAll('[class*="_homeUtilityBar_"]')
    : []);
  for (const candidate of document.querySelectorAll(".weixin-skin-home-utility")) {
    if (!homeUtilityBars.has(candidate)) candidate.classList.remove("weixin-skin-home-utility");
  }
  for (const candidate of homeUtilityBars) candidate.classList.add("weixin-skin-home-utility");

  const currentNativePage = document.querySelector(
    'aside.app-shell-left-panel [aria-current="page"]',
  );
  const currentPageLabel = currentNativePage?.textContent?.trim().toLowerCase() || "";
  const utilityPage = currentPageLabel.includes("插件") || currentPageLabel.includes("plugin")
    ? "plugins"
    : currentPageLabel.includes("站点") || currentPageLabel.includes("site")
      ? "sites"
      : currentPageLabel.includes("已安排") || currentPageLabel.includes("scheduled")
        ? "scheduled"
        : null;
  for (const page of ["sites", "scheduled", "plugins"]) {
    shellMain?.classList.toggle(`weixin-skin-page-${page}`, utilityPage === page);
  }

  const conversation = shellMain?.querySelector("[data-app-action-timeline-scroll]") ||
    shellMain?.querySelector("[data-thread-scroll-footer='true']") ||
    shellMain?.querySelector(".composer-surface-chrome") || null;
  const page = settingsPanel && settingsContent
    ? "settings"
    : utilityPage || (home ? "home" : conversation ? "conversation" : "other");
  root?.setAttribute("data-weixin-page", page);

  const searchDialog = document.querySelector(".global-command-menu-dialog");
  setFlag("data-weixin-search-open", Boolean(searchDialog));

  const summaryLayout = shellMain?.querySelector(
    '[style*="--thread-wide-block-inline-shift"]:has(> [data-thread-scroll-footer="true"])',
  ) || null;
  const shellBox = shellMain?.getBoundingClientRect();
  const summaryCandidates = shellMain
    ? [...shellMain.querySelectorAll('[class~="origin-top-right"]:not([style*="opacity: 0"])')]
    : [];
  const summaryPanel = summaryLayout && shellBox
    ? summaryCandidates.find((candidate) => {
      const box = candidate.getBoundingClientRect();
      const rightGap = shellBox.right - box.right;
      return box.width >= 240 && box.height >= 160 && rightGap >= -2 && rightGap <= 64;
    }) || null
    : null;
  for (const candidate of document.querySelectorAll(".weixin-skin-summary-panel")) {
    if (candidate !== summaryPanel) candidate.classList.remove("weixin-skin-summary-panel");
  }
  summaryPanel?.classList.add("weixin-skin-summary-panel");
  setFlag("data-weixin-summary-open", Boolean(summaryPanel));

  return {
    shellMain,
    settingsPanel,
    settingsContent,
    home,
    utilityPage,
    currentPageLabel,
    page,
    searchOpen: Boolean(searchDialog),
    summaryOpen: Boolean(summaryPanel),
  };
}

export const COMPATIBILITY_CONTRACT_VERSION = 1;

export const COMPATIBILITY_CONTEXTS = Object.freeze([
  {
    id: "shell",
    label: "App shell",
    always: true,
    required: [
      { name: "main surface", any: ["main.main-surface"] },
      { name: "session sidebar", any: ["aside.app-shell-left-panel"] },
      { name: "theme style", any: ["#codex-weixin-skin-style"] },
      { name: "WeChat navigation rail", any: [".weixin-skin-navrail"] },
    ],
  },
  {
    id: "conversation",
    label: "Conversation",
    when: [
      "html[data-weixin-page='conversation']",
      "main.main-surface:has([data-app-action-timeline-scroll])",
    ],
    required: [
      {
        name: "conversation timeline",
        any: ["[data-app-action-timeline-scroll]", "[data-thread-scroll-footer='true']"],
      },
      { name: "composer", any: [".composer-surface-chrome", "[data-codex-composer-root]"] },
    ],
  },
  {
    id: "search",
    label: "Global search",
    when: ["html[data-weixin-search-open='true']", ".global-command-menu-dialog"],
    required: [
      { name: "search dialog", any: [".global-command-menu-dialog"] },
      { name: "command root", any: [".global-command-menu-dialog [cmdk-root]"] },
      { name: "search input", any: [".global-command-menu-dialog [cmdk-input]"] },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    when: ["html[data-weixin-settings-open='true']"],
    required: [
      {
        name: "settings navigation",
        any: [".app-shell-left-panel:not(aside):has(input[role='searchbox'])"],
      },
      { name: "settings content", any: [".weixin-skin-settings-content"] },
    ],
  },
  ...["sites", "scheduled", "plugins"].map((page) => ({
    id: page,
    label: page === "sites" ? "Sites" : page === "scheduled" ? "Scheduled tasks" : "Plugins",
    when: [`html[data-weixin-page='${page}']`],
    required: [
      { name: `${page} surface`, any: [`main.main-surface.weixin-skin-page-${page}`] },
      { name: "active sidebar page", any: ["aside.app-shell-left-panel [aria-current='page']"] },
    ],
  })),
  {
    id: "pinned-summary",
    label: "Pinned summary",
    when: ["html[data-weixin-summary-open='true']"],
    required: [
      {
        name: "summary panel",
        any: ["main.main-surface .weixin-skin-summary-panel"],
      },
      { name: "thread footer", any: ["[data-thread-scroll-footer='true']"] },
    ],
  },
]);

/**
 * Evaluate the compatibility contract using a selector predicate. The function
 * is intentionally dependency-free because its source is also evaluated in the
 * Codex renderer during live verification.
 */
export function evaluateCompatibilityContracts(contexts, selectorExists) {
  const selectorErrors = [];
  const matches = (selector) => {
    try {
      return Boolean(selectorExists(selector));
    } catch (error) {
      selectorErrors.push({ selector, error: String(error?.message || error) });
      return false;
    }
  };
  const results = contexts.map((context) => {
    const active = Boolean(context.always || (context.when || []).some(matches));
    const requirements = (context.required || []).map((requirement) => {
      const matched = requirement.any.filter(matches);
      return {
        name: requirement.name,
        pass: matched.length > 0,
        matched,
        expected: requirement.any,
      };
    });
    return {
      id: context.id,
      label: context.label,
      active,
      pass: !active || requirements.every((requirement) => requirement.pass),
      requirements,
    };
  });
  const active = results.filter((context) => context.active);
  return {
    pass: selectorErrors.length === 0 && active.every((context) => context.pass),
    active: active.map((context) => context.id),
    contexts: results,
    selectorErrors,
    missing: active.flatMap((context) => context.requirements
      .filter((requirement) => !requirement.pass)
      .map((requirement) => ({ context: context.id, requirement: requirement.name }))),
  };
}

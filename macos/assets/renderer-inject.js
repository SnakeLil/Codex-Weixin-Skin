((cssText, artDataUrl, themeConfig) => {
  const STATE_KEY = "__CODEX_WEIXIN_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_WEIXIN_SKIN_DISABLED__";
  const STYLE_ID = "codex-weixin-skin-style";
  const CHROME_ID = "codex-weixin-skin-chrome";
  const SHELL_ATTR = "data-weixin-shell";
  const SETTINGS_ATTR = "data-weixin-settings-open";
  const ART_ATTRS = [
    "data-weixin-art-wide", "data-weixin-art-safe", "data-weixin-task-mode",
    "data-weixin-art-safe-area", "data-weixin-art-task-mode", "data-weixin-art-aspect",
    "data-weixin-art-ready",
  ];
  const VERSION = __WEIXIN_SKIN_VERSION_JSON__;
  const STYLE_REVISION = __WEIXIN_SKIN_STYLE_REVISION_JSON__;
  const PAYLOAD_REVISION = __WEIXIN_SKIN_PAYLOAD_REVISION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
  const ART_METADATA = THEME.artMetadata && typeof THEME.artMetadata === "object"
    ? THEME.artMetadata : null;
  const ANALYSIS_CACHE_KEY = "__CODEX_WEIXIN_SKIN_ANALYSIS_CACHE__";
  const THEME_VARIABLES = [
    "--wx-bg", "--wx-panel", "--wx-panel-2", "--wx-green", "--wx-lime",
    "--wx-cyan", "--wx-purple", "--wx-text", "--wx-muted", "--wx-line",
    "--wx-bg-rgb", "--wx-panel-rgb", "--wx-panel-2-rgb", "--wx-accent-rgb",
    "--wx-accent-alt-rgb", "--wx-secondary-rgb", "--wx-highlight-rgb",
    "--wx-text-rgb", "--wx-muted-rgb", "--wx-line-rgb",
    "--weixin-art-focus-x", "--weixin-art-focus-y", "--weixin-art-position",
    "--weixin-skin-focus-x", "--weixin-skin-focus-y", "--weixin-skin-art-position",
    "--weixin-skin-name", "--weixin-skin-tagline", "--weixin-skin-project-prefix",
    "--weixin-skin-project-label",
  ];
  const installToken = {};
  const existingAnalysisCache = window[ANALYSIS_CACHE_KEY];
  const analysisCache = existingAnalysisCache && typeof existingAnalysisCache.get === "function" &&
    typeof existingAnalysisCache.set === "function" ? existingAnalysisCache : new Map();
  window[ANALYSIS_CACHE_KEY] = analysisCache;
  let artAnalysis = typeof THEME.artKey === "string" ? analysisCache.get(THEME.artKey) ?? null : null;
  let analysisTimer = null;
  let samplingNativeShell = false;
  let rootObserver = null;
  const now = () => typeof performance === "object" && typeof performance.now === "function"
    ? performance.now() : Date.now();
  const metrics = {
    ensureCalls: 0,
    rootPasses: 0,
    routePasses: 0,
    layoutReads: 0,
    attributeWrites: 0,
    styleWrites: 0,
    textWrites: 0,
    analysisRuns: 0,
    analysisCacheHits: artAnalysis ? 1 : 0,
    firstEnsureMs: null,
    analysisMs: null,
  };
  window[DISABLED_KEY] = false;

  const previous = window[STATE_KEY];
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();

  if (previous?.observer) previous.observer.disconnect();
  if (previous?.rootObserver) previous.rootObserver.disconnect();
  if (previous?.resizeObserver) previous.resizeObserver.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(previous.scheduler.frame);
  }
  if (previous?.analysisTimer) clearTimeout(previous.analysisTimer);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  if (previous?.mediaHandler && previous?.mediaQuery) {
    try { previous.mediaQuery.removeEventListener("change", previous.mediaHandler); } catch {}
  }

  const cssString = (value) => JSON.stringify(String(value ?? ""));

  const setStyleProperty = (root, name, value) => {
    if (root.style.getPropertyValue(name) !== value) {
      root.style.setProperty(name, value);
      metrics.styleWrites += 1;
    }
  };

  const setAttribute = (root, name, value) => {
    const normalized = String(value);
    if (root.getAttribute(name) !== normalized) {
      root.setAttribute(name, normalized);
      metrics.attributeWrites += 1;
    }
  };

  const setTextContent = (node, value) => {
    if (node && node.textContent !== value) {
      node.textContent = value;
      metrics.textWrites += 1;
    }
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const hex = String(value).trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const number = Number.parseInt(hex[1], 16);
      return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
    }
    const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const rgbString = (value) => {
    const rgb = parseRgb(value);
    return rgb ? `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}` : null;
  };

  const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

  const rgbToHsl = ({ r, g, b }) => {
    const values = [r, g, b].map((value) => value / 255);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue;
    if (max === values[0]) hue = (values[1] - values[2]) / delta + (values[1] < values[2] ? 6 : 0);
    else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
    else hue = (values[0] - values[1]) / delta + 4;
    return { h: hue * 60, s: saturation, l: lightness };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const neutral = Math.round(l * 255);
      return { r: neutral, g: neutral, b: neutral };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset) => {
      let t = hue + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: channel(1 / 3) * 255, g: channel(0) * 255, b: channel(-1 / 3) * 255 };
  };

  const luminance = ({ r, g, b }) => {
    const lin = [r, g, b].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  /** Detect Codex app light/dark shell for CSS branching. */
  const detectShellMode = () => {
    const root = document.documentElement;
    const body = document.body;
    const cls = `${root.className || ""} ${body?.className || ""}`.toLowerCase();

    if (/\b(dark|theme-dark|appearance-dark)\b/.test(cls)) return "dark";
    if (/\b(light|theme-light|appearance-light)\b/.test(cls)) return "light";

    const dataTheme = (
      root.getAttribute("data-theme") ||
      root.getAttribute("data-appearance") ||
      root.getAttribute("data-color-mode") ||
      body?.getAttribute("data-theme") ||
      body?.getAttribute("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    // Radios in profile menu (if present in DOM)
    const checked = document.querySelector('input[name="appearance-theme"]:checked');
    if (checked) {
      const label = (checked.getAttribute("aria-label") || checked.value || "").toLowerCase();
      if (label.includes("暗") || label.includes("dark")) return "dark";
      if (label.includes("浅") || label.includes("light")) return "light";
      if (label.includes("系统") || label.includes("system")) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }

    // The skin itself declares color-scheme on :root.  Once installed,
    // reading getComputedStyle(root) directly would therefore keep `auto`
    // themes locked to the previous shell mode. Temporarily remove only our
    // own root class/attribute, sample the native computed scheme, then restore
    // synchronously. Mutation records created by this probe are drained below
    // so the root observer does not schedule a redundant ensure pass.
    try {
      const hadSkin = root.classList.contains("codex-weixin-skin");
      const savedShell = root.getAttribute(SHELL_ATTR);
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove("codex-weixin-skin");
      if (savedShell !== null) root.removeAttribute(SHELL_ATTR);
      let colorScheme = "";
      try {
        colorScheme = getComputedStyle(root).colorScheme || "";
      } finally {
        if (hadSkin) root.classList.add("codex-weixin-skin");
        if (savedShell !== null) root.setAttribute(SHELL_ATTR, savedShell);
        rootObserver?.takeRecords?.();
        samplingNativeShell = false;
      }
      if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
      if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
    } catch {
      samplingNativeShell = false;
    }

    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}

    // Only use surface luminance before the skin owns those surfaces. Sampling
    // our own translucent layers would create route-dependent light/dark flips.
    if (!root.classList.contains("codex-weixin-skin")) {
      const samples = [
        body,
        document.querySelector("main.main-surface"),
        document.querySelector("aside.app-shell-left-panel"),
      ].filter(Boolean);
      let votesLight = 0;
      let votesDark = 0;
      for (const el of samples) {
        try {
          const rgb = parseRgb(getComputedStyle(el).backgroundColor);
          if (!rgb) continue;
          const L = luminance(rgb);
          if (L >= 0.55) votesLight += 1;
          else if (L <= 0.25) votesDark += 1;
        } catch {}
      }
      if (votesLight > votesDark) return "light";
      if (votesDark > votesLight) return "dark";
    }
    return "light";
  };

  const makeAdaptivePalette = (sample, shell) => {
    const source = sample || { r: 108, g: 126, b: 136 };
    const hsl = rgbToHsl(source);
    const hue = hsl.s < 0.12 ? 214 : hsl.h;
    const saturation = clamp(hsl.s, 0.38, 0.72);
    const accent = hslToRgb({ h: hue, s: saturation, l: shell === "light" ? 0.42 : 0.66 });
    const accentAlt = hslToRgb({ h: hue + 12, s: saturation * 0.82, l: shell === "light" ? 0.52 : 0.73 });
    const secondary = hslToRgb({ h: hue - 24, s: saturation * 0.64, l: shell === "light" ? 0.56 : 0.62 });
    const highlight = hslToRgb({ h: hue + 24, s: saturation * 0.76, l: shell === "light" ? 0.36 : 0.58 });
    const neutral = (lightness, chroma = 0.08) => rgbToHex(hslToRgb({ h: hue, s: chroma, l: lightness }));
    return shell === "light" ? {
      background: neutral(0.965, 0.07),
      panel: neutral(0.987, 0.035),
      panelAlt: neutral(0.945, 0.09),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.13, 0.10),
      muted: neutral(0.42, 0.08),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .24)`,
    } : {
      background: neutral(0.055, 0.045),
      panel: neutral(0.085, 0.04),
      panelAlt: neutral(0.125, 0.05),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.93, 0.025),
      muted: neutral(0.69, 0.03),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .28)`,
    };
  };

  const resolvedShell = () => {
    if (THEME.appearance === "light" || THEME.appearance === "dark") return THEME.appearance;
    // Image luminance may tune accents and scrims, but auto appearance follows
    // Codex/ChatGPT (or the OS fallback) so a bright wallpaper cannot flip a
    // native dark session back to a light shell after analysis.
    return detectShellMode();
  };

  const applyTheme = (root, shell) => {
    const colors = THEME.colors || {};
    const explicit = new Set(Array.isArray(THEME.explicitColorKeys) ? THEME.explicitColorKeys : []);
    const adaptive = makeAdaptivePalette(artAnalysis?.accentRgb, shell);
    const legacyLight = !THEME.appearance && shell === "light";
    const structural = new Set(["background", "panel", "panelAlt", "text", "muted"]);
    const pick = (name) => {
      const allowExplicit = explicit.has(name) && !(legacyLight && structural.has(name));
      return allowExplicit && typeof colors[name] === "string" ? colors[name] : adaptive[name];
    };
    const accent = pick("accent");
    const accentAlt = explicit.has("accentAlt") ? pick("accentAlt") : (explicit.has("accent") ? accent : adaptive.accentAlt);
    const variables = {
      "--wx-bg": pick("background"),
      "--wx-panel": pick("panel"),
      "--wx-panel-2": pick("panelAlt"),
      "--wx-green": accent,
      "--wx-lime": accentAlt,
      "--wx-cyan": pick("secondary"),
      "--wx-purple": pick("highlight"),
      "--wx-text": pick("text"),
      "--wx-muted": pick("muted"),
      "--wx-line": explicit.has("line") && typeof colors.line === "string" ? colors.line : adaptive.line,
    };

    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string" && value) setStyleProperty(root, name, value);
    }
    const rgbVariables = {
      "--wx-bg-rgb": variables["--wx-bg"],
      "--wx-panel-rgb": variables["--wx-panel"],
      "--wx-panel-2-rgb": variables["--wx-panel-2"],
      "--wx-accent-rgb": variables["--wx-green"],
      "--wx-accent-alt-rgb": variables["--wx-lime"],
      "--wx-secondary-rgb": variables["--wx-cyan"],
      "--wx-highlight-rgb": variables["--wx-purple"],
      "--wx-text-rgb": variables["--wx-text"],
      "--wx-muted-rgb": variables["--wx-muted"],
      "--wx-line-rgb": variables["--wx-line"],
    };
    for (const [name, value] of Object.entries(rgbVariables)) {
      const rgb = rgbString(value);
      if (rgb) setStyleProperty(root, name, rgb);
    }
    setStyleProperty(root, "--weixin-skin-name", cssString(THEME.name || "Codex WeChat Skin"));
    setStyleProperty(root, "--weixin-skin-tagline", cssString(THEME.tagline || "Make something wonderful."));
    setStyleProperty(root, "--weixin-skin-project-prefix", cssString(THEME.projectPrefix || "选择项目 · "));
    setStyleProperty(root, "--weixin-skin-project-label", cssString(THEME.projectLabel || "◉  选择项目"));
  };

  const applyArtMetadata = (root) => {
    const profile = artAnalysis || ART_METADATA;
    const inferredSafe = profile?.safeArea || "center";
    const safeArea = ART.safeArea && ART.safeArea !== "auto" ? ART.safeArea : inferredSafe;
    const canonicalSafe = ["left", "right", "center", "none"].includes(safeArea)
      ? safeArea : "center";
    const focusX = typeof ART.focusX === "number" ? ART.focusX
      : profile?.focusX ?? (safeArea === "left" ? 0.72 : safeArea === "right" ? 0.28 : 0.5);
    const focusY = typeof ART.focusY === "number" ? ART.focusY : profile?.focusY ?? 0.5;
    const taskMode = ART.taskMode && ART.taskMode !== "auto"
      ? ART.taskMode : profile?.taskMode || "ambient";
    const wide = profile?.wide || false;
    const aspect = profile?.aspect || "unknown";
    const focusXValue = `${(clamp(focusX, 0, 1) * 100).toFixed(2)}%`;
    const focusYValue = `${(clamp(focusY, 0, 1) * 100).toFixed(2)}%`;

    setAttribute(root, "data-weixin-art-wide", wide ? "true" : "false");
    setAttribute(root, "data-weixin-art-safe", canonicalSafe);
    setAttribute(root, "data-weixin-task-mode", taskMode);
    setAttribute(root, "data-weixin-art-safe-area", safeArea);
    setAttribute(root, "data-weixin-art-task-mode", taskMode);
    setAttribute(root, "data-weixin-art-aspect", aspect);
    setAttribute(root, "data-weixin-art-ready", artAnalysis ? "true" : "false");
    setStyleProperty(root, "--weixin-art-focus-x", focusXValue);
    setStyleProperty(root, "--weixin-art-focus-y", focusYValue);
    setStyleProperty(root, "--weixin-art-position", `${focusXValue} ${focusYValue}`);
    setStyleProperty(root, "--weixin-skin-focus-x", focusXValue);
    setStyleProperty(root, "--weixin-skin-focus-y", focusYValue);
    setStyleProperty(root, "--weixin-skin-art-position", `${focusXValue} ${focusYValue}`);
  };

  const analyzeArt = () => new Promise((resolve) => {
    const startedAt = now();
    metrics.analysisRuns += 1;
    if (typeof window.Image !== "function" || !document?.createElement) {
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(null);
      return;
    }
    const image = new window.Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (analysisTimer) clearTimeout(analysisTimer);
      analysisTimer = null;
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(value);
    };
    analysisTimer = setTimeout(() => finish(null), 6000);
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const ratio = image.naturalWidth / image.naturalHeight;
        if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Invalid image dimensions");
        const maxDimension = 96;
        const width = Math.max(16, Math.round(ratio >= 1 ? maxDimension : maxDimension * ratio));
        const height = Math.max(16, Math.round(ratio >= 1 ? maxDimension / ratio : maxDimension));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const samples = new Array(width * height);
        const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
        let lightTotal = 0;
        let count = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            if (data[offset + 3] < 32) continue;
            const rgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
            const light = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
            const hsl = rgbToHsl(rgb);
            samples[y * width + x] = { light, saturation: hsl.s };
            lightTotal += light;
            count += 1;
            if (hsl.s >= 0.16 && hsl.l >= 0.16 && hsl.l <= 0.86) {
              const bin = bins[Math.min(23, Math.floor(hsl.h / 15))];
              const weight = hsl.s * (1 - Math.abs(hsl.l - 0.52) * 0.85);
              bin.weight += weight;
              bin.r += rgb.r * weight;
              bin.g += rgb.g * weight;
              bin.b += rgb.b * weight;
            }
          }
        }
        if (!count) throw new Error("Image has no visible pixels");
        const brightness = lightTotal / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let pixels = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = samples[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              pixels += 1;
              const previous = x > start ? samples[y * width + x - 1] : null;
              const above = y > 0 ? samples[(y - 1) * width + x] : null;
              if (previous) { edges += Math.abs(sample.light - previous.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = pixels ? total / pixels : 0;
          const variance = pixels ? Math.max(0, totalSquared / pixels - mean * mean) : 1;
          return Math.sqrt(variance) * 0.58 + (edgeCount ? edges / edgeCount : 1) * 0.42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * 0.38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * 0.86) safeArea = "left";
        else if (rightInformation < leftInformation * 0.86) safeArea = "right";

        let saliencyTotal = 0;
        let saliencyX = 0;
        let saliencyY = 0;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const sample = samples[y * width + x];
            if (!sample) continue;
            const previous = x > 0 ? samples[y * width + x - 1] : null;
            const above = y > 0 ? samples[(y - 1) * width + x] : null;
            const edge = (previous ? Math.abs(sample.light - previous.light) : 0) +
              (above ? Math.abs(sample.light - above.light) : 0);
            const weight = 0.01 + Math.abs(sample.light - brightness) * 0.48 +
              sample.saturation * 0.34 + edge * 0.28;
            saliencyTotal += weight;
            saliencyX += (x + 0.5) / width * weight;
            saliencyY += (y + 0.5) / height * weight;
          }
        }
        let focusX = saliencyTotal ? saliencyX / saliencyTotal : 0.5;
        let focusY = saliencyTotal ? saliencyY / saliencyTotal : 0.5;
        if (safeArea === "left") focusX = Math.max(0.64, focusX);
        if (safeArea === "right") focusX = Math.min(0.36, focusX);
        focusX = clamp(focusX, 0.12, 0.88);
        focusY = clamp(focusY, 0.18, 0.82);

        const accentBin = bins.reduce((best, candidate) => candidate.weight > best.weight ? candidate : best, bins[0]);
        const accentRgb = accentBin.weight > 0 ? {
          r: accentBin.r / accentBin.weight,
          g: accentBin.g / accentBin.weight,
          b: accentBin.b / accentBin.weight,
        } : null;
        const aspect = ratio >= 2.25 ? "ultrawide" : ratio >= 1.45 ? "wide"
          : ratio >= 1.08 ? "landscape" : ratio >= 0.9 ? "square" : "portrait";
        finish({
          width: image.naturalWidth,
          height: image.naturalHeight,
          ratio,
          wide: ratio >= 1.75,
          aspect,
          brightness,
          shell: brightness >= 0.58 ? "light" : "dark",
          safeArea,
          focusX,
          focusY,
          taskMode: ratio >= 2.25 ? "banner" : "ambient",
          accentRgb,
        });
      } catch {
        finish(null);
      }
    };
    image.src = artUrl;
  });

  let chromeParts = null;
  let observedShellMain = null;
  let resizeObserver = null;

  const ensureStyle = (root) => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = cssText;
      style.dataset.weixinSkinVersion = VERSION;
      (document.head || root).appendChild(style);
    } else if (style.dataset.weixinSkinStyleRevision !== STYLE_REVISION) {
      style.textContent = cssText;
    }
    style.dataset.weixinSkinVersion = VERSION;
    style.dataset.weixinSkinStyleRevision = STYLE_REVISION;
    return style;
  };

  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    ensureStyle(root);
    const shell = resolvedShell();
    setAttribute(root, SHELL_ATTR, shell);
    setStyleProperty(root, "--weixin-skin-art", `url("${artUrl}")`);
    applyTheme(root, shell);
    applyArtMetadata(root);
    root.classList.add("codex-weixin-skin");
    return shell;
  };

  const threadRowHasNativeUnreadTurn = (row) => {
    const indicators = row.querySelectorAll(
      '[style*="--vscode-textLink-foreground"], .bg-token-text-link-foreground',
    );
    return [...indicators].some((indicator) =>
      indicator.matches("span.rounded-full") ||
      indicator.querySelector?.("span.rounded-full"),
    );
  };

  const syncProjectUnreadState = () => {
    const projects = document.querySelectorAll(
      'aside.app-shell-left-panel [role="listitem"][data-sidebar-project-kind]',
    );
    for (const project of projects) {
      const unreadCount = [...project.querySelectorAll(
        "[data-app-action-sidebar-thread-row]",
      )].filter(threadRowHasNativeUnreadTurn).length;
      if (unreadCount > 0) {
        setAttribute(project, "data-weixin-unread", "true");
        setAttribute(project, "data-weixin-unread-count", unreadCount);
      } else {
        project.removeAttribute("data-weixin-unread");
        project.removeAttribute("data-weixin-unread-count");
      }
    }
  };

  const syncRouteState = (shell, { layout = false } = {}) => {
    metrics.routePasses += 1;
    const root = document.documentElement;
    if (!root) return;
    shell ||= root.getAttribute(SHELL_ATTR) || resolvedShell();
    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const settingsPanel = [...document.querySelectorAll(".app-shell-left-panel")].find(
      (candidate) => candidate.tagName !== "ASIDE" &&
        candidate.querySelector('input[role="searchbox"]'),
    );
    if (settingsPanel) {
      setAttribute(root, SETTINGS_ATTR, "true");
    } else {
      root.removeAttribute(SETTINGS_ATTR);
    }
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const home = homeIndicator?.closest('[role="main"]') ||
      [...document.querySelectorAll('[role="main"]')].find((candidate) =>
        candidate.querySelector('[data-feature="game-source"]') &&
        candidate.querySelector('[class*="home-suggestions"]')) || null;
    for (const candidate of document.querySelectorAll('[role="main"].weixin-skin-home')) {
      if (candidate !== home) candidate.classList.remove("weixin-skin-home");
    }
    if (home) home.classList.add("weixin-skin-home");
    const homeUtilityBars = new Set(home
      ? home.querySelectorAll('[class*="_homeUtilityBar_"]')
      : []);
    for (const candidate of document.querySelectorAll(".weixin-skin-home-utility")) {
      if (!homeUtilityBars.has(candidate)) candidate.classList.remove("weixin-skin-home-utility");
    }
    for (const candidate of homeUtilityBars) candidate.classList.add("weixin-skin-home-utility");

    if (!shellMain || !document.body) return;
    syncProjectUnreadState();
    if (observedShellMain !== shellMain) {
      resizeObserver?.disconnect();
      resizeObserver?.observe(shellMain);
      observedShellMain = shellMain;
      layout = true;
    }
    shellMain.classList.toggle("weixin-skin-home-shell", Boolean(home));
    let chrome = document.getElementById(CHROME_ID);
    let created = false;
    if (
      !chrome || chrome.parentElement !== document.body ||
      !chrome.querySelector(".weixin-skin-navrail") ||
      !chrome.querySelector(".weixin-skin-rail-avatar-image") ||
      chrome.querySelector(".weixin-skin-navrail")?.dataset.weixinRailRevision !== "2"
    ) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <nav class="weixin-skin-navrail" data-weixin-rail-revision="2" aria-label="微信主题快捷导航">
          <div class="weixin-skin-rail-avatar">
            <img class="weixin-skin-rail-avatar-image" alt="" referrerpolicy="no-referrer">
            <span class="weixin-skin-rail-avatar-fallback">微</span><i></i>
          </div>
          <div class="weixin-skin-rail-primary">
            <button type="button" class="is-active" data-weixin-action="new-task" title="新建任务" aria-label="新建任务">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.8C4 3.7 5.9 2 8.3 2h3.4C14.1 2 16 3.7 16 5.8v2.4c0 2.1-1.9 3.8-4.3 3.8H9l-3.7 2.5.8-3C4.8 10.8 4 9.6 4 8.2V5.8Z"/><path d="M11 12.5c.4 2 2.3 3.5 4.6 3.5H17l3.1 2-.6-2.6c.9-.7 1.5-1.8 1.5-3 0-1.9-1.6-3.5-3.8-3.9v.2c0 2.1-1.8 3.8-4.2 3.8h-2Z"/></svg>
            </button>
            <button type="button" data-weixin-action="projects" title="项目列表" aria-label="项目列表">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3.2"/><path d="M3.5 17c.5-3.2 2.4-5 5.5-5s5 1.8 5.5 5"/><path d="M16 8h5M16 12h5M16 16h4"/></svg>
            </button>
            <button type="button" data-weixin-action="plugins" title="插件" aria-label="插件">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 4-7 4-7-4 7-4Z"/><path d="m5 7 7 4 7-4v9l-7 4-7-4V7Z"/><path d="M12 11v9"/></svg>
            </button>
          </div>
          <div class="weixin-skin-rail-secondary">
            <button type="button" data-weixin-action="sites" title="站点" aria-label="站点"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="1.5"/><path d="M10 18h4"/></svg></button>
            <button type="button" data-weixin-action="profile" title="个人资料" aria-label="个人资料"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
          </div>
        </nav>
        <div class="weixin-skin-brand">
          <span class="weixin-skin-portal-mark">◉</span>
          <span><b></b><small></small></span>
        </div>
        <div class="weixin-skin-status"><i></i><span></span></div>
        <div class="weixin-skin-quote"></div>
        <div class="weixin-skin-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="weixin-skin-orbit"></div>`;
      document.body.appendChild(chrome);
      created = true;
      chromeParts = null;
    }
    chrome.removeAttribute("aria-hidden");
    if (!chromeParts || chromeParts.chrome !== chrome) {
      chromeParts = {
        chrome,
        name: chrome.querySelector(".weixin-skin-brand b"),
        subtitle: chrome.querySelector(".weixin-skin-brand small"),
        status: chrome.querySelector(".weixin-skin-status span"),
        quote: chrome.querySelector(".weixin-skin-quote"),
        railAvatar: chrome.querySelector(".weixin-skin-rail-avatar"),
        railAvatarImage: chrome.querySelector(".weixin-skin-rail-avatar-image"),
        railAvatarFallback: chrome.querySelector(".weixin-skin-rail-avatar-fallback"),
      };
    }
    setTextContent(chromeParts.name, THEME.name || "Codex WeChat Skin");
    setTextContent(chromeParts.subtitle, THEME.brandSubtitle || "CODEX WEIXIN SKIN");
    setTextContent(chromeParts.status, THEME.statusText || "WEIXIN SKIN ONLINE");
    setTextContent(chromeParts.quote, THEME.quote || "MAKE SOMETHING WONDERFUL");
    const profileButton = document.querySelector(
      'aside.app-shell-left-panel button[aria-label*="个人资料"], ' +
      'aside.app-shell-left-panel button[aria-label*="profile" i]',
    );
    const profileAvatar = profileButton?.querySelector('img[src]');
    const profileName = profileButton?.querySelector('span')?.textContent?.trim() || "";
    const avatarSource = profileAvatar?.currentSrc || profileAvatar?.src || "";
    if (avatarSource) {
      setAttribute(chromeParts.railAvatarImage, "src", avatarSource);
      setAttribute(chromeParts.railAvatar, "data-has-profile-avatar", "true");
      setAttribute(root, "data-weixin-profile-avatar", "true");
      setStyleProperty(root, "--wxs-user-avatar", `url(${JSON.stringify(avatarSource)})`);
    } else {
      chromeParts.railAvatarImage?.removeAttribute("src");
      chromeParts.railAvatar?.removeAttribute("data-has-profile-avatar");
      root.removeAttribute("data-weixin-profile-avatar");
      root.style.removeProperty("--wxs-user-avatar");
      const initials = profileName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
      setTextContent(chromeParts.railAvatarFallback, initials || "微");
    }
    const navrail = chrome.querySelector(".weixin-skin-navrail");
    if (navrail && navrail.__weixinSkinHandlerRevision !== PAYLOAD_REVISION) {
      if (navrail.__weixinSkinClickHandler) {
        navrail.removeEventListener("click", navrail.__weixinSkinClickHandler);
      }
      const nativeActionLabels = {
        "new-task": ["新建任务", "new task", "new chat"],
        plugins: ["插件", "plugin"],
        sites: ["站点", "site"],
        profile: ["个人资料", "profile"],
      };
      navrail.__weixinSkinClickHandler = (event) => {
        const shortcut = event.target.closest("button[data-weixin-action]");
        if (!shortcut) return;
        const action = shortcut.dataset.weixinAction;
        navrail.querySelectorAll("button[data-weixin-action]").forEach((button) => {
          button.classList.toggle("is-active", button === shortcut);
        });
        if (action === "projects") {
          const projectSection = document.querySelector(
            '[data-app-action-sidebar-section-heading="Projects"]',
          );
          if (!projectSection) {
            shortcut.dataset.weixinUnavailable = "true";
            setTimeout(() => delete shortcut.dataset.weixinUnavailable, 500);
            return;
          }
          projectSection.scrollIntoView({ behavior: "smooth", block: "start" });
          try {
            projectSection.animate([
              { backgroundColor: "transparent" },
              { backgroundColor: "rgba(7, 193, 96, .12)" },
              { backgroundColor: "transparent" },
            ], { duration: 560, easing: "ease-out" });
          } catch {}
          return;
        }
        const labels = nativeActionLabels[action] || [];
        const nativeButtons = [...document.querySelectorAll(
          "aside.app-shell-left-panel button, aside.app-shell-left-panel a",
        )];
        const nativeTarget = nativeButtons.find((candidate) => {
          const label = `${candidate.getAttribute("aria-label") || ""} ${candidate.textContent || ""}`
            .trim()
            .toLowerCase();
          return labels.some((needle) => label.includes(needle));
        });
        if (!nativeTarget) {
          shortcut.dataset.weixinUnavailable = "true";
          setTimeout(() => delete shortcut.dataset.weixinUnavailable, 500);
          return;
        }
        nativeTarget.click();
      };
      navrail.addEventListener("click", navrail.__weixinSkinClickHandler);
      navrail.__weixinSkinHandlerRevision = PAYLOAD_REVISION;
    }
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
      shellMain.classList.toggle(`weixin-skin-page-${page}`, utilityPage === page);
    }
    if (navrail) {
      let activeRailAction = "new-task";
      if (currentPageLabel.includes("插件") || currentPageLabel.includes("plugin")) {
        activeRailAction = "plugins";
      } else if (currentPageLabel.includes("站点") || currentPageLabel.includes("site")) {
        activeRailAction = "sites";
      } else if (
        currentPageLabel.includes("已安排") ||
        currentPageLabel.includes("scheduled")
      ) {
        activeRailAction = null;
      }
      navrail.querySelectorAll("button[data-weixin-action]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.weixinAction === activeRailAction);
      });
    }
    if (layout || created) {
      metrics.layoutReads += 1;
      const shellBox = shellMain.getBoundingClientRect();
      setStyleProperty(chrome, "left", `${Math.round(shellBox.left)}px`);
      setStyleProperty(chrome, "top", `${Math.round(shellBox.top)}px`);
      setStyleProperty(chrome, "width", `${Math.round(shellBox.width)}px`);
      setStyleProperty(chrome, "height", `${Math.round(shellBox.height)}px`);
    }
    chrome.classList.toggle("weixin-skin-home-shell", Boolean(home));
    if (chrome.dataset.weixinShell !== shell) {
      chrome.dataset.weixinShell = shell;
      metrics.attributeWrites += 1;
    }
  };

  const ensure = ({ root: rootPass = true, route = true, layout = true } = {}) => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    metrics.ensureCalls += 1;
    const shell = rootPass ? applyRootState(root) : null;
    if (route) syncRouteState(shell, { layout });
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    document.documentElement?.classList.remove("codex-weixin-skin");
    document.documentElement?.removeAttribute(SHELL_ATTR);
    document.documentElement?.removeAttribute(SETTINGS_ATTR);
    for (const name of ART_ATTRS) document.documentElement?.removeAttribute(name);
    document.documentElement?.style.removeProperty("--weixin-skin-art");
    for (const name of THEME_VARIABLES) document.documentElement?.style.removeProperty(name);
    document.querySelectorAll(".weixin-skin-home").forEach((node) => node.classList.remove("weixin-skin-home"));
    document.querySelectorAll(".weixin-skin-home-shell").forEach((node) => node.classList.remove("weixin-skin-home-shell"));
    document.querySelectorAll(".weixin-skin-home-utility").forEach((node) => node.classList.remove("weixin-skin-home-utility"));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    state?.observer?.disconnect();
    state?.rootObserver?.disconnect();
    state?.resizeObserver?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.scheduler.frame);
    }
    if (analysisTimer) clearTimeout(analysisTimer);
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null, frame: null, root: false, route: false, layout: false };
  const flushScheduledEnsure = () => {
    if (scheduler.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scheduler.frame);
    }
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.frame = null;
    scheduler.timeout = null;
    const pending = { root: scheduler.root, route: scheduler.route, layout: scheduler.layout };
    scheduler.root = false;
    scheduler.route = false;
    scheduler.layout = false;
    ensure(pending);
  };
  const scheduleEnsure = ({ root = false, route = true, layout = false } = {}) => {
    scheduler.root ||= root;
    scheduler.route ||= route;
    scheduler.layout ||= layout;
    if (scheduler.timeout || scheduler.frame !== null) return;
    if (typeof requestAnimationFrame === "function") {
      scheduler.frame = requestAnimationFrame(flushScheduledEnsure);
      scheduler.timeout = setTimeout(flushScheduledEnsure, 96);
    } else {
      scheduler.timeout = setTimeout(flushScheduledEnsure, 64);
    }
  };
  const observer = new MutationObserver(() => scheduleEnsure({ route: true }));
  rootObserver = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure({ root: true, route: true });
  });
  const resizeHandler = () => scheduleEnsure({ route: true, layout: true });
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => scheduleEnsure({ route: true, layout: true }));
  }

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure({ root: true, route: true });
  } catch {}

  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    rootObserver,
    resizeObserver,
    timer: null,
    scheduler,
    resizeHandler,
    mediaQuery,
    mediaHandler,
    artUrl,
    installToken,
    analysis: artAnalysis,
    artMetadata: ART_METADATA,
    metrics,
    version: VERSION,
    themeId: THEME.id || "custom",
    revision: PAYLOAD_REVISION,
    detectShellMode,
  };
  const firstEnsureStartedAt = now();
  ensure({ layout: !previous || !document.getElementById(CHROME_ID) });
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));
  if (previous?.artUrl && previous.artUrl !== artUrl) URL.revokeObjectURL(previous.artUrl);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  rootObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
  });
  if (document.body) {
    rootObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
    });
  }
  const timer = setInterval(() => ensure(), 4000);
  window[STATE_KEY].timer = timer;
  window.addEventListener("resize", resizeHandler, { passive: true });
  if (mediaHandler && mediaQuery) {
    mediaQuery.addEventListener("change", mediaHandler);
  }
  const analysisPromise = artAnalysis ? Promise.resolve(null) : analyzeArt();
  window[STATE_KEY].analysisTimer = analysisTimer;
  analysisPromise.then((analysis) => {
    const state = window[STATE_KEY];
    if (!analysis || state?.installToken !== installToken || window[DISABLED_KEY]) return;
    artAnalysis = analysis;
    state.analysis = analysis;
    if (typeof THEME.artKey === "string") {
      analysisCache.set(THEME.artKey, analysis);
      while (analysisCache.size > 8) analysisCache.delete(analysisCache.keys().next().value);
    }
    ensure({ root: true, route: false, layout: false });
  }).catch(() => {});
  return {
    installed: true,
    version: VERSION,
    themeId: THEME.id || "custom",
    revision: PAYLOAD_REVISION,
    shell: resolvedShell(),
    analysis: artAnalysis,
  };
})(__WEIXIN_SKIN_CSS_JSON__, __WEIXIN_SKIN_ART_JSON__, __WEIXIN_SKIN_THEME_JSON__)

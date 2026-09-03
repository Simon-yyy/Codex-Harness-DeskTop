const { contextBridge, ipcRenderer } = require("electron");

// ---------------------------------------------------------------------------
// 源自 VS Code escook 经典美学体系 4 套主题 (Codex Desktop 原生全量移植)
// 包含 WCAG 级高对比度调优，杜绝任何主题下的文字淹没问题
// ---------------------------------------------------------------------------
const ESCOOK_THEMES = {
  "dark": {
    name: "escook Dark (经典暗色)",
    desc: "经典暖色调，高对比度配色",
    type: "dark",
    colorPreview: "#EF820C",
    bgPreview: "#252526",
    vars: {
      "--bg-base": "#252526",
      "--bg-sidebar": "#1e1e1e",
      "--bg-card": "#2d2d30",
      "--bg-card-elevated": "#333337",
      "--bg-hover": "rgba(255, 255, 255, 0.08)",
      "--bg-active": "rgba(239, 130, 12, 0.16)",
      "--text-primary": "#ffffff",
      "--text-secondary": "#d4d4d8",
      "--text-dimmed": "#a1a1aa",
      "--accent": "#EF820C",
      "--accent-secondary": "#ff9940",
      "--accent-warm": "#f6ad55",
      "--accent-green": "#4ade80",
      "--border": "#3e3e42",
      "--border-light": "#4e4e52",
      "--code-bg": "#181818"
    }
  },
  "dark-soft": {
    name: "escook Dark Soft (柔和暗色)",
    desc: "冷灰色系，持久舒适",
    type: "dark",
    colorPreview: "#ffcc66",
    bgPreview: "#1f2430",
    vars: {
      "--bg-base": "#1f2430",
      "--bg-sidebar": "#171b24",
      "--bg-card": "#262b3a",
      "--bg-card-elevated": "#2d3345",
      "--bg-hover": "rgba(255, 204, 102, 0.08)",
      "--bg-active": "rgba(255, 204, 102, 0.15)",
      "--text-primary": "#f8fafc",
      "--text-secondary": "#cbd5e1",
      "--text-dimmed": "#94a3b8",
      "--accent": "#ffcc66",
      "--accent-secondary": "#fac761",
      "--accent-warm": "#f6ad55",
      "--accent-green": "#4ade80",
      "--border": "#374151",
      "--border-light": "#4b5563",
      "--code-bg": "#131720"
    }
  },
  "light": {
    name: "escook Light (暖色调亮)",
    desc: "莎皮纸色系，素雅温和",
    type: "light",
    colorPreview: "#705697",
    bgPreview: "#FDF6E3",
    vars: {
      "--bg-base": "#FDF6E3",
      "--bg-sidebar": "#F4EBD0",
      "--bg-card": "#EBE0C5",
      "--bg-card-elevated": "#E2D5B5",
      "--bg-hover": "rgba(112, 86, 151, 0.1)",
      "--bg-active": "rgba(112, 86, 151, 0.16)",
      "--text-primary": "#1e293b",
      "--text-secondary": "#334155",
      "--text-dimmed": "#475569",
      "--accent": "#705697",
      "--accent-secondary": "#8a6ab8",
      "--accent-warm": "#b45309",
      "--accent-green": "#15803d",
      "--border": "#cfc5ab",
      "--border-light": "#beaf90",
      "--code-bg": "#eee4ca"
    }
  },
  "light-soft": {
    name: "escook Light Soft (柔和亮色)",
    desc: "高透白底，冷感光调",
    type: "light",
    colorPreview: "#ea580c",
    bgPreview: "#FAFAFA",
    vars: {
      "--bg-base": "#FAFAFA",
      "--bg-sidebar": "#F1F5F9",
      "--bg-card": "#FFFFFF",
      "--bg-card-elevated": "#F8FAFC",
      "--bg-hover": "rgba(0, 0, 0, 0.05)",
      "--bg-active": "rgba(234, 88, 12, 0.12)",
      "--text-primary": "#0f172a",
      "--text-secondary": "#334155",
      "--text-dimmed": "#475569",
      "--accent": "#ea580c",
      "--accent-secondary": "#f97316",
      "--accent-warm": "#d97706",
      "--accent-green": "#16a34a",
      "--border": "#E2E8F0",
      "--border-light": "#CBD5E1",
      "--code-bg": "#F1F5F9"
    }
  }
};

let currentThemeStyle = null;

function applyTheme(themeKey) {
  const validKey = ESCOOK_THEMES[themeKey] ? themeKey : "dark-soft";
  const theme = ESCOOK_THEMES[validKey];

  if (!currentThemeStyle) {
    currentThemeStyle = document.createElement("style");
    currentThemeStyle.id = "codex-desktop-theme";
    document.head.appendChild(currentThemeStyle);
  }

  let cssVars = "";
  for (const [k, v] of Object.entries(theme.vars)) {
    cssVars += `${k}: ${v} !important;\n`;
  }

  currentThemeStyle.textContent = `
    :root {
      ${cssVars}
    }
    body {
      background-color: var(--bg-base) !important;
      color: var(--text-primary) !important;
    }
  `;

  document.documentElement.setAttribute("data-theme", validKey);
  try {
    localStorage.setItem("codex_desktop_theme", validKey);
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// 原生滚轮穿透 (全局修复)
// ---------------------------------------------------------------------------
function initWheelPenetration() {
  window.addEventListener("wheel", (e) => {
    let target = e.target;
    while (target && target !== document.body && target !== document.documentElement) {
      const style = window.getComputedStyle(target);
      const overflowY = style.overflowY;
      const canScrollY = (overflowY === "auto" || overflowY === "scroll") && target.scrollHeight > target.clientHeight;
      if (canScrollY) return;
      target = target.parentElement;
    }
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// Native Context Bridge API
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld("codexDesktop", {
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  getSkills: () => ipcRenderer.invoke("get-skills"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates-manual"),
  startDownloadUpdate: (payload) => ipcRenderer.invoke("start-download-update-action", payload),
  detectCoreStatus: () => ipcRenderer.invoke("detect-core-status"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  saveTempImage: (base64) => ipcRenderer.invoke("save-temp-image", base64),
  getThemes: () => ESCOOK_THEMES,
  setTheme: (key) => applyTheme(key),
  getCurrentTheme: () => {
    try {
      return localStorage.getItem("codex_desktop_theme") || "dark-soft";
    } catch (e) {
      return "dark-soft";
    }
  },
  callLlmApi: (payload) => ipcRenderer.invoke('call-llm-api', payload),
  onLlmStreamChunk: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("llm-stream-chunk", handler);
    return () => ipcRenderer.removeListener("llm-stream-chunk", handler);
  },
  onThemeChange: (callback) => {
    ipcRenderer.on("theme-change", (_event, theme) => callback(theme));
  },
  onMenuAction: (callback) => {
    ipcRenderer.on("menu-action", (_event, action) => callback(action));
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update-available", (_event, data) => callback(data));
  },
  onUpdateDownloading: (callback) => {
    ipcRenderer.on("update-downloading", (_event, data) => callback(data));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on("update-progress", (_event, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("update-downloaded", (_event, data) => callback(data));
  }
});

// 初始化主题
window.addEventListener("DOMContentLoaded", () => {
  let saved = "dark-soft";
  try {
    saved = localStorage.getItem("codex_desktop_theme") || "dark-soft";
  } catch (e) {}
  applyTheme(saved);
  initWheelPenetration();
});
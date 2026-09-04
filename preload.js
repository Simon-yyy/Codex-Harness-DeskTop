const { contextBridge, ipcRenderer } = require("electron");

// ---------------------------------------------------------------------------
// 源自 VS Code escook 经典美学体系 4 套主题 (Codex Desktop 原生全量移植)
// 包含 WCAG 级高对比度调优，杜绝任何主题下的文字淹没问题
// ---------------------------------------------------------------------------
const ESCOOK_THEMES = {
  "dark": {
    name: "escook Dark (经典暗色)",
    desc: "经典暖调极客深灰 · 彬哥标志性暖阳橙",
    type: "dark",
    colorPreview: "#EF820C",
    bgPreview: "#252526",
    vars: {
      "--bg-base": "#252526",
      "--bg-sidebar": "#202021",
      "--bg-card": "#29292c",
      "--bg-card-elevated": "#2f2f33",
      "--bg-hover": "rgba(255, 255, 255, 0.08)",
      "--bg-active": "rgba(239, 130, 12, 0.16)",
      "--text-primary": "#fafafa",
      "--text-secondary": "#cccccc",
      "--text-dimmed": "#888888",
      "--accent": "#EF820C",
      "--accent-secondary": "#ff9940",
      "--accent-warm": "#ffcc00",
      "--accent-green": "#10b981",
      "--border": "#333333",
      "--border-light": "#2a2a2a",
      "--code-bg": "#1c1c1d"
    }
  },
  "dark-soft": {
    name: "escook Dark Soft (柔和暗色)",
    desc: "Ayu 经典深海蓝灰 · 温润柔光奶杏黄",
    type: "dark",
    colorPreview: "#ffcc66",
    bgPreview: "#1f2430",
    vars: {
      "--bg-base": "#1f2430",
      "--bg-sidebar": "#191e28",
      "--bg-card": "#232834",
      "--bg-card-elevated": "#2b3140",
      "--bg-hover": "rgba(255, 255, 255, 0.07)",
      "--bg-active": "rgba(255, 204, 102, 0.15)",
      "--text-primary": "#cbccc6",
      "--text-secondary": "#969aa4",
      "--text-dimmed": "#707a8c",
      "--accent": "#ffcc66",
      "--accent-secondary": "#fac761",
      "--accent-warm": "#ffd580",
      "--accent-green": "#7fd962",
      "--border": "#373e4c",
      "--border-light": "#2d3340",
      "--code-bg": "#171b24"
    }
  },
  "light": {
    name: "escook Light (暖色调亮)",
    desc: "Solarized 护眼暖米白 · 典雅紫罗兰",
    type: "light",
    colorPreview: "#705697",
    bgPreview: "#FDF6E3",
    vars: {
      "--bg-base": "#FDF6E3",
      "--bg-sidebar": "#f8f0d8",
      "--bg-card": "#ffffff",
      "--bg-card-elevated": "#f4ecce",
      "--bg-hover": "rgba(112, 86, 151, 0.08)",
      "--bg-active": "rgba(112, 86, 151, 0.15)",
      "--text-primary": "#586e75",
      "--text-secondary": "#657b83",
      "--text-dimmed": "#93a1a1",
      "--accent": "#705697",
      "--accent-secondary": "#876cad",
      "--accent-warm": "#ff9940",
      "--accent-green": "#2aa198",
      "--border": "#e3dac6",
      "--border-light": "#ece3cf",
      "--code-bg": "#f5eed8"
    }
  },
  "light-soft": {
    name: "escook Light Soft (柔和亮色)",
    desc: "现代极简清透浅灰 · 柔和活力橙",
    type: "light",
    colorPreview: "#ff9940",
    bgPreview: "#FAFAFA",
    vars: {
      "--bg-base": "#FAFAFA",
      "--bg-sidebar": "#f2f2f2",
      "--bg-card": "#ffffff",
      "--bg-card-elevated": "#eaeaea",
      "--bg-hover": "rgba(0, 0, 0, 0.05)",
      "--bg-active": "rgba(255, 153, 64, 0.12)",
      "--text-primary": "#2d3748",
      "--text-secondary": "#4a5568",
      "--text-dimmed": "#718096",
      "--accent": "#ff9940",
      "--accent-secondary": "#f58220",
      "--accent-warm": "#ef820c",
      "--accent-green": "#38a169",
      "--border": "#dcdcdc",
      "--border-light": "#e8e8e8",
      "--code-bg": "#f0f2f5"
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
  selectWorkspaceDir: () => ipcRenderer.invoke("select-workspace-dir"),
  setWorkspaceDir: (dirPath) => ipcRenderer.invoke("set-workspace-dir", dirPath),
  readWorkspaceTree: (dirPath) => ipcRenderer.invoke("read-workspace-tree", dirPath),
  getSecurityStatus: () => ipcRenderer.invoke("get-security-status"),
  setPermissionMode: (mode) => ipcRenderer.invoke("set-permission-mode", mode),
  readWorkspaceFile: (relativePath) => ipcRenderer.invoke("read-workspace-file", { relativePath }),
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
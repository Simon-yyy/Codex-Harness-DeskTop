const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const { spawn } = require("child_process");

let mainWindow = null;
let isDownloadingUpdate = false;
let isQuitting = false;

// ---------------------------------------------------------------------------
// 自动初始化并热同步内置技能 (35 个 Matt Pocock 技能 + 8 个 Loop Engineering 技能)
// ---------------------------------------------------------------------------
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath) || fs.statSync(srcPath).size !== fs.statSync(destPath).size) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function initBuiltinSkills() {
  try {
    const userHome = os.homedir();
    const targetDir = path.join(userHome, ".codex", "skills");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const sourceSkillsDir = path.join(__dirname, ".agents", "skills");
    let syncedCount = 0;
    if (fs.existsSync(sourceSkillsDir)) {
      const skills = fs.readdirSync(sourceSkillsDir, { withFileTypes: true });
      for (const s of skills) {
        if (s.isDirectory()) {
          const srcPath = path.join(sourceSkillsDir, s.name);
          const destPath = path.join(targetDir, s.name);
          copyDirRecursive(srcPath, destPath);
          syncedCount++;
        }
      }
      process.stdout.write(`[codex-desktop] ✓ 自动增量热同步 ${syncedCount} 个技能到: ${targetDir}\n`);
    }
  } catch (err) {
    console.error("[codex-desktop] 部署技能库异常:", err);
  }
}

// ---------------------------------------------------------------------------
// 创建全中文、全功能联动的专业常驻应用菜单
// ---------------------------------------------------------------------------
function createApplicationMenu() {
  const template = [
    {
      label: "文件 (&F)",
      submenu: [
        {
          label: "新建会话",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            if (mainWindow) mainWindow.webContents.send("menu-action", "new-chat");
          }
        },
        { type: "separator" },
        {
          label: "模型服务商设置...",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            if (mainWindow) mainWindow.webContents.send("menu-action", "open-settings");
          }
        },
        { type: "separator" },
        {
          label: "退出 Codex Desktop",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: "编辑 (&E)",
      submenu: [
        { label: "撤销", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "重做", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: "剪切", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "复制", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "粘贴", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "全选", accelerator: "CmdOrCtrl+A", role: "selectAll" }
      ]
    },
    {
      label: "视图 (&V)",
      submenu: [
        { label: "重新加载", accelerator: "CmdOrCtrl+R", role: "reload" },
        { label: "强制重新加载", accelerator: "Shift+CmdOrCtrl+R", role: "forceReload" },
        { type: "separator" },
        { label: "切换全屏", accelerator: "F11", role: "togglefullscreen" },
        { label: "实际大小", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
        { label: "放大", accelerator: "CmdOrCtrl+=", role: "zoomIn" },
        { label: "缩小", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
        { type: "separator" },
        { label: "开发者工具", accelerator: "CmdOrCtrl+Shift+I", role: "toggleDevTools" }
      ]
    },
    {
      label: "主题 (&T)",
      submenu: [
        {
          label: "escook Dark (经典暗色)",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("menu-action", "theme:dark");
              mainWindow.webContents.send("theme-change", "dark");
            }
          }
        },
        {
          label: "escook Dark Soft (柔和暗色)",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("menu-action", "theme:dark-soft");
              mainWindow.webContents.send("theme-change", "dark-soft");
            }
          }
        },
        {
          label: "escook Light (暖色调亮)",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("menu-action", "theme:light");
              mainWindow.webContents.send("theme-change", "light");
            }
          }
        },
        {
          label: "escook Light Soft (柔和亮色)",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("menu-action", "theme:light-soft");
              mainWindow.webContents.send("theme-change", "light-soft");
            }
          }
        }
      ]
    },
    {
      label: "帮助 (&H)",
      submenu: [
        {
          label: "检查新版本更新...",
          click: () => checkForUpdates(false)
        },
        {
          label: "提交 Bug 报告与反馈...",
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => {
            if (mainWindow) mainWindow.webContents.send("menu-action", "open-feedback");
          }
        },
        {
          label: "关于 Codex Desktop",
          click: () => {
            if (mainWindow) mainWindow.webContents.send("menu-action", "open-about");
          }
        },
        { type: "separator" },
        {
          label: "GitHub 开源仓库",
          click: () => shell.openExternal("https://github.com/Simon-yyy/Codex-Harness-DeskTop")
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// 主窗口创建
// ---------------------------------------------------------------------------
function createWindow() {
  createApplicationMenu();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Codex Desktop",
    icon: path.join(__dirname, "assets", "icon.png"),
    frame: true,
    autoHideMenuBar: false, // 顶部菜单栏常驻显示
    show: false,
    backgroundColor: "#1f2430",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: true
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    process.stdout.write(`[Renderer Console] [L${level}] ${message} (at ${sourceId}:${line})\n`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    process.stderr.write(`[Renderer Load Fail] ${errorCode}: ${errorDescription} (${validatedURL})\n`);
  });

  const distIndexPath = path.join(__dirname, "ui", "dist", "index.html");
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(distIndexPath).catch(() => {
      mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));
    });
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    initBuiltinSkills();

    // 启动 3 秒后在后台静默自动检查客户端更新
    setTimeout(() => {
      checkForUpdates(true);
    }, 3000);
  });

  // 处理外部链接，防止在应用内跳出
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// In-App Auto Updater (GitHub Releases)
// ---------------------------------------------------------------------------
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const getOptions = { headers: { "User-Agent": "cline/3.0.0" } };

    function doGet(targetUrl) {
      https.get(targetUrl, getOptions, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doGet(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(destPath, () => {});
          return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }

        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        let downloadedBytes = 0;

        res.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          file.write(chunk);
          if (totalBytes > 0 && onProgress) {
            const percent = Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100));
            onProgress(percent, downloadedBytes, totalBytes);
          }
        });

        res.on("end", () => {
          file.end();
          resolve(destPath);
        });

        res.on("error", (err) => {
          file.close();
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on("error", (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }

    doGet(url);
  });
}

function isNewerVersion(remote, local) {
  if (!remote || !local) return false;
  const parse = v => String(v).replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
  const [r1, r2, r3] = parse(remote);
  const [l1, l2, l3] = parse(local);
  if (r1 > l1) return true;
  if (r1 < l1) return false;
  if (r2 > l2) return true;
  if (r2 < l2) return false;
  return r3 > l3;
}

function checkForUpdates(isSilent = false) {
  if (isDownloadingUpdate) {
    if (!isSilent) {
      dialog.showMessageBox(mainWindow || null, {
        type: "info",
        title: "更新正在下载中",
        message: "新版本安装包正在后台下载，请稍候...",
        buttons: ["知道了"]
      });
    }
    return;
  }

  const options = {
    hostname: "api.github.com",
    path: "/repos/Simon-yyy/Codex-Harness-DeskTop/releases/latest",
    headers: { "User-Agent": "cline/3.0.0" }
  };

  https.get(options, (res) => {
    let body = "";
    res.on("data", (d) => body += d);
    res.on("end", () => {
      try {
        if (res.statusCode !== 200) {
          if (!isSilent) {
            let tip = `无法连接或未找到远程发布版本 (HTTP ${res.statusCode})。\n当前本地版本: v${app.getVersion()}`;
            if (res.statusCode === 403) {
              tip = `GitHub API 访问频次受限 (HTTP 403)。\n请稍后再试，或直接通过【关于】页面的 GitHub 仓库链接获取最新版本！\n当前本地版本: v${app.getVersion()}`;
            }
            dialog.showMessageBox(mainWindow || null, {
              type: "info",
              title: "检查更新",
              message: tip,
              buttons: ["确定"]
            });
          }
          return;
        }

        const data = JSON.parse(body);
        const latestTag = (data.tag_name || "").replace(/^v/, "");
        const currentVer = app.getVersion();

        if (latestTag && isNewerVersion(latestTag, currentVer)) {
          const exeAsset = (data.assets || []).find((a) => a.name && a.name.endsWith(".exe"));
          const downloadUrl = exeAsset ? exeAsset.browser_download_url : "";

          // 向渲染进程广播更新就绪事件
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("update-available", {
              currentVersion: currentVer,
              latestVersion: latestTag,
              body: data.body || "常规性能提升与体验优化。",
              downloadUrl: downloadUrl
            });
          }

          // 如果是用户主动手动点击检查更新，弹出对话框
          if (!isSilent) {
            dialog.showMessageBox(mainWindow || null, {
              type: "info",
              title: "🎉 发现全新版本",
              message: `发现 Codex Desktop 全新版本 v${latestTag}（当前版本: v${currentVer}）！\n\n更新说明：\n${data.body || "常规性能提升与体验优化。"}`,
              buttons: ["⚡ 立即在应用内下载升级", "稍后再说"],
              defaultId: 0
            }).then(({ response }) => {
              if (response === 0 && downloadUrl) {
                startDownloadUpdate(downloadUrl, latestTag);
              }
            });
          }
        } else if (!isSilent) {
          dialog.showMessageBox(mainWindow || null, {
            type: "info",
            title: "检查更新",
            message: `当前已是最新版本 (v${currentVer})，无需更新。`,
            buttons: ["确定"]
          });
        }
      } catch (err) {
        if (!isSilent) {
          dialog.showMessageBox(mainWindow || null, {
            type: "error",
            title: "检查更新失败",
            message: `解析更新数据异常: ${err.message}`,
            buttons: ["确定"]
          });
        }
      }
    });
  }).on("error", (err) => {
    if (!isSilent) {
      dialog.showMessageBox(mainWindow || null, {
        type: "error",
        title: "网络异常",
        message: `无法连接更新服务器: ${err.message}`,
        buttons: ["确定"]
      });
    }
  });
}

function startDownloadUpdate(assetUrl, newVersion) {
  if (isDownloadingUpdate) return;
  isDownloadingUpdate = true;
  const tempDir = os.tmpdir();
  const installerPath = path.join(tempDir, `Codex-Desktop-Setup-${newVersion}.exe`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-downloading", { version: newVersion });
  }

  downloadFile(assetUrl, installerPath, (percent, downloadedBytes, totalBytes) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-progress", { percent, downloadedBytes, totalBytes });
    }
  }).then(() => {
    isDownloadingUpdate = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-downloaded", { version: newVersion, installerPath });
    }
    dialog.showMessageBox(mainWindow || null, {
      type: "info",
      title: "🎉 下载完成",
      message: `v${newVersion} 安装包已下载完成！\n点击确定后应用将自动退出并启动安装升级。`,
      buttons: ["立即安装升级"],
      defaultId: 0
    }).then(() => {
      try {
        spawn(installerPath, ["--updated"], {
          detached: true,
          stdio: "ignore"
        }).unref();
        isQuitting = true;
        app.quit();
      } catch (err) {
        dialog.showErrorBox("启动安装程序失败", `无法自动执行安装包: ${err.message}`);
      }
    });
  }).catch((err) => {
    isDownloadingUpdate = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-error", { error: err.message });
    }
    dialog.showMessageBox(mainWindow || null, {
      type: "error",
      title: "更新下载失败",
      message: `下载更新包遇到错误: ${err.message}`,
      buttons: ["确定"]
    });
  });
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------
ipcMain.handle("get-app-info", () => {
  let count = 43;
  try {
    const sourceSkillsDir = path.join(__dirname, ".agents", "skills");
    if (fs.existsSync(sourceSkillsDir)) {
      count = fs.readdirSync(sourceSkillsDir).filter((s) => fs.statSync(path.join(sourceSkillsDir, s)).isDirectory()).length;
    }
  } catch (e) {}

  return {
    version: app.getVersion(),
    name: "Codex Desktop",
    harness: "OpenAI Codex Harness (Native Multimodal & Dual-Track Auto-Update)",
    skillsCount: count,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch
  };
});

ipcMain.handle("get-skills", async () => {
  const skills = [];
  try {
    const skillsDir = path.join(__dirname, ".agents", "skills");
    if (fs.existsSync(skillsDir)) {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
          if (fs.existsSync(skillFile)) {
            const raw = fs.readFileSync(skillFile, "utf8");
            let name = entry.name;
            let desc = "OpenAI Codex 工业级工程技能";
            let content = raw;

            // 解析 YAML frontmatter
            const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
            if (fmMatch) {
              const fm = fmMatch[1];
              content = fmMatch[2].trim();
              const nameMatch = fm.match(/^name:\s*(.+)$/m);
              const descMatch = fm.match(/^description:\s*(.+)$/m);
              if (nameMatch) name = nameMatch[1].trim();
              if (descMatch) desc = descMatch[1].trim();
            }

            skills.push({
              id: entry.name,
              name: name,
              description: desc,
              prompt: content,
              content: content
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[codex-desktop] 加载技能库失败:", err);
  }
  return skills;
});

ipcMain.handle("check-for-updates-manual", () => {
  checkForUpdates(false);
  return { success: true };
});

ipcMain.handle("start-download-update-action", (_event, { downloadUrl, version }) => {
  if (downloadUrl && version) {
    startDownloadUpdate(downloadUrl, version);
    return { success: true };
  }
  return { success: false, error: "Missing downloadUrl or version" };
});

// 官方 Codex CLI (Rust / Node @openai/codex) 状态检测适配器
ipcMain.handle("detect-core-status", async () => {
  return new Promise((resolve) => {
    const { exec } = require("child_process");
    exec("codex --version", (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        resolve({
          installed: true,
          version: stdout.trim(),
          source: "system-path",
          latestAvailable: "v0.152.1"
        });
      } else {
        const userHome = os.homedir();
        const customBin = path.join(userHome, ".codex", "bin", process.platform === "win32" ? "codex.exe" : "codex");
        if (fs.existsSync(customBin)) {
          resolve({
            installed: true,
            version: "v0.152.1 (local)",
            path: customBin,
            source: "local-dir",
            latestAvailable: "v0.152.1"
          });
        } else {
          resolve({
            installed: false,
            version: "none",
            latestAvailable: "v0.152.1"
          });
        }
      }
    });
  });
});

ipcMain.handle("open-external", async (_event, targetUrl) => {
  if (targetUrl && (targetUrl.startsWith("https://") || targetUrl.startsWith("http://"))) {
    shell.openExternal(targetUrl);
    return { success: true };
  }
  return { success: false, error: "Invalid URL" };
});

ipcMain.handle("save-temp-image", async (_event, base64Data) => {
  try {
    const tempDir = path.join(os.tmpdir(), "codex-desktop-images");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const fileName = `clipboard-${Date.now()}.png`;
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, buffer);
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // 6. 底层原生大模型 API 请求管道 (Node.js 原生请求，模拟标准客户端防拦截)
  // -------------------------------------------------------------------------
  const activeLlmStreams = new Map();

  ipcMain.handle("abort-llm-stream", (_event, streamId) => {
    if (streamId && activeLlmStreams.has(streamId)) {
      const info = activeLlmStreams.get(streamId);
      if (info) {
        if (typeof info.clearActiveTimer === 'function') info.clearActiveTimer();
        if (info.req) {
          try {
            info.req.destroy();
          } catch (e) {}
        }
      }
      activeLlmStreams.delete(streamId);
      return { success: true };
    }
    return { success: false, notFound: true };
  });

  // 原生 Node.js 底层 HTTP 请求管道 (通用双协议自适应: OpenAI 兼容 & Anthropic 原生)
  // 原生 Node.js 底层 HTTP 请求管道 (通用双协议自适应 + 智能故障自愈重试)
  ipcMain.handle("call-llm-api", async (event, payload) => {
    const { endpoint, apiKey, body, customHeaders = {}, timeout: userTimeout, stream = false, streamId = '' } = payload;
    const https = require("https");
    const http = require("http");
    const url = require("url");

    // 如果启用了流式传输，确保 body.stream 为 true
    if (stream && typeof body === 'object' && body !== null) {
      body.stream = true;
    }

    const postData = JSON.stringify(body);
    const cleanKey = (apiKey || "").trim();
    const parsedUrl = url.parse(endpoint);
    const isHttps = parsedUrl.protocol === "https:";
    const client = isHttps ? https : http;

    // 判断是 Anthropic 原生端点还是 OpenAI 兼容端点
    const isAnthropicEndpoint = endpoint.includes("/messages");

    let baseHeaders = {};
    if (isAnthropicEndpoint) {
      // 纯净 Anthropic 官方客户端请求头 (模拟 Claude Code)
      // 流式模式下不设置 Content-Length，防止与分块传输协议冲突触发 unexpected EOF
      baseHeaders = {
        "Content-Type": "application/json",
        ...(stream ? {} : { "Content-Length": Buffer.byteLength(postData) }),
        "x-api-key": cleanKey,
        "anthropic-version": "2023-06-01",
        "User-Agent": "cline/3.0.0",
        "Accept": stream ? "text/event-stream, application/json" : "application/json",
        "Connection": "keep-alive",
        ...customHeaders
      };
    } else {
      // 纯净 OpenAI / Codex 官方 CLI 请求头 (严禁携带 Anthropic 混杂头，防 WAF 拦截)
      // 流式模式下不设置 Content-Length，防止与分块传输协议冲突触发 unexpected EOF
      baseHeaders = {
        "Content-Type": "application/json",
        ...(stream ? {} : { "Content-Length": Buffer.byteLength(postData) }),
        "Authorization": cleanKey ? `Bearer ${cleanKey}` : "",
        "User-Agent": "cline/3.0.0",
        "Accept": stream ? "text/event-stream, application/json" : "application/json",
        "Connection": "keep-alive",
        ...customHeaders
      };
    }

    // -----------------------------------------------------------------------
    // 双层自适应超时控制系统:
    // 1. 首包自适应: 根据发送 Prompt 字节大小动态调节首包等待 (默认 120s，长任务最高 300s)
    // 2. 滑动窗口保活 (Rolling Inactivity Timeout): 数据流一旦开始吐字，只要在持续传输，连接永不中断
    // -----------------------------------------------------------------------
    const payloadBytes = Buffer.byteLength(postData);
    const adaptiveInitialMs = userTimeout && userTimeout > 0
      ? userTimeout * 1000
      : Math.min(300000, 120000 + Math.floor(payloadBytes / 1000) * 15000);

    const rollingInactivityMs = 90000; // 数据流入后的空闲静默容忍度 (90s)

    // 单次底层网络请求执行体
    const runAttempt = (attemptIndex, forceNewConnection = false) => {
      return new Promise((resolve) => {
        let activeTimer = null;
        let hasReceivedFirstByte = false;
        let sseBuffer = "";
        let accumulatedText = "";
        let accumulatedThinking = "";

        const clearActiveTimer = () => {
          if (activeTimer) {
            clearTimeout(activeTimer);
            activeTimer = null;
          }
        };

        const setTimer = (ms, reason) => {
          clearActiveTimer();
          activeTimer = setTimeout(() => {
            req.destroy();
            resolve({
              ok: false,
              status: 408,
              statusText: "Request Timeout",
              body: JSON.stringify({
                error: {
                  message: reason
                }
              }),
              canRetry: !hasReceivedFirstByte
            });
          }, ms);
        };

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.path,
          method: "POST",
          headers: baseHeaders,
          // 若重试或对端单向重置，强制禁用 Agent 缓存 (新建全新 TCP 握手，规避 Half-Open 假死 Socket)
          agent: forceNewConnection ? false : undefined
        };

        const req = client.request(options, (res) => {
          if (stream && streamId) {
            activeLlmStreams.set(streamId, { req, clearActiveTimer });
          }
          let responseBody = "";
          res.setEncoding("utf8");

          res.on("data", (chunk) => {
            if (!hasReceivedFirstByte) {
              hasReceivedFirstByte = true;
            }
            // 只要数据流在持续流动，每次接收到数据块均自动刷新心跳计时器
            setTimer(rollingInactivityMs, "数据流传输静默超时 (90s)，服务端可能已意外断开");
            responseBody += chunk;

            // 若开启了流式模式且响应正常，进行实时 SSE 事件流解析
            if (stream && res.statusCode >= 200 && res.statusCode < 300) {
              sseBuffer += chunk;
              const lines = sseBuffer.split(/\r?\n/);
              sseBuffer = lines.pop() || "";

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;
                const dataStr = trimmedLine.replace(/^data:\s*/, "");
                if (dataStr === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(dataStr);
                  // 1. OpenAI 兼容流式 Delta
                  const choice = parsed.choices?.[0];
                  const deltaText = choice?.delta?.content || "";
                  const deltaThinking = choice?.delta?.reasoning_content || choice?.delta?.reasoning || "";

                  // 捕获 OpenAI 格式的工具调用 (Tool Calls)，防止模型发起工具调用时流式被静默中断
                  let toolCallsDelta = "";
                  const toolCalls = choice?.delta?.tool_calls;
                  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                    for (const tc of toolCalls) {
                      if (tc.function?.name) {
                        toolCallsDelta += `\n\n> 🔧 **[模型尝试发起工具调用]**: \`${tc.function.name}\`\n\`\`\`json\n`;
                      }
                      if (tc.function?.arguments) {
                        toolCallsDelta += tc.function.arguments;
                      }
                    }
                  }

                  // 2. Anthropic 原生流式 Delta
                  let anthropicText = "";
                  let anthropicThinking = "";
                  if (parsed.type === "content_block_delta") {
                    if (parsed.delta?.type === "text_delta") anthropicText = parsed.delta.text || "";
                    if (parsed.delta?.type === "thinking_delta") anthropicThinking = parsed.delta.thinking || "";
                    if (parsed.delta?.type === "input_json_delta") toolCallsDelta += parsed.delta.partial_json || "";
                  } else if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
                    toolCallsDelta += `\n\n> 🔧 **[模型尝试发起工具调用]**: \`${parsed.content_block.name}\`\n\`\`\`json\n`;
                  }

                  const contentDelta = deltaText || anthropicText || toolCallsDelta;
                  const thinkingDelta = deltaThinking || anthropicThinking;

                  if (contentDelta) accumulatedText += contentDelta;
                  if (thinkingDelta) accumulatedThinking += thinkingDelta;

                  if ((contentDelta || thinkingDelta) && !event.sender.isDestroyed()) {
                    event.sender.send("llm-stream-chunk", {
                      streamId,
                      contentDelta,
                      thinkingDelta,
                      isDone: false
                    });
                  }
                } catch (e) {
                  // 部分未完整的 JSON 片段忽略，等待下个 chunk 拼接
                }
              }
            }
          });

          // 捕获响应流中途 EOF / 连接被对端关闭等错误，防止未处理的流式中断
          res.on("error", (resErr) => {
            clearActiveTimer();
            const isEofError = resErr.message && (
              resErr.message.includes('unexpected EOF') ||
              resErr.message.includes('read ECONNRESET') ||
              resErr.message.includes('aborted') ||
              resErr.message.includes('stream reading error')
            );
            if (stream && accumulatedText) {
              // 已有部分内容输出：通知前端完成并保留已有内容（截断不丢弃）
              if (!event.sender.isDestroyed()) {
                event.sender.send("llm-stream-chunk", { streamId, isDone: true });
              }
              resolve({
                ok: true,
                status: 200,
                statusText: "Partial OK",
                body: JSON.stringify({
                  choices: [{ message: { content: accumulatedText + "\n\n> ⚠️ *[传输中途中断，已截断显示]*", reasoning_content: accumulatedThinking } }]
                }),
                canRetry: false
              });
            } else {
              // 无任何内容：判断是否可弹性重试
              resolve({
                ok: false,
                status: 0,
                statusText: "Stream EOF",
                body: JSON.stringify({ error: { message: resErr.message, code: resErr.code || 'STREAM_EOF' } }),
                canRetry: isEofError && !hasReceivedFirstByte
              });
            }
          });

          res.on("end", () => {
            clearActiveTimer();
            if (stream && !event.sender.isDestroyed()) {
              event.sender.send("llm-stream-chunk", {
                streamId,
                isDone: true
              });
            }

            // 如果是流式模式，返回已组装好的统一格式，兼容后续兜底消费
            let finalBody = responseBody;
            if (stream && accumulatedText) {
              finalBody = JSON.stringify({
                choices: [{
                  message: {
                    content: accumulatedText,
                    reasoning_content: accumulatedThinking
                  }
                }]
              });
            }

            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              body: finalBody,
              canRetry: false
            });
          });
        });

        req.on("error", (e) => {
          clearActiveTimer();
          // 若在此之前没有任何数据流吐出，且属于瞬态网络层中断，判定为可弹性重试
          const isTransientNetworkError =
            e.code === 'ECONNRESET' ||
            e.code === 'ETIMEDOUT' ||
            e.code === 'ECONNREFUSED' ||
            e.code === 'EPIPE' ||
            (e.message && (
              e.message.includes('ECONNRESET') ||
              e.message.includes('socket hang up') ||
              e.message.includes('aborted')
            ));

          resolve({
            ok: false,
            status: 0,
            statusText: "Network Error",
            body: JSON.stringify({ error: { message: e.message, code: e.code } }),
            canRetry: !hasReceivedFirstByte && isTransientNetworkError
          });
        });

        // 初始化启动首包等待计时器
        setTimer(
          adaptiveInitialMs,
          `首包响应等待超时 (${Math.round(adaptiveInitialMs / 1000)}s)，当前为长任务或中转站排队中，请检查中转站响应速度`
        );

        req.write(postData);
        req.end();
      });
    };

    // 弹性自愈重试调度器：最多重试 2 次（总计最多尝试 3 次），重试前短暂指数退避并强制新建连接
    const maxRetries = 2;
    let attempt = 0;
    let currentResult = null;

    while (attempt <= maxRetries) {
      const forceNew = attempt > 0;
      currentResult = await runAttempt(attempt, forceNew);
      if (currentResult.ok || !currentResult.canRetry || attempt === maxRetries) {
        break;
      }
      attempt++;
      // 指数退避等待 (第1次重试等 600ms, 第2次重试等 1200ms)
      await new Promise(r => setTimeout(r, attempt * 600));
    }

    return {
      ok: currentResult.ok,
      status: currentResult.status,
      statusText: currentResult.statusText,
      body: currentResult.body
    };
  });

  // ---------------------------------------------------------------------------
  // 主进程权威安全沙箱状态机 (Authoritative Security Sandbox State Machine)
  // ---------------------------------------------------------------------------
  const SecuritySandbox = {
    activeWorkspaceDir: null,
    permissionMode: "workspace-readonly", // "workspace-readonly" | "full-access"
    policyPath: path.join(os.homedir(), ".codex", "security-policy.json"),
    auditLogPath: path.join(os.homedir(), ".codex", "audit.log"),

    init() {
      try {
        if (fs.existsSync(this.policyPath)) {
          const raw = fs.readFileSync(this.policyPath, "utf8");
          const data = JSON.parse(raw);
          if (data.activeWorkspaceDir && fs.existsSync(data.activeWorkspaceDir)) {
            this.activeWorkspaceDir = fs.realpathSync(data.activeWorkspaceDir);
          }
          const validModes = ["chat-only", "workspace-readonly", "workspace-readwrite", "full-access"];
          if (validModes.includes(data.permissionMode)) {
            this.permissionMode = data.permissionMode;
          }
        }
      } catch (e) {
        // 容错保持默认
      }
    },

    save() {
      try {
        const dir = path.dirname(this.policyPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.policyPath, JSON.stringify({
          activeWorkspaceDir: this.activeWorkspaceDir,
          permissionMode: this.permissionMode,
          updatedAt: new Date().toISOString()
        }, null, 2), "utf8");
      } catch (e) {
        // 容错
      }
    },

    logAudit(action, targetPath, details = "") {
      try {
        const dir = path.dirname(this.auditLogPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const record = `[${new Date().toISOString()}] [${this.permissionMode}] ${action} -> ${targetPath} ${details}\n`;
        fs.appendFileSync(this.auditLogPath, record, "utf8");
      } catch (e) {
        // 容错
      }
    }
  };

  SecuritySandbox.init();

  // ---------------------------------------------------------------------------
  // 工作区目录选择与权限管理 (主进程绝对权威)
  // ---------------------------------------------------------------------------
  ipcMain.handle("select-workspace-dir", async () => {
    const win = mainWindow || BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      title: "选择工程工作区目录",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    try {
      const realDir = fs.realpathSync(result.filePaths[0]);
      SecuritySandbox.activeWorkspaceDir = realDir;
      SecuritySandbox.save();
      return realDir;
    } catch (err) {
      SecuritySandbox.activeWorkspaceDir = result.filePaths[0];
      SecuritySandbox.save();
      return result.filePaths[0];
    }
  });

  ipcMain.handle("set-workspace-dir", async (_event, dirPath) => {
    if (!dirPath || typeof dirPath !== "string") {
      SecuritySandbox.activeWorkspaceDir = null;
      SecuritySandbox.save();
      return { ok: true, activeWorkspaceDir: null };
    }
    try {
      if (!fs.existsSync(dirPath)) {
        return { ok: false, error: "指定的工作区目录不存在" };
      }
      const realDir = fs.realpathSync(dirPath);
      SecuritySandbox.activeWorkspaceDir = realDir;
      SecuritySandbox.save();
      return { ok: true, activeWorkspaceDir: realDir };
    } catch (err) {
      SecuritySandbox.activeWorkspaceDir = dirPath;
      SecuritySandbox.save();
      return { ok: true, activeWorkspaceDir: dirPath };
    }
  });

  ipcMain.handle("get-security-status", async () => {
    return {
      activeWorkspaceDir: SecuritySandbox.activeWorkspaceDir,
      permissionMode: SecuritySandbox.permissionMode
    };
  });

  ipcMain.handle("set-permission-mode", async (_event, targetMode) => {
    const validModes = ["chat-only", "workspace-readonly", "workspace-readwrite", "full-access"];
    if (!validModes.includes(targetMode)) {
      return {
        ok: false,
        error: "无效的权限模式",
        permissionMode: SecuritySandbox.permissionMode
      };
    }

    // 提升至全局受信任模式时，强制触发原生系统级警告确认弹窗 (防前端脚本与 XSS 自动提权)
    if (targetMode === "full-access" && SecuritySandbox.permissionMode !== "full-access") {
      const win = mainWindow || BrowserWindow.getFocusedWindow();
      const choice = await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["取消", "确认提升为全局受信任"],
        defaultId: 0,
        cancelId: 0,
        title: "安全权限提升确认",
        message: "确定将 Agent 运行权限提升至【全局受信任】模式吗？",
        detail: "警告：全局受信任模式允许 Agent 跨越当前工作区，读取本机任意系统路径下的文件（包括环境配置、系统依赖等）。\n\n请确认当前对话环境值得信赖。"
      });

      if (choice.response !== 1) {
        return {
          ok: false,
          canceled: true,
          permissionMode: SecuritySandbox.permissionMode
        };
      }
    }

    SecuritySandbox.permissionMode = targetMode;
    SecuritySandbox.save();
    SecuritySandbox.logAudit("PERMISSION_MODE_CHANGED", targetMode);

    return {
      ok: true,
      permissionMode: SecuritySandbox.permissionMode
    };
  });

  // ---------------------------------------------------------------------------
  // 权威安全沙箱文件读取通道 (渲染进程仅能传 relativePath)
  // ---------------------------------------------------------------------------
  ipcMain.handle("read-workspace-file", async (_event, payload) => {
    const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
    if (!relativePath || typeof relativePath !== "string") {
      return {
        ok: false,
        code: "INVALID_ARGUMENT",
        reason: "文件相对路径不能为空",
        hint: "请指定有效的文件路径"
      };
    }

    const mode = SecuritySandbox.permissionMode;
    const workspace = SecuritySandbox.activeWorkspaceDir;

    // 1. 纯对话模式：强制拦截任何文件读取
    if (mode === "chat-only") {
      SecuritySandbox.logAudit("BLOCKED_READ_CHAT_ONLY", relativePath);
      return {
        ok: false,
        code: "CHAT_ONLY_BLOCKED",
        reason: "当前处于【纯对话咨询】模式，已强制阻断本地任何文件读取操作以保护隐私",
        hint: "如需分析项目代码，请在输入框左侧将权限模式切换为【工作区只读】或【工作区读写】"
      };
    }

    let candidatePath = "";

    // 2. 工作区沙箱模式 (工作区只读 / 工作区读写 均受严格边界限制)
    if (mode === "workspace-readonly" || mode === "workspace-readwrite") {
      if (!workspace) {
        return {
          ok: false,
          code: "NO_WORKSPACE",
          reason: "当前尚未选定工作区工程目录",
          hint: "请在左侧栏点击选择或切换工作区目录"
        };
      }

      // 防字面穿透与拼接解析
      candidatePath = path.resolve(workspace, relativePath);

      if (!fs.existsSync(candidatePath)) {
        return {
          ok: false,
          code: "NOT_FOUND",
          reason: `文件不存在: ${relativePath}`,
          hint: "请检查相对路径拼写是否正确"
        };
      }

      // 核心安全防线：realpath 物理路径 Containment 检验 (彻底阻断 Symlink / Junction 软链接逃逸)
      try {
        const realWorkspace = fs.realpathSync(workspace);
        const realTarget = fs.realpathSync(candidatePath);
        const rel = path.relative(realWorkspace, realTarget);
        const isContained = !rel.startsWith("..") && !path.isAbsolute(rel);

        if (!isContained) {
          SecuritySandbox.logAudit("BLOCKED_SYMLINK_OR_TRAVERSAL", candidatePath);
          return {
            ok: false,
            code: "PERMISSION_DENIED",
            reason: "目标文件指向工作区外部物理路径 (软链接逃逸或越权穿透已拦截)",
            hint: "当前为工作区只读模式，严禁访问工作区外部物理文件"
          };
        }
        candidatePath = realTarget;
      } catch (err) {
        return {
          ok: false,
          code: "REALPATH_ERROR",
          reason: `解析文件物理路径失败: ${err.message}`,
          hint: "文件可能为损坏的无效链接"
        };
      }
    } else {
      // 全局受信任模式 (full-access)
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
      if (!fs.existsSync(candidatePath)) {
        return {
          ok: false,
          code: "NOT_FOUND",
          reason: `文件不存在: ${relativePath}`,
          hint: "请检查路径拼写是否正确"
        };
      }
      try {
        candidatePath = fs.realpathSync(candidatePath);
      } catch (err) {
        // 保持原样
      }

      // 敏感路径审计留痕
      const lower = candidatePath.toLowerCase();
      if (lower.includes(".ssh") || lower.includes(".env") || lower.includes("id_rsa") || lower.includes("credentials")) {
        SecuritySandbox.logAudit("READ_SENSITIVE_FILE", candidatePath);
      }
    }

    try {
      const stat = fs.statSync(candidatePath);
      if (stat.isDirectory()) {
        return {
          ok: false,
          code: "IS_DIRECTORY",
          reason: `指定路径为目录而非可读文件: ${relativePath}`,
          hint: "请指定具体代码或文本文件路径"
        };
      }

      // 二进制文件嗅探 (读取前 512 字节探测 null byte)
      const sampleSize = Math.min(512, stat.size);
      if (sampleSize > 0) {
        const fd = fs.openSync(candidatePath, "r");
        const sampleBuf = Buffer.alloc(sampleSize);
        fs.readSync(fd, sampleBuf, 0, sampleSize, 0);
        fs.closeSync(fd);

        let hasNullByte = false;
        for (let i = 0; i < sampleSize; i++) {
          if (sampleBuf[i] === 0) {
            hasNullByte = true;
            break;
          }
        }
        if (hasNullByte) {
          return {
            ok: false,
            code: "BINARY_FILE_REJECTED",
            reason: `目标文件包含二进制空字节，已拒绝读取: ${relativePath}`,
            hint: "仅支持读取文本与代码文件，防止乱码污染模型上下文"
          };
        }
      }

      // 精确以 128KB 字节 (131072 字节) 为截断边界
      const MAX_BYTES = 128 * 1024;
      let isTruncated = false;
      let content = "";

      if (stat.size > MAX_BYTES) {
        isTruncated = true;
        const fd = fs.openSync(candidatePath, "r");
        const buf = Buffer.alloc(MAX_BYTES);
        fs.readSync(fd, buf, 0, MAX_BYTES, 0);
        fs.closeSync(fd);
        content = buf.toString("utf8") + `\n\n[⚠️ 系统提示: 文件总大小 (${Math.round(stat.size / 1024)}KB) 超出限制，当前仅截取前 128KB 字节内容，剩余部分已略去]`;
      } else {
        content = fs.readFileSync(candidatePath, "utf8");
      }

      return {
        ok: true,
        relativePath,
        fullPath: candidatePath,
        content,
        isTruncated,
        totalBytes: stat.size,
        permissionMode: mode
      };
    } catch (err) {
      return {
        ok: false,
        code: "READ_ERROR",
        reason: `读取文件失败: ${err.message}`,
        hint: "请确认文件未被其他系统进程独占"
      };
    }
  });

  // ---------------------------------------------------------------------------
  // 权威安全沙箱文件写入通道 (必须要求 workspace-readwrite 或 full-access)
  // ---------------------------------------------------------------------------
  ipcMain.handle("write-workspace-file", async (_event, payload) => {
    const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
    const content = payload?.content ?? "";
    const createBackup = payload?.createBackup !== false;

    if (!relativePath || typeof relativePath !== "string") {
      return {
        ok: false,
        code: "INVALID_ARGUMENT",
        reason: "文件相对路径不能为空",
        hint: "请指定有效的文件相对路径"
      };
    }

    const mode = SecuritySandbox.permissionMode;
    const workspace = SecuritySandbox.activeWorkspaceDir;

    // 1. 权限拦截：必须为 workspace-readwrite 或 full-access 模式
    if (mode === "chat-only" || mode === "workspace-readonly") {
      SecuritySandbox.logAudit("BLOCKED_WRITE_READONLY", relativePath);
      return {
        ok: false,
        code: "PERMISSION_DENIED",
        reason: `当前运行权限为【${mode === 'chat-only' ? '纯对话模式' : '工作区只读模式'}】，严禁向本地文件写入任何修改`,
        hint: "请在输入框左侧将权限模式切换为【✍️ 工作区读写】或【🌐 全局受信任】后再执行写入"
      };
    }

    let candidatePath = "";

    // 2. 工作区读写模式：严格限制在 workspace 物理边界内部
    if (mode === "workspace-readwrite") {
      if (!workspace) {
        return {
          ok: false,
          code: "NO_WORKSPACE",
          reason: "当前会话尚未绑定工作区工程目录",
          hint: "请在左侧栏选择或打开工程工作区"
        };
      }

      candidatePath = path.resolve(workspace, relativePath);

      // 防 ../ 穿越或跨盘符逃逸
      try {
        const realWorkspace = fs.realpathSync(workspace);
        const targetDir = path.dirname(candidatePath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const realParent = fs.realpathSync(targetDir);
        const rel = path.relative(realWorkspace, realParent);
        const isContained = !rel.startsWith("..") && !path.isAbsolute(rel);

        if (!isContained) {
          SecuritySandbox.logAudit("BLOCKED_WRITE_TRAVERSAL", candidatePath);
          return {
            ok: false,
            code: "PERMISSION_DENIED",
            reason: "目标文件指向工作区外部物理路径 (越权写入或软链接逃逸已拦截)",
            hint: "工作区读写模式下，严禁向工作区外部写入文件"
          };
        }
      } catch (err) {
        return {
          ok: false,
          code: "REALPATH_ERROR",
          reason: `解析工作区路径失败: ${err.message}`
        };
      }
    } else {
      // 3. 全局受信任模式 (full-access)
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
      const parentDir = path.dirname(candidatePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }

    try {
      // 防懒惰截断守卫：若原有文件存在，且拟写入代码包含未展开的占位符，严禁直接覆盖
      if (fs.existsSync(candidatePath) && !payload?.forceOverwrite) {
        const STUB_PATTERNS = [
          /\/\/\s*\.{3,}\s*(?:保持不变|其余不变|其余代码|原有代码|代码不变|现有代码|existing code|rest of code|unchanged|previous code)/i,
          /\/\*\s*\.{3,}\s*(?:保持不变|其余不变|其余代码|原有代码|代码不变|现有代码|existing code|rest of code|unchanged|previous code)\s*\*\//i,
          /#\s*\.{3,}\s*(?:保持不变|其余不变|其余代码|原有代码|代码不变|现有代码|existing code|rest of code|unchanged|previous code)/i,
          /\/\/\s*TODO:\s*(?:其余保持不变|其余代码不变|其余不变)/i
        ];
        const matchedStub = STUB_PATTERNS.find(pat => pat.test(content));
        if (matchedStub) {
          SecuritySandbox.logAudit("BLOCKED_STUB_OVERWRITE", candidatePath);
          return {
            ok: false,
            code: "STUB_DETECTED",
            reason: "检测到代码中包含未展开的省略占位符 (如 '// ... 保持不变')，已安全阻断覆写以保护源文件不受损坏",
            hint: "请要求 AI 输出完整可直接运行的源码文件，或手动复制代码中的变动段落"
          };
        }
      }

      // 自动创建 .bak 历史安全备份
      let backupPath = null;
      if (createBackup && fs.existsSync(candidatePath)) {
        backupPath = `${candidatePath}.bak`;
        try {
          fs.copyFileSync(candidatePath, backupPath);
        } catch (e) {}
      }

      // 执行物理写盘
      fs.writeFileSync(candidatePath, content, "utf8");
      SecuritySandbox.logAudit("WRITE_FILE_SUCCESS", candidatePath);

      return {
        ok: true,
        relativePath,
        fullPath: candidatePath,
        bytesWritten: Buffer.byteLength(content, "utf8"),
        backupPath,
        permissionMode: mode
      };
    } catch (err) {
      SecuritySandbox.logAudit("WRITE_FILE_FAILED", candidatePath, err.message);
      return {
        ok: false,
        code: "WRITE_ERROR",
        reason: `写入文件失败: ${err.message}`,
        hint: "请检查该文件是否被其他编辑器或系统进程占用锁定"
      };
    }
  });

  // ---------------------------------------------------------------------------
  // 权威安全沙箱文件差异对比通道 (读取当前物理文件与 .bak 备份比对)
  // ---------------------------------------------------------------------------
  ipcMain.handle("read-workspace-file-diff", async (_event, payload) => {
    const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
    if (!relativePath || typeof relativePath !== "string") {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "文件相对路径不能为空" };
    }

    const mode = SecuritySandbox.permissionMode;
    const workspace = SecuritySandbox.activeWorkspaceDir;

    if (mode === "chat-only") {
      return { ok: false, code: "CHAT_ONLY_BLOCKED", reason: "纯对话模式下禁止读取工作区文件" };
    }

    let candidatePath = "";
    if (mode === "workspace-readonly" || mode === "workspace-readwrite") {
      if (!workspace) {
        return { ok: false, code: "NO_WORKSPACE", reason: "当前尚未选定工作区工程目录" };
      }
      candidatePath = path.resolve(workspace, relativePath);
      try {
        const realWorkspace = fs.realpathSync(workspace);
        const realTarget = fs.realpathSync(candidatePath);
        const rel = path.relative(realWorkspace, realTarget);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          return { ok: false, code: "PERMISSION_DENIED", reason: "越权穿透已拦截" };
        }
      } catch (err) {
        // 文件若不存在
        return { ok: false, code: "NOT_FOUND", reason: `文件不存在: ${relativePath}` };
      }
    } else {
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
    }

    try {
      const currentContent = fs.readFileSync(candidatePath, "utf8");
      const backupPath = `${candidatePath}.bak`;
      let originalContent = null;
      let hasBackup = false;

      if (fs.existsSync(backupPath)) {
        originalContent = fs.readFileSync(backupPath, "utf8");
        hasBackup = true;
      }

      return {
        ok: true,
        relativePath,
        hasBackup,
        originalContent,
        currentContent
      };
    } catch (err) {
      return { ok: false, code: "READ_DIFF_ERROR", reason: `读取差异失败: ${err.message}` };
    }
  });

  // ---------------------------------------------------------------------------
  // 权威安全沙箱一键还原通道 (将 .bak 备份原子覆盖回源文件并清理备份)
  // ---------------------------------------------------------------------------
  ipcMain.handle("revert-workspace-file", async (_event, payload) => {
    const relativePath = typeof payload === "string" ? payload : payload?.relativePath;
    if (!relativePath || typeof relativePath !== "string") {
      return { ok: false, code: "INVALID_ARGUMENT", reason: "文件相对路径不能为空" };
    }

    const mode = SecuritySandbox.permissionMode;
    const workspace = SecuritySandbox.activeWorkspaceDir;

    if (mode === "chat-only" || mode === "workspace-readonly") {
      return {
        ok: false,
        code: "PERMISSION_DENIED",
        reason: `当前运行权限为【${mode === 'chat-only' ? '纯对话模式' : '工作区只读模式'}】，严禁回滚或修改本地文件`,
        hint: "请在输入框左侧将权限模式切换为【✍️ 工作区读写】或【🌐 全局受信任】后再执行还原"
      };
    }

    let candidatePath = "";
    if (mode === "workspace-readwrite") {
      if (!workspace) {
        return { ok: false, code: "NO_WORKSPACE", reason: "当前尚未选定工作区工程目录" };
      }
      candidatePath = path.resolve(workspace, relativePath);
      try {
        const realWorkspace = fs.realpathSync(workspace);
        const targetDir = path.dirname(candidatePath);
        const realParent = fs.realpathSync(targetDir);
        const rel = path.relative(realWorkspace, realParent);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          return { ok: false, code: "PERMISSION_DENIED", reason: "越权路径还原已拦截" };
        }
      } catch (err) {
        return { ok: false, code: "NOT_FOUND", reason: `无法定位目标文件: ${err.message}` };
      }
    } else {
      candidatePath = workspace ? path.resolve(workspace, relativePath) : path.resolve(relativePath);
    }

    const backupPath = `${candidatePath}.bak`;
    if (!fs.existsSync(backupPath)) {
      return {
        ok: false,
        code: "NO_BACKUP",
        reason: "未找到该文件的历史备份副本 (.bak)，无法执行原子还原"
      };
    }

    try {
      const restoredContent = fs.readFileSync(backupPath, "utf8");
      fs.writeFileSync(candidatePath, restoredContent, "utf8");
      fs.unlinkSync(backupPath); // 还原后清理临时备份
      SecuritySandbox.logAudit("REVERT_FILE_SUCCESS", candidatePath);

      return {
        ok: true,
        relativePath,
        content: restoredContent
      };
    } catch (err) {
      SecuritySandbox.logAudit("REVERT_FILE_FAILED", candidatePath, err.message);
      return {
        ok: false,
        code: "REVERT_ERROR",
        reason: `还原文件失败: ${err.message}`
      };
    }
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // 工业级工作区工程文件树读取 (主流 IDE 对齐：按需懒加载 + 缓存排除 + 智能防饿死)
  // ---------------------------------------------------------------------------
  const WORKSPACE_IGNORED_DIRS = new Set([
    "node_modules", ".git", ".svn", ".hg", "dist", "build", ".cache",
    "release", "coverage", ".next", ".nuxt", ".vite", "out", "tmp", "temp",
    ".turbo", ".electron", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "npm-cache", ".npm", "m2-repo", ".m2", "jdk", "jre", "maven", "gradle", ".gradle",
    "target", "vendor", "bin", "obj", ".cargo", ".rustup"
  ]);

  const WORKSPACE_ALLOWED_DOT_NAMES = new Set([
    ".agents", ".github", ".vscode", ".env", ".gitignore", ".npmrc",
    ".editorconfig", ".prettierrc", ".eslintrc", ".commitlintrc", ".husky"
  ]);

  function isWorkspaceEntryValid(name, isFile = false) {
    if (name.startsWith(".")) {
      const isAllowed = WORKSPACE_ALLOWED_DOT_NAMES.has(name) ||
                        name.startsWith(".env.") ||
                        name.endsWith(".json") ||
                        name.endsWith(".js") ||
                        name.endsWith(".ts") ||
                        name.endsWith(".yml") ||
                        name.endsWith(".yaml");
      if (!isAllowed) return false;
    }
    if (WORKSPACE_IGNORED_DIRS.has(name)) return false;
    if (isFile && (name.endsWith(".bak") || name.endsWith(".tmp") || name.endsWith(".swp") || name.startsWith("~"))) {
      return false;
    }
    return true;
  }

  // 辅助函数：超时 Promise 封装 (杜绝主进程死锁与网络盘卡死)
  function withTimeout(promise, ms = 2500, fallbackVal = null) {
    let timer;
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallbackVal), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  }

  // 1. 读取指定单个目录的直接子项 (纯异步非阻塞 + 2.5秒超时熔断)
  ipcMain.handle("read-directory-children", async (_event, folderPath) => {
    if (!folderPath || typeof folderPath !== "string") return [];
    return withTimeout(
      (async () => {
        try {
          const rootDir = SecuritySandbox.activeWorkspaceDir || folderPath;
          const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
          const items = [];

          entries.sort((a, b) => {
            if (a.isDirectory() === b.isDirectory()) {
              return a.name.localeCompare(b.name);
            }
            return a.isDirectory() ? -1 : 1;
          });

          for (const entry of entries) {
            if (!isWorkspaceEntryValid(entry.name, entry.isFile())) continue;
            const fullPath = path.join(folderPath, entry.name);
            const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
            items.push({
              name: entry.name,
              path: relativePath,
              fullPath,
              isDirectory: entry.isDirectory(),
              children: entry.isDirectory() ? [] : undefined
            });
          }
          return items;
        } catch (err) {
          console.error("[main] read-directory-children 异常:", err.message);
          return [];
        }
      })(),
      2500,
      []
    );
  });

  // 2. 初始工作区文件树构建 (纯异步非阻塞 + 2.5秒强力超时熔断 + 仅读直接首层)
  ipcMain.handle("read-workspace-tree", async (_event, dirPath, options = {}) => {
    const targetDir = (typeof dirPath === "string" && dirPath) ? dirPath : SecuritySandbox.activeWorkspaceDir;
    if (!targetDir || typeof targetDir !== "string") return null;

    return withTimeout(
      (async () => {
        try {
          let realTarget = targetDir;
          try {
            realTarget = await fs.promises.realpath(targetDir);
          } catch (e) {
            realTarget = path.resolve(targetDir);
          }

          let totalItemCount = 0;
          const MAX_TOTAL_ITEMS = 3000;
          const MAX_DEPTH = typeof options.maxDepth === "number" ? options.maxDepth : 1; // 默认首层秒开，深层按需动态展开
          const visitedRealPaths = new Set([realTarget]);

          async function buildTreeAsync(currentPath, depth = 0) {
            if (depth > MAX_DEPTH) return [];
            let rawEntries = [];
            try {
              rawEntries = await fs.promises.readdir(currentPath, { withFileTypes: true });
            } catch (e) {
              return [];
            }

            const validEntries = rawEntries.filter(entry => isWorkspaceEntryValid(entry.name, entry.isFile()));
            validEntries.sort((a, b) => {
              if (a.isDirectory() === b.isDirectory()) {
                return a.name.localeCompare(b.name);
              }
              return a.isDirectory() ? -1 : 1;
            });

            const currentLevelNodes = [];
            const dirNodesToRecurse = [];

            for (const entry of validEntries) {
              totalItemCount++;
              const fullPath = path.join(currentPath, entry.name);
              const relativePath = path.relative(realTarget, fullPath).replace(/\\/g, "/");

              if (entry.isDirectory()) {
                const node = {
                  name: entry.name,
                  path: relativePath,
                  fullPath,
                  isDirectory: true,
                  children: []
                };
                currentLevelNodes.push(node);
                dirNodesToRecurse.push({ node, fullPath });
              } else if (entry.isFile()) {
                currentLevelNodes.push({
                  name: entry.name,
                  path: relativePath,
                  fullPath,
                  isDirectory: false
                });
              }
            }

            for (const { node, fullPath } of dirNodesToRecurse) {
              if (depth + 1 <= MAX_DEPTH && totalItemCount < MAX_TOTAL_ITEMS) {
                try {
                  const realFolder = await fs.promises.realpath(fullPath);
                  if (!visitedRealPaths.has(realFolder)) {
                    visitedRealPaths.add(realFolder);
                    node.children = await buildTreeAsync(fullPath, depth + 1);
                  }
                } catch (e) {}
              }
            }

            return currentLevelNodes;
          }

          const tree = await buildTreeAsync(realTarget, 0);

          return {
            rootPath: realTarget,
            rootName: path.basename(realTarget),
            tree,
            totalCount: totalItemCount,
            isTruncated: totalItemCount >= MAX_TOTAL_ITEMS
          };
        } catch (err) {
          return { error: err.message };
        }
      })(),
      2500,
      {
        rootPath: targetDir,
        rootName: path.basename(targetDir),
        tree: [],
        totalCount: 0,
        isTimeout: true
      }
    );
  });

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
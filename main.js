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
// 自动初始化 35 个内置 Matt Pocock 技能
// ---------------------------------------------------------------------------
function initBuiltinSkills() {
  try {
    const userHome = os.homedir();
    const targetDir = path.join(userHome, ".codex", "skills");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const sourceSkillsDir = path.join(__dirname, ".agents", "skills");
    if (fs.existsSync(sourceSkillsDir)) {
      const skills = fs.readdirSync(sourceSkillsDir);
      for (const s of skills) {
        const srcPath = path.join(sourceSkillsDir, s);
        const destPath = path.join(targetDir, s);
        if (fs.statSync(srcPath).isDirectory()) {
          if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
            const files = fs.readdirSync(srcPath);
            for (const f of files) {
              fs.copyFileSync(path.join(srcPath, f), path.join(destPath, f));
            }
          }
        }
      }
      console.log(`[codex-desktop] ✓ 自动部署 35 个技能到: ${targetDir}`);
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
          click: () => { if (mainWindow) mainWindow.webContents.send("menu-action", "theme:dark"); }
        },
        {
          label: "escook Dark Soft (柔和暗色)",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu-action", "theme:dark-soft"); }
        },
        {
          label: "escook Light (暖色调亮)",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu-action", "theme:light"); }
        },
        {
          label: "escook Light Soft (柔和亮色)",
          click: () => { if (mainWindow) mainWindow.webContents.send("menu-action", "theme:light-soft"); }
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

  mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    initBuiltinSkills();
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
    path: "/repos/Simon-yyy/codex-desktop/releases/latest",
    headers: { "User-Agent": "cline/3.0.0" }
  };

  https.get(options, (res) => {
    let body = "";
    res.on("data", (d) => body += d);
    res.on("end", () => {
      try {
        if (res.statusCode !== 200) {
          if (!isSilent) {
            dialog.showMessageBox(mainWindow || null, {
              type: "info",
              title: "检查更新",
              message: `当前已经是最新版本 (v${app.getVersion()})。`,
              buttons: ["确定"]
            });
          }
          return;
        }

        const data = JSON.parse(body);
        const latestTag = (data.tag_name || "").replace(/^v/, "");
        const currentVer = app.getVersion();

        if (latestTag && latestTag !== currentVer) {
          const exeAsset = (data.assets || []).find((a) => a.name && a.name.endsWith(".exe"));
          dialog.showMessageBox(mainWindow || null, {
            type: "info",
            title: "🎉 发现全新版本",
            message: `发现 Codex Desktop 全新版本 v${latestTag}（当前版本: v${currentVer}）！\n\n更新说明：\n${data.body || "常规性能提升与体验优化。"}`,
            buttons: ["⚡ 立即在应用内下载升级", "稍后再说"],
            defaultId: 0
          }).then(({ response }) => {
            if (response === 0 && exeAsset && exeAsset.browser_download_url) {
              startDownloadUpdate(exeAsset.browser_download_url, latestTag);
            }
          });
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
  isDownloadingUpdate = true;
  const tempDir = os.tmpdir();
  const installerPath = path.join(tempDir, `Codex-Desktop-Setup-${newVersion}.exe`);

  dialog.showMessageBox(mainWindow || null, {
    type: "info",
    title: "⚡ 开始下载更新",
    message: `已开始下载全新版本 v${newVersion} 安装包。\n下载完成后将自动启动安装升级，请稍候！`,
    buttons: ["知道了"]
  });

  downloadFile(assetUrl, installerPath).then(() => {
    isDownloadingUpdate = false;
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
  return {
    version: app.getVersion(),
    name: "Codex Desktop",
    harness: "OpenAI Codex Harness (Native Multimodal)",
    skillsCount: 35,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch
  };
});

ipcMain.handle("check-for-updates-manual", () => {
  checkForUpdates(false);
  return { success: true };
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
  // 原生 Node.js 底层 HTTP 请求管道 (通用双协议自适应: OpenAI 兼容 & Anthropic 原生)
    // 原生 Node.js 底层 HTTP 请求管道 (精准协议隔离与官方客户端指纹模拟)
  ipcMain.handle("call-llm-api", async (event, payload) => {
    const { endpoint, apiKey, body, customHeaders = {} } = payload;
    const https = require("https");
    const http = require("http");
    const url = require("url");

    return new Promise((resolve) => {
      const parsedUrl = url.parse(endpoint);
      const isHttps = parsedUrl.protocol === "https:";
      const client = isHttps ? https : http;

      const postData = JSON.stringify(body);
      const cleanKey = (apiKey || "").trim();

      // 判断是 Anthropic 原生端点还是 OpenAI 兼容端点
      const isAnthropicEndpoint = endpoint.includes("/messages");

      let headers = {};
      if (isAnthropicEndpoint) {
        // 纯净 Anthropic 官方客户端请求头 (模拟 Claude Code)
        headers = {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          "x-api-key": cleanKey,
          "anthropic-version": "2023-06-01",
          "User-Agent": "cline/3.0.0",
          "Accept": "application/json",
          "Connection": "keep-alive",
          ...customHeaders
        };
      } else {
        // 纯净 OpenAI / Codex 官方 CLI 请求头 (严禁携带 Anthropic 混杂头，防 WAF 拦截)
        headers = {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          "Authorization": cleanKey ? `Bearer ${cleanKey}` : "",
          "User-Agent": "cline/3.0.0",
          "Accept": "application/json",
          "Connection": "keep-alive",
          ...customHeaders
        };
      }

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.path,
        method: "POST",
        headers: headers,
        timeout: 60000
      };

      const req = client.request(options, (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { responseBody += chunk; });
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            body: responseBody
          });
        });
      });

      req.on("error", (e) => {
        resolve({
          ok: false,
          status: 0,
          statusText: "Network Error",
          body: JSON.stringify({ error: { message: e.message } })
        });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({
          ok: false,
          status: 408,
          statusText: "Request Timeout",
          body: JSON.stringify({ error: { message: "请求超时 (60s)，请检查中转站响应速度" } })
        });
      });

      req.write(postData);
      req.end();
    });
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
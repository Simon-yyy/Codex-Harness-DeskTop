import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const pkgPath = path.join(rootDir, 'package.json');
const releaseDir = path.join(rootDir, 'release');

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, idx)).toFixed(2) + ' ' + sizes[idx];
}

function computeSha256(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeMove(src, dest) {
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dest)) {
    try { fs.unlinkSync(dest); } catch(e) {}
  }
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    fs.copyFileSync(src, dest);
    try { fs.unlinkSync(src); } catch(e) {}
  }
}

const MAX_RETAINED_VERSIONS = 3;

function parseSemver(vStr) {
  const clean = vStr.replace(/^v/, '');
  const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

function compareSemver(a, b) {
  const sa = parseSemver(a);
  const sb = parseSemver(b);
  if (sa.major !== sb.major) return sa.major - sb.major;
  if (sa.minor !== sb.minor) return sa.minor - sb.minor;
  return sa.patch - sb.patch;
}

function pruneOldReleases() {
  if (!fs.existsSync(releaseDir)) return;
  const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
  
  // 找出所有形如 v1.0.0 的版本目录
  const versionFolders = entries
    .filter(e => e.isDirectory() && /^v\d+\.\d+\.\d+$/.test(e.name))
    .map(e => e.name)
    .sort(compareSemver); // 升序排序

  // 如果版本目录超过 3 个，删除最旧的
  if (versionFolders.length > MAX_RETAINED_VERSIONS) {
    const toDeleteCount = versionFolders.length - MAX_RETAINED_VERSIONS;
    const toDeleteFolders = versionFolders.slice(0, toDeleteCount);

    for (const folder of toDeleteFolders) {
      const fullPath = path.join(releaseDir, folder);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        process.stdout.write(`🧹 自动修剪历史旧版本: 已清理 release/${folder}/ (保留最新 ${MAX_RETAINED_VERSIONS} 个版本)\n`);
      } catch (err) {
        process.stderr.write(`清理旧版本 ${folder} 失败: ${err.message}\n`);
      }
    }
  }

  // 清理 release 根目录下的残留游离 .exe / .blockmap
  entries.forEach(e => {
    if (e.isFile() && (e.name.endsWith('.exe') || e.name.endsWith('.blockmap'))) {
      try {
        fs.unlinkSync(path.join(releaseDir, e.name));
      } catch (err) {}
    }
  });
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version;

  const versionFolder = path.join(releaseDir, `v${version}`);
  if (!fs.existsSync(versionFolder)) {
    fs.mkdirSync(versionFolder, { recursive: true });
  }

  const installerName = `Codex Desktop Setup ${version}.exe`;
  const blockmapName = `${installerName}.blockmap`;

  const srcInstaller = path.join(releaseDir, installerName);
  const srcBlockmap = path.join(releaseDir, blockmapName);

  const destInstaller = path.join(versionFolder, installerName);
  const destBlockmap = path.join(versionFolder, blockmapName);

  if (fs.existsSync(srcInstaller)) safeMove(srcInstaller, destInstaller);
  if (fs.existsSync(srcBlockmap)) safeMove(srcBlockmap, destBlockmap);

  const sha256 = computeSha256(destInstaller);
  const size = fs.existsSync(destInstaller) ? formatBytes(fs.statSync(destInstaller).size) : 'N/A';
  const notes = `# Codex Desktop v${version} 发布归档说明

- **版本号**：v${version}
- **安装包名称**：${installerName}
- **文件大小**：${size}
- **SHA-256 哈希**：${sha256}
- **归档路径**：release/v${version}/${installerName}

---

## 🌟 核心特性与更新 (Changelog)
- 🌊 **全链路 SSE 流式传输（Streaming）与字如泉涌实时交互**：首包 1~2s 建立管道并逐字推送，彻底解决大模型长思考被第三方网关/Nginx 90s 空闲挂断问题（彻底根治 socket hang up 与 60s 超时）
- ⚡ **自适应滑动心跳保活机制（Rolling Inactivity Timeout）**：长方案长推理持续吐字永不超时断开
- 💬 **主对话区视觉质感升级与指令一键复制**：全面升级对话流配色、圆角与排版呼吸感，支持用户指令一键复制与时间戳显示
- 🧹 **纯净化模型配置引擎**：彻底移除强行默认绑定，未填或清空时干净置空并提供友好指引
- 🚀 **对齐官方 Codex CLI v0.152.1 内核标准** 与多通道状态探测
- ⏳ **原生 Tab Queueing 指令排队执行流水线**：Agent 执行中连续排队派发任务并在完成后自动流水线执行
- ⚡ **内置 43 个全流程工业级与 Loop Engineering 技能** (含 Loop 三要素、目标验证、5+1架构、Maker-Checker、Comprehension Gap 等)
- 🧠 **2026 旗舰大模型矩阵** (首选 gpt-5.6-sol、gpt-5.4-mini、claude-3-7-sonnet 混合思考、deepseek-reasoner)
- ⌨️ **官方常用 Slash Commands 交互系统** (/status, /diff, /skills, /clear, /help)
- 🔄 **双轨全自动更新体系** (开机静默检测、优雅更新横条、实时流式下载进度与一键无缝重启升级)
- 🎨 **官方专业质感图标**：白底圆角矩形 + 经典墨黑 OpenAI / Codex 官方徽标
- 💬 **响应式会话管理系统**：支持 + 新建会话、多会话历史切换、无损恢复与跨会话持久化
- 🖼️ **原生多模态剪贴板图片拦截** (Ctrl+V) 与文件上传，模型直接看图编程
- 🎨 **内置 VS Code 4 款经典高对比度美学配色** 与即时热切换
- 🛡️ **进程生命周期强守护** (0 端口残留)，静默无黑框运行
`;

  fs.writeFileSync(path.join(versionFolder, 'RELEASE_NOTES.md'), notes, 'utf8');
  process.stdout.write(`✓ Codex Desktop v${version} 已成功归档至 release/v${version}/ 目录！\n`);

  // 执行旧版本修剪清理
  pruneOldReleases();
}

main().catch(console.error);
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
  console.log(`✓ Codex Desktop v${version} 已成功归档至 release/v${version}/ 目录！`);
}

main().catch(console.error);
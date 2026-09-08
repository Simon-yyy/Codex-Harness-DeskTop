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
- 🛡️ **脱机网络盘文件树超时熔断**：主进程文件树扫描改为 \`fs.promises\` 异步管道，2.5 秒超时强制熔断，杜绝同步 I/O 阻塞主线程导致窗口黑屏。
- 🧹 **工作区一键剔除与优雅降级**：侧边栏支持删除失效工作区；扫描超时或驱动器脱机时展示警示卡片，可重试或清除。
- 🔒 **历史会话落盘状态机守卫**：仅刚结束的流式生成允许写盘，加载历史消息严禁重复落盘。
- 📑 **审查报告与设计方案直落工作区**：告别全篇堆砌在对话流中刷屏，大模型输出完整文档包裹在带 filepath 的代码块中自动落盘，并在顶部呈现【结构化审查报告 / 交付文档】卡片，支持一键存为工作区文档与侧边抽屉全景阅读。
- 📂 **写盘联动左侧文件树实时刷新 & 修复文件名连字符腰斩缺陷**：彻底解决带 \`-\` 连字符文件名在落盘探测时被正则腰斩丢失扩展名（如 \`docs/DISTRIBUTION\`）的恶性 Bug；写盘完成后左侧文件树立即触发无缝重新扫描，新目录与文件高亮呈现。
- ↔️ **侧边栏自由拖拽拉伸与持久化记忆**：移除侧边栏固定宽度限制，支持在右侧边缘按住鼠标自由拖拽缩放（220px ~ 600px），并自动持久化记忆用户偏好宽度。
- 🔤 **主题弹窗新增 Tab 切换与字体调节专区**：外观设置弹窗新增【🎨 主题配色】与【🔤 字体调节】切换栏，内置主流代码字体（JetBrains Mono、Cascadia Code、Fira Code、Consolas 等）与主流文本字体，支持 12/13/14px 代码字号调节，并打通 Tailwind 变量实现全局实时响应。
- ⏹️ **随时主动掐断生成 (Stop Generation)**：在模型流式吐字或推理时，输入框发送按钮自动切换为醒目的红色方形停止按钮，点击后通过主进程底层 \`req.destroy()\` 从物理网络层强行掐断连接，保留已截断内容，避免无谓流量计费。
- ✏️ **一键撤回提示词修改重发 (Revoke & Re-edit)**：用户消息气泡增加撤回修改操作，点击后自动成对抹去该轮问答（当前提问与对应助手回复），原样回填至输入框并自动聚焦，支持错别字修改后直接敲击回车重发。
- 🛡️ **跨平台 Node.js 原生安全护栏**：新增零外部依赖的原生跨平台脚本 \`block-dangerous-git.mjs\`，彻底解决 Windows 宿主缺乏 Bash 导致高危命令拦截失效的问题，内置 11 项全量自检。
- 🧹 **全流程 43 项技能静态健康扫描器**：编写零依赖健康校验脚本 \`scripts/check-skills.mjs\` 并接入 \`npm test\` 主测试管线，严格守卫技能元数据与防非法制表符。
- 🗂️ **技能生态规范与选型矩阵**：发布 \`.agents/skills/README.md\`，确立 Agent 工业技能与 Loop 测试技能两大形态，并厘清 \`grill-me\` 等轻量别名与组合委托范式。
- 🧼 **测试结果生成物 Git 出库治理**：排除 \`test-results.md\` 并从 Git 暂存索引中安全剥离，杜绝工程历史污染与冗余 Diff。
- 🗂️ **自选目标工作区归档对话**：重构会话归档机制，点击归档弹出工作区选择器，支持将对话归入任意已有工作区或浏览新目录归档，彻底告别单调隐藏
- 📂 **全量工业级工作区文件树扫描**：彻底解除 200 项与 3 层深度截断，容量扩容至 3000 项并放宽至 10 层深度，放行 \`.agents\`、\`.github\`、\`.vscode\` 等合法项目配置目录与点开头配置文件，深层文件夹全部可读
- 🎯 **回到底部按钮居中避让优化**：重构【回到底部】悬浮按钮为消息容器底部正中微光胶囊，100% 杜绝遮挡右侧附件上传、@ 引用及发送按钮
- 🐞 **用户问题反馈与脱敏诊断直达系统**：支持 Bug/功能建议/使用体验三分类，自动生成脱敏环境诊断包（绝不携带私钥明文与私有代码）；支持一键在默认浏览器打开预填好的 GitHub Issue，亦可一键复制结构化 Markdown 报告至剪贴板；快捷键 \`Ctrl+Shift+F\`、原生菜单栏、侧边栏底部 Bug 图标及关于弹窗均支持直达唤起
- 🎨 **对标主流 Agent 标准的 Markdown 规整排版与深色独立代码卡片**：自动识别语言类型（PowerShell, TypeScript, Java 等）、右上角独立一键复制代码按钮（带反馈）、H1~H4 层级标题、行内代码微光胶囊、加粗强调与有序/无序列表自然缩进
- 📜 **智能自适应滚动阅读历史锁**：流式生成中向上翻看历史对话超过 80px 时自动锁定视口，彻底消除 Token 强拉置底干扰，点击按钮或新提问平滑恢复
- 📁 **自定义本地工作区文件夹选择**：接入原生文件夹选择对话框，侧边栏真实工程文件树递归展示、动态折叠展开、持久化记忆与 “@” 符号引用注入
- 🖼️ **对话流“去盒子化”视觉重塑**：彻底消除 Agent 回复外层封闭大白卡片，纯净平铺画布排版，极简思维链微光折叠条
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
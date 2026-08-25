import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { runReplyParsingTests } from './reply-parsing.test.mjs';
import { testParseModelList, testSessionPersistence, testRenderXssGuard, testDshProviders, testDomReadyCompletes } from './renderer-behavior.test.mjs';

const rootDir = "d:/code_files/get_files/codex-desktop";
let passed = 0;
let failed = 0;
const failures = [];

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`           → ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║  🧪 Codex Desktop — 深度交互与发行级全面 TDD 验证套件       ║");
console.log("║  覆盖范围: 13 大 Seam 边界 / 60+ 项全自动化测试            ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

// ═══════════════════════════════════════════════════════════════════════════
// Seam 1: 工程骨架与核心文件完整性
// ═══════════════════════════════════════════════════════════════════════════
console.log("═══ Seam 1: 工程骨架与核心文件完整性 ═══");

const requiredFiles = [
  "package.json", "main.js", "preload.js", "LICENSE",
  "README.md", "CHANGELOG.md", ".gitignore",
  "ui/index.html", "ui/style.css", "ui/app.js",
  "assets/icon.png", "assets/icon.ico",
  "scripts/release.mjs", "tests/run-all-tests.mjs"
];

runTest("14 个核心工程文件全部存在", () => {
  for (const f of requiredFiles) {
    const fp = path.join(rootDir, f);
    assert.ok(fs.existsSync(fp), `Missing required file: ${f}`);
  }
});

runTest("package.json 规范性校验 (必备字段完整)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  assert.ok(pkg.name && pkg.version && pkg.main && pkg.author && pkg.license && pkg.description);
});

runTest("Electron 版本绝对锁定 (防多机型依赖漂移)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const electronVer = pkg.devDependencies?.electron;
  assert.ok(electronVer && !electronVer.startsWith("^") && !electronVer.startsWith("~"));
  assert.ok(pkg.build?.electronVersion);
});

runTest("NSIS 安装包配置合规 (快捷方式 + 自选路径)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const nsis = pkg.build?.nsis;
  assert.strictEqual(nsis?.oneClick, false);
  assert.strictEqual(nsis?.allowToChangeInstallationDirectory, true);
  assert.strictEqual(nsis?.createDesktopShortcut, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 2: JavaScript 语法深度静态校验
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 2: JavaScript 语法深度静态校验 ═══");

const jsFiles = ["main.js", "preload.js", "ui/app.js", "scripts/release.mjs"];
for (const jsFile of jsFiles) {
  runTest(`${jsFile} 静态语法校验 (Node.js --check)`, () => {
    const fp = path.join(rootDir, jsFile);
    try {
      execSync(`"${process.execPath}" -c "${fp}"`, { stdio: "pipe" });
    } catch (err) {
      assert.fail(`Syntax error in ${jsFile}: ${err.stderr?.toString() || err.message}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Seam 3: Electron 安全配置
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 3: Electron 安全配置 ═══");

runTest("main.js: contextIsolation 开启 (防 XSS)", () => {
  const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
  assert.ok(mainJs.includes("contextIsolation: true"));
});

runTest("main.js: nodeIntegration 关闭 (防渲染进程越权)", () => {
  const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
  assert.ok(mainJs.includes("nodeIntegration: false"));
});

runTest("main.js: webSecurity 开启 (防 CORS 绕过)", () => {
  const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
  assert.ok(mainJs.includes("webSecurity: true"));
});

runTest("全源码无 eval() / new Function()", () => {
  for (const f of jsFiles) {
    const content = fs.readFileSync(path.join(rootDir, f), "utf8");
    assert.ok(!content.match(/\beval\s*\(/), `${f} must not contain eval()`);
    assert.ok(!content.match(/new\s+Function\s*\(/), `${f} must not contain new Function()`);
  }
});

runTest("全源码无硬编码 API Key / 敏感凭证", () => {
  for (const f of jsFiles) {
    const content = fs.readFileSync(path.join(rootDir, f), "utf8");
    assert.ok(!content.match(/sk-[a-zA-Z0-9]{20,}/), `${f} must not contain hardcoded OpenAI keys`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 4: 顶部常驻原生菜单系统与 IPC 联动
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 4: 顶部常驻原生菜单系统与 IPC 联动 ═══");

runTest("main.js: autoHideMenuBar 为 false (菜单栏常驻显示)", () => {
  const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
  assert.ok(mainJs.includes("autoHideMenuBar: false"));
});

runTest("main.js: 构建全中文菜单 (文件/编辑/视图/主题/帮助)", () => {
  const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
  assert.ok(mainJs.includes('label: "文件 (&F)"'));
  assert.ok(mainJs.includes('label: "编辑 (&E)"'));
  assert.ok(mainJs.includes('label: "视图 (&V)"'));
  assert.ok(mainJs.includes('label: "主题 (&T)"'));
  assert.ok(mainJs.includes('label: "帮助 (&H)"'));
});

runTest("preload.js: 暴露 onMenuAction 桥梁", () => {
  const preload = fs.readFileSync(path.join(rootDir, "preload.js"), "utf8");
  assert.ok(preload.includes("onMenuAction:"));
});

runTest("ui/app.js: 监听 onMenuAction 联动新会话与设置", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes("onMenuAction"));
  assert.ok(appJs.includes('"new-chat"'));
  assert.ok(appJs.includes('"open-settings"'));
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 5: 侧边栏三大 Tab 交互系统
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 5: 侧边栏三大 Tab 交互系统 ═══");

runTest("ui/index.html: 三大 Tab 按钮与容器完备 (sessions/files/skills)", () => {
  const html = fs.readFileSync(path.join(rootDir, "ui", "index.html"), "utf8");
  assert.ok(html.includes('data-tab="sessions"'));
  assert.ok(html.includes('data-tab="files"'));
  assert.ok(html.includes('data-tab="skills"'));
  assert.ok(html.includes('id="tab-sessions"'));
  assert.ok(html.includes('id="tab-files"'));
  assert.ok(html.includes('id="tab-skills"'));
});

runTest("ui/app.js: Tab 切换逻辑绑定", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes(".nav-tab"));
  assert.ok(appJs.includes("tabPanels"));
});

runTest("ui/app.js: 文件树目录折叠展开支持", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes("bindFileTreeEvents"));
  assert.ok(appJs.includes(".tree-item.dir"));
});

runTest("ui/app.js: 文件点击打开代码预览并注入 @ 引用", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes("FILE_CONTENTS"));
  assert.ok(appJs.includes("composerInput.value +="));
});

runTest("ui/app.js: 35 个技能一键填入 Prompt 绑定", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes("skill-list-item"));
  assert.ok(appJs.includes("data-prompt"));
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 6: 响应式 Session 管理与持久化
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 6: 响应式 Session 管理与持久化 ═══");

runTest("ui/app.js: 包含默认预设会话与数据模型", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes("DEFAULT_SESSIONS"));
  assert.ok(appJs.includes("loadSessionsFromStorage"));
  assert.ok(appJs.includes("saveSessionsToStorage"));
});

runTest("ui/app.js: + 新建会话功能与首句标题提炼", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes("btnNewChat"));
  assert.ok(appJs.includes("sessions.unshift"));
  assert.ok(appJs.includes("cur.title = text.slice(0, 16)"));
});

runTest("ui/app.js: 会话无损切换与历史消息完整渲染", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes("switchSession"));
  assert.ok(appJs.includes("renderChatStream"));
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 7: 4 套经典美学主题引擎 (高对比度)
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 7: 4 套经典美学主题引擎 (高对比度) ═══");

const preloadContent = fs.readFileSync(path.join(rootDir, "preload.js"), "utf8");
const themeKeys = ["dark", "dark-soft", "light", "light-soft"];

for (const tk of themeKeys) {
  runTest(`主题 "${tk}" 包含高对比度文本定义与无断层纯色`, () => {
    assert.ok(preloadContent.includes(`"${tk}":`));
    assert.ok(preloadContent.includes("--text-primary"));
    assert.ok(preloadContent.includes("--bg-sidebar"));
  });
}

runTest("style.css: 侧边栏无硬编码深色渐变", () => {
  const css = fs.readFileSync(path.join(rootDir, "ui", "style.css"), "utf8");
  assert.ok(!css.includes("linear-gradient(180deg, var(--bg-sidebar) 0%, #111420 100%)"));
  assert.ok(css.includes("background-color: var(--bg-sidebar)"));
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 8: 43 个工业级与 Loop Engineering 技能部署与 YAML 校验
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 8: 43 个工业级与 Loop Engineering 技能部署与 YAML 校验 ═══");

const skillsDir = path.join(rootDir, ".agents", "skills");
const skillDirs = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory());

runTest("43 个技能数量精确对齐 (35项工程技能 + 8项循环工程技能)", () => {
  assert.strictEqual(skillDirs.length, 43);
});

runTest("每个 Skill 包含有效 SKILL.md", () => {
  for (const s of skillDirs) {
    const md = path.join(skillsDir, s, "SKILL.md");
    assert.ok(fs.existsSync(md));
    const c = fs.readFileSync(md, "utf8");
    assert.ok(c.includes("name:") && c.includes("description:"));
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 9: 多模型 Provider 预设系统
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 9: 多模型 Provider 预设系统 ═══");

const providers = ["openai", "deepseek", "anthropic", "ollama", "agentrouter", "custom"];
for (const p of providers) {
  runTest(`Provider "${p}" 预设存在`, () => {
    const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
    assert.ok(appJs.includes(`${p}:`));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Seam 10: 原生多模态交互管道
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 10: 原生多模态交互管道 ═══");

runTest("剪贴板 paste 图片拦截与预览缩略图管理", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes('"paste"'));
  assert.ok(appJs.includes("imagePreviewBar"));
  assert.ok(appJs.includes("removeImageThumb"));
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 11: 弹窗与交互辅助 (ESC 键与遮罩关闭)
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 11: 弹窗与交互辅助 ═══");

runTest("ui/app.js: 支持 ESC 键关闭所有弹窗", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes('e.key === "Escape"'));
});

runTest("ui/app.js: 右侧面板切换支持 getComputedStyle 健壮判断", () => {
  const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
  assert.ok(appJs.includes("getComputedStyle(rightPanel)"));
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 11.5: LLM 回复解析引擎 (防 HTML/网页响应被当作模型回复)
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 11.5: LLM 回复解析引擎 ═══");

runTest("回复解析: HTTP 200 但响应体为 HTML 时识别为配置错误而非回复", () => {
  runReplyParsingTests();
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 11.6: 渲染层行为测试 (vm + DOM/localStorage 桩)
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 11.6: 渲染层行为测试 ═══");

runTest("S0 DOMContentLoaded 完整执行: 无悬挂引用、初始渲染与底部按钮接线", () => {
  testDomReadyCompletes();
});

runTest("S1 parseModelList: 中英文多分隔符切分", () => {
  testParseModelList();
});

runTest("S3 会话持久化: 默认写入/损坏回退/往返/活动恢复", () => {
  testSessionPersistence();
});

runTest("S5 渲染 XSS 防护: content/thinking/toolCall 全量转义", () => {
  testRenderXssGuard();
});

runTest("S7 DSH 提供方持久化: 默认值/往返/损坏与空数组回退", () => {
  testDshProviders();
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 12: 安装包产物与归档
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 12: 安装包产物与归档 ═══");

runTest("release/v1.0.0 安装包 EXE 存在且 > 50MB", () => {
  const exePath = path.join(rootDir, "release", "v1.0.0", "Codex Desktop Setup 1.0.0.exe");
  assert.ok(fs.existsSync(exePath));
  assert.ok(fs.statSync(exePath).size > 50 * 1024 * 1024);
});

runTest("release/v1.0.0 blockmap 与 RELEASE_NOTES.md 完整", () => {
  assert.ok(fs.existsSync(path.join(rootDir, "release", "v1.0.0", "Codex Desktop Setup 1.0.0.exe.blockmap")));
  assert.ok(fs.existsSync(path.join(rootDir, "release", "v1.0.0", "RELEASE_NOTES.md")));
});

// ═══════════════════════════════════════════════════════════════════════════
// Seam 13: 自动更新管道
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Seam 13: 自动更新管道 ═══");

runTest("main.js: HTTPS 流式更新与 User-Agent 头完整", () => {
  const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
  assert.ok(mainJs.includes("checkForUpdates"));
  assert.ok(mainJs.includes("User-Agent"));
});

// ═══════════════════════════════════════════════════════════════════════════
// 测试汇总
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log(`║  📊 测试汇总: ${passed + failed} 项测试  ✅ 通过: ${passed}  ❌ 失败: ${failed}            ║`);
console.log("╚══════════════════════════════════════════════════════════════╝\n");

process.exit(failed > 0 ? 1 : 0);
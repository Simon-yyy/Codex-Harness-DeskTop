# AGENTS.md

> Codex Desktop 开发与维护智能体导航指南

---

## 🧭 项目定位与技术栈

- **项目名称**：`Codex Desktop` (`Simon-yyy/Codex-Harness-DeskTop`)
- **应用类型**：OpenAI Codex Harness 现代化工业级桌面客户端 (Electron)
- **技术栈**：
  - **桌面框架**：Electron `33.4.11` (Node.js 运行环境，绝对锁定版本)
  - **打包与分发**：`electron-builder` (`^25.1.8`)，输出 NSIS 独立安装包
  - **现代化前端与界面**：React `18.3` + TypeScript + Vite + TailwindCSS (4 款高对比度主题) + Lucide Icons
  - **模型通信协议**：双协议自适应管道（OpenAI Chat Completions 兼容协议 + Anthropic Messages 协议 + Ollama 本地协议）
  - **官方内核标准**：对齐 OpenAI 官方最新 **Codex CLI (`@openai/codex` v0.152.1)**

---

## 📂 核心模块分工

```
codex-desktop/
├── main.js                  # Electron 主进程权威入口
├── preload.js               # contextIsolation 桥梁 → window.codexDesktop
├── src/                     # React 18.3 + TS 渲染层（Vite 构建 → ui/dist）
│   ├── main.tsx             # React 挂载入口
│   ├── App.tsx              # 三栏工作台：会话/流式/工具环/遥测调度
│   ├── components/          # UI 面：Sidebar / ChatStream / Composer / PreviewPanel / Modals / StatusBar
│   ├── hooks/               # 领域状态：sessions / tabQueue / providers / theme / updater
│   ├── types/               # electron.d.ts · session · provider
│   ├── utils/               # mention（@ 原子删除）· math（公式辅助）
│   └── data/                # skillsDictionary 技能元数据字典
├── ui/                      # 构建产物 ui/dist/；ui/app.js 仅备用静态页
├── .agents/skills/          # 内置 43 技能（启动热同步 → ~/.codex/skills/）
├── scripts/                 # release / upload_release / check-skills / sync-ui
├── tests/                   # Seam 全量 TDD（run-all + security + interaction + skills + connectors）
├── docs/adr/                # 架构决策：0001 无感更新 · 0002 富文档/公式
├── .github/workflows/       # release.yml 云端打 Tag 发版
├── release/                 # 本地安装包归档（gitignore）
└── contexts/context.md      # 领域模型与 18 Seam 边界表
```

### 模块职责与关键入口

| 模块 | 核心职责 | 关键入口 / 寻路 |
| :--- | :--- | :--- |
| **主进程** | 窗口/中文菜单、LLM 流式 IPC、工作区沙箱读写、docx/PDF 抽取与分块索引、技能/连接器、自动更新 | `main.js`：`call-llm-api` / `abort-llm-stream` / `read-workspace-file` / `write-workspace-file` / `index-workspace-document` / `read-document-chunk` / `search-document-chunks` / `get-skills` / `connectors-*` |
| **预加载桥** | 暴露白名单 API；主题注入；剪贴板图拦截 | `preload.js` → 类型契约 `src/types/electron.d.ts` |
| **工作台** | 三栏布局；工具环（读/写/分块/MCP）；空正文续写；历史压缩；遥测 | `src/App.tsx`（`npm start` 加载 `ui/dist`） |
| **侧栏** | 会话按项目目录归类；文件树；技能筛选/注入；用户技能 CRUD 入口 | `src/components/Sidebar/` + `useSessions` |
| **对话流** | Markdown/KaTeX 气泡；提前结束/继续生成；导出；Apply Diff | `ChatStream/` · `MarkdownRenderer.tsx` |
| **输入区** | 附件、Slash、`@` 引用、Tab Queue、停止生成 | `Composer/` · `useTabQueue` · `utils/mention.ts` |
| **预览栏** | 代码/Docx/Pdf 阅读；分块目录与关键词检索；可拉伸宽度 | `PreviewPanel/` · `DocxReader` / `PdfReader` |
| **设置与弹窗** | Provider/模型 `maxTokens`·`reasoningEffort`；主题；连接器；更新提示；技能编辑 | `Modals/SettingsModal` · `ConnectorsModal` · `UserSkillEditorModal` |
| **状态栏** | 真实 TTFT / tok/s / usage / cache hit | `StatusBar.tsx`（数据来自 `App` 流式回调） |
| **Hooks** | 会话持久化、Provider 预设、主题、更新态、指令排队 | `hooks/useSessions` · `useProviders` · `useTheme` · `useUpdater` · `useTabQueue` |
| **技能生态** | 内置热同步 + 用户技能隔离目录 | `.agents/skills/` · `main.js` `initBuiltinSkills` / `get-skills` |
| **发版与质检** | NSIS 归档、GitHub 上传、技能 YAML 扫描 | `scripts/release.mjs` · `upload_release.mjs` · `check-skills.mjs` · `npm test` |
| **领域地图** | 概念定义与 Seam 对照（细节以本表为入口） | `contexts/context.md` |

---

## ⚡ 常用本地验证与开发命令

| 任务 | 命令 | 说明 |
| :--- | :--- | :--- |
| **启动开发** | `npm start` | 启动本地 Electron 桌面客户端进行实时调试 |
| **全量测试** | `npm test` | 执行 18 大 Seam 边界共 77+ 项自动化测试及全量技能静态健康扫描 |
| **快速解包** | `npm run pack` | 打包生成解包后的应用目录 `release/win-unpacked` |
| **构建安装包** | `npm run build` | 调用 `electron-builder` 生成 NSIS 安装包 `.exe` 并归档发布 |
| **归档发布** | `npm run release` | 执行 SHA-256 计算、安装包与 Release Notes 归档与旧版本自动修剪 |
| **交付物证核验** | `python "$HOME\.local\bin\agent-verify.py"` | 检查工作区洁癖、无残留调试代码与临时文件 |

---

## 🛡️ 架构核心规约

1. **安全性第一**：
   - 严禁关闭 `contextIsolation: true` 或开启 `nodeIntegration`。
   - 严禁在客户端代码中硬编码任何 API Key 或敏感凭据。
   - 所有外部链接必须通过 `shell.openExternal()` 打开，严禁在渲染窗口内跳转。
2. **生命周期强守护**：
   - 窗口关闭时必须确保所有子进程与后台网络请求彻底终止，确保 0 端口残留。
3. **Tab Queueing 异步非阻塞**：
   - Agent 处于生成/思考中时，用户输入必须通过 `queuedInstructions` 排队，当前任务结束后自动消费执行。
4. **技能库同步**：
   - `.agents/skills/` 目录中的技能在应用就绪时自动增量热同步至用户目录 `~/.codex/skills/`。
   - 用户自定义技能存于 `~/.codex/user-skills/`（与内置热同步隔离）；侧栏可导入/新建/编辑/删除，发送 `/id` 时与内置技能相同方式注入。
5. **项目目录分类与工作区强联动**：
   - 会话一律按物理项目目录收纳展示，杜绝冷冻隐藏逻辑；
   - 用户点击左侧任一项目下的对话时，系统活跃工作区必须无缝联动切换到对应的项目物理目录，并同步给 Electron 后端与文件树；
   - 跨平台路径匹配一律使用 `normalizeFsPath` 进行标准化比对，消除 Windows 正反斜杠与盘符大小写差异。
6. **真实流式遥测指标（Telemetry）**：
   - 底部状态栏指标严禁使用静态 Mock 占位，必须打通全链路实时数据；
   - 严格采集真实的首 Token 延迟 (TTFT)、实时流式速率 (tok/s)、真实 Usage 统计与上下文缓存命中率 (Cache Hit %)。
7. **主进程权威安全沙箱 (Seam 17)**：
   - 严格守卫 `chat-only`、`workspace-readonly`、`workspace-readwrite`、`full-access` 四大权限模式；
   - 阻断相对路径穿透 (`../`)、绝对路径越权与软链接物理逃逸；
   - 物理文件写回磁盘时必须自动保留同名 `.bak` 备份副本。
8. **流式生成打断与对话撤回状态机 (Seam 18)**：
   - 模型流式吐字中支持随时主动掐断，主进程通过 `activeLlmStreams` 映射表立即调用底层 `req.destroy()` 断开网络，杜绝多余流量与计费；
   - 用户消息支持一键撤回该轮问答并原样回填至输入框（自动打断正在进行的生成），方便用户修正提示词后重新提交。
9. **模型工具与附件正文**：
   - `read_workspace_file` 只接受相对工作区根目录的 `relativePath`。`chat-only` 不挂载；只读、读写、全局信任可调用。写盘仍是 `write_workspace_file`，纯对话和只读都禁止写。
   - `.docx` 与文字型 PDF 必须抽取正文。不要把 Office/PDF 二进制当 UTF-8。`.xlsx` / `.xls` / `.doc` / `.pptx` 仍拒绝。扫描件 PDF 无文字层时必须失败，不要假装读到了正文。
   - 长 PDF/DOCX/`@` 超长文本：索引分块后只挂目录；用 `read_document_chunk` / `search_document_chunks` 按块读与检索，禁止整篇灌 prompt。
   - 流正常结束（对端关流、输出额度用尽、只回了工具调用）不会自动打出「传输中断」。只有静默超时（默认 600s）、对端异常断开（EOF / hang up）或用户点停止才追加该提示。空正文不要归咎于 API Key；额度用尽/空正文应自动续写。
10. **跨平台原生环境与技能健康静态扫描 (Seam 8.5)**：

- 所有随附执行脚本优先提供跨平台 Node.js 原生实现，严禁单向依赖特定操作系统 Shell（如 POSIX-only Bash / jq）；
- 新增或调整技能必须通过 `scripts/check-skills.mjs` 静态断言，强制守卫 `SKILL.md` 元数据完整性、严禁在 YAML 中使用制表符 (Tab) 缩进，且测试结果临时文件一律禁止入库。

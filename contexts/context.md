# Context Map: Codex Desktop

> 项目全局精简上下文地图 · 快速建立领域认知

---

## 1. 核心概念与领域模型 (Domain Concepts)

- **Codex Harness**：封装大模型 API 通信、多模态附件、命令行交互与自动化指令流转的工业级宿主容器。
- **Core CLI / Daemon**：底层遵循 OpenAI 官方最新 **Codex CLI (`@openai/codex` v0.152.1)** 规范，支持本地环境探测与命令行能力。
- **Session (会话)**：独立对话单元，包含多轮历史消息、关联模型配置与专属指令排队队列 (`queuedInstructions`)，支持持久化到 `localStorage`。
- **Tab Queueing (指令流水线)**：官方前沿交互特性。当 Agent 正处于思考/生成回复期间，用户新输入的指令进入排队队列，当前任务完成后自动顺延触发。
- **Skills (技能生态)**：43 项预置工程技能（35 项工业级 + 8 项 Loop Engineering），启动时增量同步至 `~/.codex/skills/`。用户技能在 `~/.codex/user-skills/`，与内置热同步隔离，侧栏可导入、新建、编辑、删除。
- **Provider Presets (提供方预设)**：内置 OpenAI (旗舰 `gpt-5.6-sol`, `gpt-5.4-mini`)、Anthropic (`claude-3-7-sonnet` 混合思考)、DeepSeek (`deepseek-reasoner`) 与本地 Ollama；协议可选 Chat Completions / **Responses (`/v1/responses`)** / Anthropic Messages / Ollama。
- **Themes (主题引擎)**：4 款 VS Code 经典极客美学高对比度配色（`escook Dark`, `Dark Soft`, `Light`, `Light Soft`），支持快捷键与菜单毫秒级热切换。
- **Workspace Grouping (项目归类与联动)**：对话按真实工程物理目录收纳，切换对话自动联动切换当前全局工作区、主进程环境与代码树，使用 `normalizeFsPath` 保证跨平台一致性。
- **Streaming Telemetry (真实流式遥测)**：实时监控 TTFT (首 Token 耗时)、实时吐字速率 (tok/s)、真实输入/输出 Token 统计与上下文缓存命中率 (Cache Hit %)，消除任何静态假数据。
- **Security Sandbox (主进程安全沙箱)**：守卫 `chat-only`、`workspace-readonly`、`workspace-readwrite`、`full-access` 四种权限。只读/读写阻断 `../`、绝对路径越权与软链接逃逸。写回自动保留 `.bak`。
- **Workspace Tools (模型工具)**：`read_workspace_file` 只收相对路径，纯对话不挂载。`write_workspace_file` 负责写盘。`.docx` 与文字型 PDF 抽取正文；`.xlsx` / `.xls` / `.doc` / `.pptx` 拒绝。流正常结束不是「传输中断」。空正文不要当成 API Key 错误。
- **Abort & Rollback (中断与撤回机制)**：模型流式生成时可物理切断网络 (`req.destroy()`)，用户提问支持一键成对撤回并原样回填至输入框重发。
- **Agent Tool Loop (工具多批续跑)**：读/写/MCP 同回合内单批最多 15 轮；打满后仍有工具需求时自动开下一批（默认最多 3 批），始终复用 `roundMessages` 保留已读正文。会话末尾写入「已读文件上下文保留」摘录，用户点「继续生成」时可少重读。
- **Empty/Truncated Auto-Continue (空正文与额度截断续写)**：默认 `max_tokens=32768`（思考与正文共享）。若上游 `length`/`max_tokens`、正文为空或代码围栏未闭合，同回合自动续写最多 2 次（不新增用户气泡、续写请求不挂工具以迫使输出可见正文）；仍不足时保留「继续生成」按钮。
- **Cross-platform Guardrails & Skill Audit (跨平台护栏与技能扫描)**：内置零外部依赖跨平台 Git 拦截护栏与 43 项技能静态健康扫描器，守卫工程资产与操作安全。
- **Rich Document Pipeline (文档多模态与公式引擎)**：对齐学术论文与工业规范场景。主进程内置零依赖 OMML-to-LaTeX 转译器与媒体抽取器，前端集成 KaTeX 与 Canvas 视图，在右侧面板实现 Word/PDF 图文公式原生排版，并支持“一键引图入会话”无缝接入视觉大模型。
- **Long Document Chunk Index (长文档分块索引)**：`@` 挂载长 PDF/DOCX/Markdown 时抽取正文并切片缓存至 `userData/doc-index/<docId>/`，本轮只注入目录卡片；模型用 `read_document_chunk(docId, chunkId)` 按块阅读，并用 `search_document_chunks` 关键词检索。预览栏可浏览/检索分块。索引抽取上限约 50 万字符；单块返回上限约 1.2 万字符。扫描件需先 OCR。
- **Context Compact & Reasoning Dial**：历史消息自动压缩旧 carry/超长正文；设置可配 `maxTokens` 与思考强度（low/medium/high）。流式滑动静默默认 **600s**。

---

## 2. 核心架构与 18 大 Seam 边界 (含 Seam 8.5 技能扫描)

| Seam 编号 | 模块边界 | 负责文件 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **Seam 1~3** | 工程完整性与安全基线 | `package.json`, `main.js` | 锁定依赖、`contextIsolation: true`、无 eval/凭据泄漏 |
| **Seam 4** | 原生应用菜单 | `main.js`, `preload.js` | 全中文应用菜单栏与 IPC 双向事件分发 |
| **Seam 5** | 侧边栏多面板 | `src/components/Sidebar/`, `ui/app.js` | 会话列表、多项目工作区树、会话数量 Badge、43 技能实时筛选与注入 |
| **Seam 6** | 会话持久化与归类 | `src/hooks/useSessions.ts` | 会话增删查改、首次标题自动提取、项目归类收纳与误归档自愈 |
| **Seam 7** | 主题美学引擎 | `preload.js`, `ui/style.css` | 4 款配色 CSS 变量注入、高对比度与无缝热切换 |
| **Seam 8** | 技能库部署 | `main.js`, `.agents/skills/` | 43 项技能双目录增量热同步、YAML Frontmatter 校验 |
| **Seam 8.5** | 技能健康静态扫描 | `scripts/check-skills.mjs` | 43 项技能元数据非空、YAML 缩进防 Tab 与提示词语法合规断言 |
| **Seam 9** | 多模型服务商 | `src/hooks/useProviders.ts`, `main.js` | 多协议自适应、API Key 安全落盘与连通性测试 |
| **Seam 10** | 原生多模态 | `preload.js`, `ui/app.js` | 剪贴板图片拦截 (Ctrl+V)、安全落盘与视觉模型直接传图 |
| **Seam 11~11.6** | 交互辅助与解析 | `ui/app.js`, `tests/` | ESC 关闭模态框、LLM 返回 HTML 网页防误判、VM 状态机验证 |
| **Seam 12~13** | 打包与自动更新 | `.github/workflows/release.yml`, `scripts/release.mjs`, `main.js` | GitHub Actions 云端构建、NSIS `/S` 静默覆盖更新、镜像加速与 ADR 0001 决策记录 |
| **Seam 14** | 官方内核对齐 | `main.js`, `ui/app.js` | 官方 Codex CLI `v0.152.1` 状态检测与 2026 旗舰模型矩阵 |
| **Seam 15** | Tab Queueing | `src/components/Composer/`, `hooks/useTabQueue.ts` | 异步非阻塞指令排队、UI 状态指示条与流水线调度 |
| **Seam 16** | Slash Commands | `src/components/Composer/`, `ui/app.js` | 原生 `/status`, `/diff`, `/skills`, `/clear`, `/help` 指令调度 |
| **Seam 17** | 主进程权威安全沙箱 | `main.js`, `tests/workspace-security.test.mjs` | 路径穿透/软链接逃逸防御、二进制嗅探拦截、四种权限与物理 `.bak` 备份 |
| **Seam 18** | 流式中断、撤回、模型工具与 @ 原子删除 | `main.js`, `src/App.tsx`, `src/hooks/useSessions.ts`, `src/utils/mention.ts` | 物理掐断活跃 HTTP 连接、成对撤回问答；读/写工具与正文抽取；@ 文件引用整体删除 |

---

## 3. 关键文件索引

- 🚪 **主入口**：`main.js`
- 🌉 **桥接层**：`preload.js`
- 🖥️ **工作台**：`src/App.tsx`（`npm start` 加载 `ui/dist`；`ui/app.js` 只是备用静态页）
- 🗺️ **模块职责表**：`AGENTS.md` →「模块职责与关键入口」
- 🧪 **测试**：`tests/run-all-tests.mjs`、`tests/workspace-security.test.mjs`、`tests/interaction-features.test.mjs`
- 🔍 **技能健康扫描**：`scripts/check-skills.mjs`
- 📋 **技能说明**：`.agents/skills/README.md`
- 📦 **发版**：`scripts/release.mjs`
- 📖 **智能体指南**：`AGENTS.md`

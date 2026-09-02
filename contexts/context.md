# Context Map: Codex Desktop

> 项目全局精简上下文地图 · 快速建立领域认知

---

## 1. 核心概念与领域模型 (Domain Concepts)

- **Codex Harness**：封装大模型 API 通信、多模态附件、命令行交互与自动化指令流转的工业级宿主容器。
- **Core CLI / Daemon**：底层遵循 OpenAI 官方最新 **Codex CLI (`@openai/codex` v0.152.1)** 规范，支持本地环境探测与命令行能力。
- **Session (会话)**：独立对话单元，包含多轮历史消息、关联模型配置与专属指令排队队列 (`queuedInstructions`)，支持持久化到 `localStorage`。
- **Tab Queueing (指令流水线)**：官方前沿交互特性。当 Agent 正处于思考/生成回复期间，用户新输入的指令进入排队队列，当前任务完成后自动顺延触发。
- **Skills (技能生态)**：43 项预置工程技能（包含 35 项 Matt Pocock 工业级技能 + 8 项 Loop Engineering 循环工程技能），启动时自动增量部署至 `~/.codex/skills/`。
- **Provider Presets (提供方预设)**：内置 OpenAI (旗舰 `gpt-5.6-sol`, `gpt-5.4-mini`)、Anthropic (`claude-3-7-sonnet` 混合思考)、DeepSeek (`deepseek-reasoner`) 与本地 Ollama 协议适配。
- **Themes (主题引擎)**：4 款 VS Code 经典极客美学高对比度配色（`escook Dark`, `Dark Soft`, `Light`, `Light Soft`），支持快捷键与菜单毫秒级热切换。

---

## 2. 核心架构与 16 大 Seam 边界

| Seam 编号 | 模块边界 | 负责文件 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **Seam 1~3** | 工程完整性与安全基线 | `package.json`, `main.js` | 锁定依赖、`contextIsolation: true`、无 eval/凭据泄漏 |
| **Seam 4** | 原生应用菜单 | `main.js`, `preload.js` | 全中文应用菜单栏与 IPC 双向事件分发 |
| **Seam 5** | 侧边栏多面板 | `ui/index.html`, `ui/app.js` | 会话列表、文件工作区树折叠、43 技能实时筛选与注入 |
| **Seam 6** | 会话持久化 | `ui/app.js` | 多会话增删查改、首次标题自动提取、本地持久化存储 |
| **Seam 7** | 主题美学引擎 | `preload.js`, `ui/style.css` | 4 款配色 CSS 变量注入、高对比度与无缝热切换 |
| **Seam 8** | 技能库部署 | `main.js`, `.agents/skills/` | 43 项技能双目录增量热同步、YAML Frontmatter 校验 |
| **Seam 9** | 多模型服务商 | `ui/app.js`, `main.js` | 多协议自适应、API Key 安全落盘与连通性测试 |
| **Seam 10** | 原生多模态 | `preload.js`, `ui/app.js` | 剪贴板图片拦截 (Ctrl+V)、安全落盘与视觉模型直接传图 |
| **Seam 11~11.6** | 交互辅助与解析 | `ui/app.js`, `tests/` | ESC 关闭模态框、LLM 返回 HTML 网页防误判、VM 状态机验证 |
| **Seam 12~13** | 打包与自动更新 | `scripts/release.mjs`, `main.js` | NSIS 安装包构建、SHA-256 归档、GitHub Releases 流式下载 |
| **Seam 14** | 官方内核对齐 | `main.js`, `ui/app.js` | 官方 Codex CLI `v0.152.1` 状态检测与 2026 旗舰模型矩阵 |
| **Seam 15** | Tab Queueing | `ui/app.js`, `ui/index.html` | 异步非阻塞指令排队、UI 状态指示条与流水线调度 |
| **Seam 16** | Slash Commands | `ui/app.js`, `ui/index.html` | 原生 `/status`, `/diff`, `/skills`, `/clear`, `/help` 指令调度 |

---

## 3. 关键文件索引

- 🚪 **主入口**：[main.js](file:///d:/code_files/get_files/codex-desktop/main.js)
- 🌉 **桥接层**：[preload.js](file:///d:/code_files/get_files/codex-desktop/preload.js)
- 🖥️ **工作台 UI**：[ui/index.html](file:///d:/code_files/get_files/codex-desktop/ui/index.html) · [ui/app.js](file:///d:/code_files/get_files/codex-desktop/ui/app.js) · [ui/style.css](file:///d:/code_files/get_files/codex-desktop/ui/style.css)
- 🧪 **测试套件**：[tests/run-all-tests.mjs](file:///d:/code_files/get_files/codex-desktop/tests/run-all-tests.mjs)
- 📦 **发版流水线**：[scripts/release.mjs](file:///d:/code_files/get_files/codex-desktop/scripts/release.mjs)
- 📖 **智能体指南**：[AGENTS.md](file:///d:/code_files/get_files/codex-desktop/AGENTS.md)

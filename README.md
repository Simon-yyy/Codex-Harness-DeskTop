# Codex Desktop ⚡

> OpenAI Codex Harness 现代化、原生多模态、零配置门槛的工业级桌面端客户端。

[![Electron](https://img.shields.io/badge/Electron-33.4.11-47848F?logo=electron&logoColor=white)](https://electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Skills Armed](https://img.shields.io/badge/Skills-43%20Armed-orange.svg)](#-43-项全流程工业级与-loop-工程技能)
[![Codex CLI](https://img.shields.io/badge/Codex%20CLI-v0.152.1%20Aligned-green.svg)](#-官方标准与前沿模型矩阵)

---

## 🌟 核心特性与亮点

### 1. ⚡ 内置 43 项全流程工业级与 Loop 工程技能
- **Matt Pocock 35 项工业级技能**：涵盖 TDD 测试驱动、系统调试 (Diagnosing Bugs)、代码审查 (Code Review)、深层模块设计 (Codebase Design)、领域建模、Git 安全护栏等。
- **Loop Engineering 8 大循环工程技能**：涵盖 Loop 三要素设计、Loop 价值判断、目标验证 (Goal Verification)、5+1 架构审计、Maker-Checker 独立审查员、认知风险管理 (Comprehension Gap) 等。
- **首次启动自动热部署**：自动增量同步至用户目录 `~/.codex/skills/`，随时通过 `/` 快捷调用。

### 2. ⏳ 原生 Tab Queueing (指令队列流水线)
- **非阻塞多任务交互**：在 Agent 思考中或流式生成代码时，用户可继续输入后续指令，系统自动进入排队队列并在界面显示 `⏳ 指令排队中` 胶囊。
- **自动流水线调度**：当前轮次任务执行完成后，系统自动出队并无缝执行下一条指令。

### 3. ⌨️ 官方常用 Slash Commands 快捷交互
- 支持输入 `/` 呼出快捷指令浮层：
  - `/status`：实时探测 Codex CLI 内核 (`v0.152.1`)、43 项装载技能与环境运行状态。
  - `/diff`：实时查看工作区代码与状态变更摘要。
  - `/skills`：展开侧边栏技能库面板并快速筛选。
  - `/clear`：优雅清空当前会话历史。
  - `/help`：调出快捷指令帮助文档。

### 4. 🧠 2026 旗舰大模型矩阵与双协议自适应
- **OpenAI 官方首选**：`gpt-5.6-sol`、`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.5`、`o3-mini`、`o1`。
- **Anthropic 混合推理**：`claude-3-7-sonnet` (支持原生 Thinking 深度思考过程折叠)。
- **DeepSeek 旗舰**：`deepseek-reasoner` (R1 推理)、`deepseek-chat` (V3)。
- **本地离线模型**：一键直连本地 Ollama (`llama3.3`, `qwen2.5-coder`, `deepseek-r1:7b`)。

### 5. 🎨 4 款 VS Code 经典极客高对比度美学配色
- 内置 `escook Dark` (经典暗黑)、`Dark Soft` (柔和暗黑)、`Light` (经典暖调浅色)、`Light Soft` (柔和浅色)，支持菜单与全局快捷键毫秒级热切换。

### 6. 🖼️ 原生多模态剪贴板图片拦截与拖拽
- 支持 `Ctrl+V` 直接从剪贴板粘贴截图或拖拽多格式文件，提供多模态缩略图管理与视觉直接分析。

### 7. 🛡️ 进程生命周期强守护与双轨全自动更新
- 随窗口关闭 100% 销毁后台子进程，确保 **0 端口残留**，后台调用静默无黑框。
- 集成 GitHub Releases 流式自动更新检查、无感下载与一键无缝重启升级。

---

## 📂 项目结构概览

```
codex-desktop/
├── main.js                  # Electron 主进程：窗口管理、原生中文菜单、自动更新流、IPC 管道、技能热同步
├── preload.js               # 安全预加载脚本：上下文隔离桥梁、主题引擎注入、原生剪贴板拦截
├── src/                     # 现代化 React 19 + TypeScript 渲染层
│   ├── main.tsx             # React 渲染入口
│   ├── App.tsx              # 主工作台三栏布局与领域状态调度
│   ├── components/          # 独立组件库 (Sidebar, ChatStream, Composer, PreviewPanel, Modals)
│   ├── hooks/               # 响应式状态机 (useSessions, useTabQueue, useProviders, useTheme, useUpdater)
│   ├── types/               # 全链路强类型定义 (electron.d.ts, session.ts, provider.ts)
│   └── styles/              # TailwindCSS 与 4 款高对比度主题变量
├── ui/                      # 渲染进程构建产物 (ui/dist/) 与同构静态支持
├── .agents/skills/          # 内置 43 项全流程工业级与 Loop Engineering 技能库 (启动时自动增量部署)
├── scripts/
│   ├── release.mjs          # 发版流水线：SHA-256 校验、版本产物自动归档至 release/v<version>/、发布说明生成
│   ├── sync-ui.mjs          # UI 双向同构同步流水线
│   └── upload_release.mjs   # GitHub Releases 自动化上传脚本
├── tests/                   # 16 大 Seam 边界全自动化 TDD 测试套件
│   ├── run-all-tests.mjs    # 主测试执行器 (58 项全量单元与集成断言)
│   ├── renderer-behavior.test.mjs # 渲染层 VM + DOM 桩行为测试
│   └── reply-parsing.test.mjs     # LLM 响应解析与防 HTML 误判测试
├── release/                 # 发布产物与安装包归档目录
└── contexts/
    └── context.md           # 精简上下文地图与领域模型
```

---

## 📦 快速开始与开发指令

### 1. 启动本地调试
```bash
npm start
```

### 2. 执行自动化测试 (16 Seams / 58 Tests)
```bash
npm test
```

### 3. 构建 NSIS 独立安装包
```bash
npm run build
```

### 4. 发版归档与 SHA-256 校验
```bash
npm run release
```

---

## 📄 开源协议

MIT License (c) 2026 Simon-yyy

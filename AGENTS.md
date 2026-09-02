# AGENTS.md

> Codex Desktop 开发与维护智能体导航指南

---

## 🧭 项目定位与技术栈

- **项目名称**：`Codex Desktop` (`Simon-yyy/Codex-Harness-DeskTop`)
- **应用类型**：OpenAI Codex Harness 现代化工业级桌面客户端 (Electron)
- **技术栈**：
  - **桌面框架**：Electron `33.4.11` (Node.js 运行环境，绝对锁定版本)
  - **打包与分发**：`electron-builder` (`^25.1.8`)，输出 NSIS 独立安装包
  - **前端与界面**：原生 HTML5 + 现代化 Vanilla CSS (4 款高对比度主题) + Vanilla JavaScript (ES2022)
  - **模型通信协议**：双协议自适应管道（OpenAI Chat Completions 兼容协议 + Anthropic Messages 协议 + Ollama 本地协议）
  - **官方内核标准**：对齐 OpenAI 官方最新 **Codex CLI (`@openai/codex` v0.152.1)**

---

## 📂 核心模块分工

```
codex-desktop/
├── main.js                  # Electron 主进程：窗口管理、原生中文菜单、自动更新流、IPC 管道、技能热同步
├── preload.js               # 安全预加载脚本：上下文隔离桥梁、主题引擎注入、原生剪贴板拦截
├── ui/                      # 渲染进程前端工作台
│   ├── index.html           # 界面骨架：侧边栏(会话/文件/技能)、消息流、排队指示条、Composer输入区、模型弹窗
│   ├── style.css            # 现代美学设计系统：CSS 变量、4 套高对比度主题、微动效与响应式布局
│   └── app.js               # 核心渲染逻辑：会话持久化、Tab Queueing 调度、Slash 指令系统、大模型请求解析
├── .agents/skills/          # 内置 43 项全流程工业级与 Loop Engineering 技能库 (启动时自动增量部署)
├── scripts/
│   ├── release.mjs          # 发版流水线：SHA-256 校验、版本产物自动归档至 release/v<version>/、发布说明生成
│   └── upload_release.mjs   # GitHub Releases 自动化上传脚本
├── tests/                   # 16 大 Seam 边界全自动化 TDD 测试套件
│   ├── run-all-tests.mjs    # 主测试执行器 (57 项全量单元与集成断言)
│   ├── renderer-behavior.test.mjs # 渲染层 VM + DOM 桩行为测试
│   └── reply-parsing.test.mjs     # LLM 响应解析与防 HTML 误判测试
├── release/                 # 发布产物与安装包归档目录
└── contexts/
    └── context.md           # 精简上下文地图与领域模型
```

---

## ⚡ 常用本地验证与开发命令

| 任务 | 命令 | 说明 |
| :--- | :--- | :--- |
| **启动开发** | `npm start` | 启动本地 Electron 桌面客户端进行实时调试 |
| **全量测试** | `npm test` | 执行 16 大 Seam 边界共 57 项自动化测试 |
| **快速解包** | `npm run pack` | 打包生成解包后的应用目录 `release/win-unpacked` |
| **构建安装包** | `npm run build` | 调用 `electron-builder` 生成 NSIS 安装包 `.exe` |
| **归档发布** | `npm run release` | 执行 SHA-256 计算、安装包与 Release Notes 归档 |
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

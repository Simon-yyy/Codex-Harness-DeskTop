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
├── main.js                  # Electron 主进程：窗口管理、原生中文菜单、自动更新流、IPC 管道、技能热同步
├── preload.js               # 安全预加载脚本：上下文隔离桥梁、主题引擎注入、原生剪贴板拦截
├── src/                     # 现代化 React 18.3 + TypeScript 渲染层
│   ├── main.tsx             # React 渲染入口
│   ├── App.tsx              # 主工作台三栏布局与领域状态调度
│   ├── components/          # 独立组件库 (Sidebar, ChatStream, Composer, PreviewPanel, Modals)
│   ├── hooks/               # 响应式状态机 (useSessions, useTabQueue, useProviders, useTheme, useUpdater)
│   ├── types/               # 全链路强类型定义 (electron.d.ts, session.ts, provider.ts)
│   └── styles/              # TailwindCSS 与 4 款高对比度主题变量
├── ui/                      # 渲染进程构建产物 (ui/dist/) 与原生备选静态文件
├── .agents/skills/          # 内置 43 项全流程工业级与 Loop Engineering 技能库 (启动时自动增量部署)
├── scripts/
│   ├── release.mjs          # 发版流水线：SHA-256 校验、版本产物自动归档至 release/v<version>/、发布说明生成
│   ├── upload_release.mjs   # GitHub Releases 自动化上传脚本
│   └── check-skills.mjs     # 43 项技能结构、元数据与 YAML 合规性零依赖静态健康扫描器
├── tests/                   # 18 大 Seam 边界全自动化 TDD 测试套件
│   ├── run-all-tests.mjs    # 主测试执行器 (58 项核心单元与集成断言)
│   ├── workspace-security.test.mjs # Seam 17 主进程权威安全沙箱攻击防护测试 (15+ 项向量断言)
│   ├── interaction-features.test.mjs # Seam 18 流式打断与消息撤回状态机专项测试 (4 项断言)
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
9. **跨平台原生环境与技能健康静态扫描 (Seam 8.5)**：
   - 所有随附执行脚本优先提供跨平台 Node.js 原生实现，严禁单向依赖特定操作系统 Shell（如 POSIX-only Bash / jq）；
   - 新增或调整技能必须通过 `scripts/check-skills.mjs` 静态断言，强制守卫 `SKILL.md` 元数据完整性、严禁在 YAML 中使用制表符 (Tab) 缩进，且测试结果临时文件一律禁止入库。

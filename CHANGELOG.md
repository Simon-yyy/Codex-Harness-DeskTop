# Codex Desktop 更新日志

All notable changes to this project will be documented in this file.

---

## [v1.0.2] - 2026-09-02
### 🎨 视觉排版与交互体验深度重构
- 🖼️ **图片与附件紧凑缩略图**：限制多模态附件与 Markdown 图片最大高度（`160px ~ 180px`），采用 `object-fit: cover / contain` 自适应居中，彻底消除超大图片占据大面积屏幕问题。
- 🔍 **原生全屏大图灯箱预览 (Lightbox)**：点击消息中的缩略图或 Markdown 图片，可立即弹出暗黑磨砂全屏大图预览，支持 ESC 键或点击空白一键关闭。
- 📏 **Composer 输入框紧凑低高度**：初始最小高度降低至 `28px`，内边距与外间距精简，配以 `28px` 极简圆形微动效发送按钮，支持输入多行时平滑自适应拉伸与发送后自动复位。
- 📱 **全局自适应宽度与响应式断点**：工作台与输入容器支持最大 `1080px` / `96%` 流体自适应居中，并对 1200px / 960px / 720px 建立了多端屏幕响应式断点体系。
- 🧠 **2026 旗舰模型增量同步**：增强 `getDshProviders` 智能增量合并，自动为存量历史配置补全 `OpenAI`、`Anthropic Claude`、`DeepSeek` 与新增的旗舰模型（`gpt-5.6-sol`、`gpt-5.4-mini`、`claude-3-7-sonnet` 等）。

---

## [v1.0.1] - 2026-09-02
### 🌟 官方最新特性与交互架构升级
- 🚀 **官方 Codex CLI 对齐**：基线全面对齐 OpenAI 官方最新 `@openai/codex` (`v0.152.1`)，优化系统 PATH 与本地守护进程探测。
- ⏳ **Tab Queueing (指令队列流水线)**：支持 Agent 执行与思考期间无阻塞排队发送多任务指令，任务结束后自动无缝调度执行。
- ⚡ **内置 43 项全流程技能库**：扩展集成 8 大 Loop Engineering 循环工程技能（Loop 三要素、目标验证、5+1架构、Maker-Checker、Comprehension Gap 等）。
- 🧠 **2026 旗舰大模型矩阵**：内置 `gpt-5.6-sol`、`gpt-5.4-mini`、`claude-3-7-sonnet` (混合思考深度折叠) 与 `deepseek-reasoner`。
- ⌨️ **Slash Commands 交互系统**：原生支持 `/status`、`/diff`、`/skills`、`/clear`、`/help` 快捷指令。
- 🧪 **自动化测试边界扩充**：新增 Seam 14~16 专项断言，测试用例扩展至 57 项全自动化测试（100% PASS）。
- 📦 **构建发版体系**：更新 `electron-builder` NSIS 打包与 SHA-256 自动归档流水线。

---

## [v1.0.0] - 2026-08-24
### 🚀 首次官方发布
- 🚀 基于 OpenAI Codex Harness 原生多模态架构设计
- ⚡ 内置 35 个工业级全流程 AI 编程技能 (Matt Pocock Skills 体系)
- 🖼️ 原生剪贴板图片 Ctrl+V 拦截与多模态预览挂载
- 🎨 内置 VS Code 彬哥 4 款经典美学配色与独立外观设置
- 🤫 后台子进程与命令行调用静默化改造（无黑框弹出）
- 🚀 应用内全自动流式下载升级 (In-App Auto Updater)

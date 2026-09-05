# Codex Desktop 技能生态库与选型指南 (Skills Directory)

> 本目录收录了 Codex Desktop 预置的 **43 项全流程工业级与循环工程 (Loop Engineering) 智能体技能**。
> 应用在启动就绪时，会自动增量热同步至用户主目录 `~/.codex/skills/`，可在客户端输入框输入 `/` 或通过左侧技能面板一键调用。

---

## 🧭 1. 技能形态规范矩阵

本目录所有技能均遵循标准化目录结构，统一入口为 `SKILL.md`，主要分为两大形态：

| 形态 | 核心特征 | 文件结构契约 | 典型代表 |
| :--- | :--- | :--- | :--- |
| **Agent-backed (工业全流程技能)** | 深度定义智能体行为、包含指令约束与提示词范式，配备 OpenAI / Claude 标准声明 | - 必须包含 `SKILL.md` (带 `name` / `description` 元数据)<br>- 包含 `agents/openai.yaml`<br>- 可选 `scripts/` (跨平台 Node.js 优先) | `tdd`, `codebase-design`, `code-review`, `domain-modeling` |
| **Loop-tested (循环工程技能)** | 聚焦自动化循环工作流与决策断言，自带标准回归测试提示词集 | - 必须包含 `SKILL.md`<br>- 包含 `test-prompts.json` 自动化测试集<br>- 运行生成物 `test-results.md` 统一被 `.gitignore` 排除 | `loop-build-path`, `maker-checker`, `goal-verification`, `comprehension-gap` |

---

## 🎯 2. 核心技能分类与场景选型矩阵

### ① 架构设计与领域建模
- **`codebase-design`**：设计深模块 (Deep Modules) 与模块信息隐藏，降低认知负荷；
- **`domain-modeling`**：提炼领域模型、业务词汇表 (Glossary) 与架构决策记录 (ADR)；
- **`improve-codebase-architecture`**：全景审计既有代码结构并生成架构演进建议报告；
- **`setup-ts-deep-modules`**：在 TypeScript 工程中建立严格的分层与深度模块结构。

### ② 编码实现与质量防线
- **`tdd`**：红-绿-重构 (Red-Green-Refactor) 极限编程与测试驱动开发；
- **`code-review`**：依据规范双轴审查变更（业务契约符合性 + 架构规范符合性）；
- **`git-guardrails-claude-code`**：跨平台拦截高危 Git 指令（`push -f`, `reset --hard`, `clean -f` 等）；
- **`diagnosing-bugs`**：复杂高阶 Bug、竞态冲突与性能衰退的假说-诊断循环。

### ③ 压力测试与交互评审（澄清薄壳别名关系）
- **`grilling`**：**【核心主体】** 针对技术方案或系统设计的无情穿透式答辩；
- **`grill-me`**：👉 **薄壳委托**：快捷触发纯对话答辩（轻量别名）；
- **`grill-with-docs`**：👉 **组合委托**：在答辩过程中自动联动 `domain-modeling` 产出 ADR 与架构文档。

### ④ 循环工程 (Loop Engineering) 决策矩阵
- **`loop-worthiness-test`**：四项严苛准则评估“某项任务是否值得写成自动化 Loop”；
- **`loop-three-elements`**：设计最小可用 Loop：触发器 (Trigger) + 动作 (Action) + 停止条件 (Stop)；
- **`loop-5plus1-architecture`**：设计工业级完整循环系统的 5 大组件与 1 根调度脊柱；
- **`loop-build-path`**：从手工操作平滑演进为自动化 Agent 系统的 4 步路径；
- **`maker-checker`**：双 Agent 制衡机制，避免自产自检；
- **`goal-verification`**：将模糊目标转换为可客观断言的停止条件，防止 Agent 陷入死循环；
- **`comprehension-gap`**：排查与防范“系统越自动化，人类开发者理解越少”的认知坍塌风险；
- **`three-stage-evolution`**：评估个人与团队在 AI Agent 落地应用中的演进成熟度阶梯。

---

## 🛡️ 3. 跨平台脚本与安全守护

- 涉及命令行执行的技能脚本（如 `git-guardrails-claude-code/scripts/`）已原生提供 **Node.js 跨平台平替实现**（`block-dangerous-git.mjs`），在 Windows、macOS 与 Linux 上无缝运行，不依赖外部 Bash 或 jq；
- 所有技能由 `scripts/check-skills.mjs` 纳入自动化测试管线，保障格式完备与无漂移。

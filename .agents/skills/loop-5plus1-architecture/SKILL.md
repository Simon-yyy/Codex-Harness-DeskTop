---
name: loop-5plus1-architecture
description: |
  设计或审计完整 Loop 系统的组件架构: 5 大组件 + 1 根脊柱。
  当用户需要搭建一个完整的 (而非最小可用的) loop 系统、或审计现有系统的组件完整性时使用。
  不适用于: 最小可用 loop 的设计、或单次任务的自动化。
  关键 trigger: "设计一个完整的 loop 系统"、"我的 loop 缺什么"、"loop 系统怎么组织"。
---

## Source Metadata

Original cangjie-skill frontmatter from the distillation run:

```yaml
name: loop-5plus1-architecture
description: |
  设计或审计完整 Loop 系统的组件架构: 5 大组件 + 1 根脊柱。
  当用户需要搭建一个完整的 (而非最小可用的) loop 系统、或审计现有系统的组件完整性时使用。
  不适用于: 最小可用 loop 的设计、或单次任务的自动化。
  关键 trigger: "设计一个完整的 loop 系统"、"我的 loop 缺什么"、"loop 系统怎么组织"。
source_book: "Loop Engineering 视频合集"
source_chapter: 视频3 (小木头) / 视频4 (Idoos Money)
tags: [architecture, system-design, components, blueprint]
related_skills: [loop-three-elements, maker-checker, goal-verification]
```

# 5+1 循环系统架构 — 完整 Loop 的设计蓝图

## R — Reading (原文)

> "ados money把它拆成了5块,外加一根脊柱。第一块心跳(定时触发),第二块工作树(work tree,隔离分支),第三块skill(项目规则),第四块连接器(MCP,接入真实工具),第五块子智能体(写代码和审代码分开)。最后就是那根脊柱——支撑起整个loop循环系统的记忆。"
> — 小木头 (视频3)

## I — Interpretation (自述)

任何完整的 Loop 系统都可以拆解为 5 个组件 + 1 根脊柱:

1. **心跳 (Heartbeat)**: 定时触发器 (cron),到点自动启动循环。
2. **工作树 (Work Tree)**: 隔离的工作空间,多个 agent 并行时不踩踏。
3. **Skill**: 项目规则和约束,写入 SKILL.md,每个 agent 自动读取。
4. **连接器 (Connector)**: 通过 MCP 接入外部工具 (issue 系统、数据库等)。
5. **子智能体 (Sub-agent)**: 拆分生产和审查,避免自产自检。
6. **脊柱 (Spine)**: 持久化记忆层,记录历史操作、尝试结果、待办事项。

**脊柱是关键**: Agent 会遗忘 (上下文有限),所以必须在对话之外建立持久化记忆。

## A1 — Past Application (书中案例)

**案例1: Boris 的多 Loop 系统 (视频2)**
- 心跳: 每 30 分钟触发 support loop
- Work Tree: 每个 agent 独立分支
- Skill: 项目规则写入 agents.md
- 连接器: MCP 接入 Intercom、Stripe、Supabase
- 子智能体: 写代码和审代码分开
- 脊柱: 共享 signals 文件夹

**案例2: 选题 Loop (视频3)**
- 心跳: 每天早上 8 点 cron
- Work Tree: 独立分支
- Skill: research + topic-score 技能
- 连接器: research API
- 子智能体: topic-score 作为评级 agent
- 脊柱: inbox.md 文件

## A2 — Future Trigger (未来触发)

1. **搭建完整 loop 系统时**: "我要做一个完整的 X 自动化系统"
2. **审计现有系统时**: "我的 loop 缺什么组件?"
3. **从单 loop 扩展到多 loop 时**: "怎么让多个 loop 协同?"
4. **团队推广 loop 时**: 用这个架构作为"完整 loop 长什么样"的蓝图

**语言信号**: "设计一个完整的 loop 系统"、"我的 loop 缺什么"、"loop 系统怎么组织"、"多 loop 协同"

**与相邻 skill 的区别**:
- `loop-three-elements`: 最小可用单元 (本 skill 是完整系统)
- `maker-checker`: 子智能体分工的具体实现 (本 skill 是整体架构)
- `loop-build-path`: 构建步骤 (本 skill 是静态结构)

## E — Execution (可执行步骤)

### Step 1: 审计现有系统
对照 5+1 清单,逐项检查:
```
□ 心跳: 有定时/事件触发吗?
□ Work Tree: 有隔离工作空间吗?
□ Skill: 规则写成了 SKILL.md 吗?
□ 连接器: 接入了外部工具吗?
□ 子智能体: 生产和审查分开了吗?
□ 脊柱: 有持久化记忆吗?
```

### Step 2: 补齐缺失组件
- 缺心跳 → 加 cron / webhook
- 缺 Work Tree → 加 git worktree / 独立目录
- 缺 Skill → 把指令写成 SKILL.md
- 缺连接器 → 接入 MCP
- 缺子智能体 → 拆分 maker 和 checker
- 缺脊柱 → 加状态文件 / 看板

### Step 3: 验证组件协同
- 触发 → 执行 → 验证 → 记录 → 下次触发 (完整闭环)
- 每个组件是否正常参与流程?

## B — Boundary (边界)

**不要使用这个 skill 的场景**:

1. **最小可用 loop**: 只需要 `loop-three-elements` 即可
2. **单次任务**: 不需要完整架构
3. **已有稳定系统**: 运行良好的 loop 不需要重构

**作者的盲点与局限**:
- 5+1 架构是 Idoos Money 的原创框架,未经广泛验证
- "脊柱"的概念比较模糊 — 可以是文件、数据库、看板,作者没有给出具体选择指南
- 视频案例全部基于 Claude Code 生态,其他工具可能需要不同组件

**与之相邻但容易混淆的方法论**:
- **微服务架构**: "拆分独立服务"; 本 skill 是"拆分 loop 组件"
- **MVC 模式**: "模型-视图-控制器"; 结构类似但面向 loop 系统

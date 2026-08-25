# test-results — loop-worthiness-test

**Skill trigger 条件摘要** (来自 SKILL.md description):
- 用途: 判断一个任务是否值得做成 Loop 的四条决策标准
- 关键 trigger: "这件事值得做 loop 吗"、"该不该自动化"、"loop 成本太高怎么办"
- 不适用于: 已经决定要做 loop 后的设计阶段、一次性任务

| id | type | expected | actual | result | reason |
|---|---|---|---|---|---|
| should-trigger-01 | should_trigger | 调用 | 调用 | ✅ PASS | "我想让 AI 每天自动整理收件箱,值得做 loop 吗?"直接命中 trigger "值得做 loop 吗",属于要不要做 loop 的决策场景 |
| should-trigger-02 | should_trigger | 调用 | 调用 | ✅ PASS | "loop 跑一次花 5 美元 token,是不是不值得?"命中 trigger "loop 成本太高怎么办"和"不值得做"的决策判断 |
| should-trigger-03 | should_trigger | 调用 | 调用 | ✅ PASS | "团队想用 loop 自动化代码审查,该不该做?"命中 trigger "该不该自动化",属于团队级决策场景 |
| should-trigger-04 | should_trigger | 调用 | 调用 | ✅ PASS | "自动化之后产出质量很差,是不是不该做 loop?"命中产出质量差的归因,需要四条件检查验证环节 |
| should-not-trigger-01 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "帮我设计一个 loop 的 trigger 和 stop condition"用户已决定要做 loop,需要的是设计而非决策,应进入 loop-three-elements |
| should-not-trigger-02 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "我的 loop 为什么不停止?"是已运行 loop 的调试问题,不是要不要做的决策,应进入 loop-three-elements 或 goal-verification |
| edge-01 | edge_case | 调用 | 调用 | ✅ PASS | "每月做一次数据报表自动化,值得做 loop 吗?"命中"值得做 loop 吗"的决策判断,虽然频率偏低但应进入四条件分析 |
| edge-02 | edge_case | 调用 | 调用 | ✅ PASS | "只做一次,但想做成 loop 方便以后复用"仍然属于要不要做 loop 的决策场景,skill 会指出条件1不满足 |

通过率: 8/8 (100%)
结论: 接受

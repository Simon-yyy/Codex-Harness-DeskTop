# test-results — goal-verification

**Skill trigger 条件摘要** (来自 SKILL.md description):
- 用途: 设计 Loop 的 Goal 和 Verification,将模糊目标转化为可验证的停止条件
- 关键 trigger: "loop 停不下来"、"产出质量不稳定"、"怎么定义完成"、"goal 怎么写"
- 不适用于: 目标已经非常清晰可量的任务、非循环场景

| id | type | expected | actual | result | reason |
|---|---|---|---|---|---|
| should-trigger-01 | should_trigger | 调用 | 调用 | ✅ PASS | "loop 产出质量不稳定,有时好有时坏"直接命中 trigger "产出质量不稳定",需要检查验证环节 |
| should-trigger-02 | should_trigger | 调用 | 调用 | ✅ PASS | "怎么定义 loop 的完成?我的 loop 停不下来"命中两个 trigger:"怎么定义完成"和"loop 停不下来" |
| should-trigger-03 | should_trigger | 调用 | 调用 | ✅ PASS | "帮我设计一个 loop 的目标,让它知道什么时候算做完"命中 trigger "goal 怎么写"和"怎么定义完成" |
| should-trigger-04 | should_trigger | 调用 | 调用 | 调用 | ✅ PASS | "agent 自评说做得很好,但实际产出很差"命中自产自检失败场景,属于验证环节设计问题 |
| should-not-trigger-01 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "帮我写一个 cron 脚本来定时备份"是简单自动化,不涉及验证设计,符合 Boundary 中的"非循环场景" |
| should-not-trigger-02 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "loop 的 trigger 应该怎么设计?"是 trigger 设计问题,不是 goal/verification 设计,应进入 loop-three-elements |
| edge-01 | edge_case | 调用 | 调用 | ✅ PASS | "我想让 AI 写一首诗,怎么判断写得好不好?"涉及验证设计问题,虽然诗歌主观但应进入讨论并建议人类在环 |
| edge-02 | edge_case | 调用 | 调用 | ✅ PASS | "我的 loop 目标是'让代码更干净',这算可验证吗?"命中模糊目标转化场景,需要引导改为具体指标 |

通过率: 8/8 (100%)
结论: 接受

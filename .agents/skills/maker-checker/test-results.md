# test-results — maker-checker

## Skill Description (Trigger 条件)

设计 Loop 中的 Maker-Checker 模式: 用独立 agent 审查产出,避免自产自检。
当用户发现 loop 产出质量不稳定、agent 自我评估过于宽容、或需要提升产出可信度时使用。
不适用于: 产出可以客观验证 (测试通过/失败) 的任务、或成本极其敏感的场景。
关键 trigger: "agent 自评不准确"、"产出质量不稳定"、"怎么让 agent 审查 agent"。

## Test Results

| id | type | expected | actual | result | reason |
|---|---|---|---|---|---|
| should-trigger-01 | should_trigger | 调用 | 调用 | ✅ PASS | "agent 自评做得很好但实际很差" 直接命中自评失效 trigger |
| should-trigger-02 | should_trigger | 调用 | 调用 | ✅ PASS | "怎么让 agent 审查 agent 的产出" 完美匹配独立审查 trigger |
| should-trigger-03 | should_trigger | 调用 | 调用 | ✅ PASS | "产出质量不稳定,需要审查环节" 匹配质量不稳定 trigger |
| should-trigger-04 | should_trigger | 调用 | 调用 | ✅ PASS | "AI 做 code review 怎么设计" 匹配团队 code review 自动化 trigger |
| should-not-trigger-01 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "写测试验证代码" — 产出可客观验证，属于明确排除场景 |
| should-not-trigger-02 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "goal 怎么定义" 是 goal 设计问题，应进入 goal-verification |
| edge-01 | edge_case | 调用 | 调用 | ✅ PASS | "简单任务需要 checker 吗" — 涉及 maker-checker 适用性判断，会激活 |
| edge-02 | edge_case | 调用 | 调用 | ✅ PASS | "同一个 agent 先做再审省 token" — 成本 vs 质量权衡的核心议题，会激活 |

## 统计

通过率: 8/8 (100%)
结论: ✅ 接受

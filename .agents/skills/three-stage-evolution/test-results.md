# test-results — three-stage-evolution

## Skill Description (Trigger 条件)

评估个人或团队在 AI 工具使用上的进化阶段,给出下一步提升建议。
当用户想判断"我现在 AI 用得怎么样"、"下一步该学什么"、或团队要做 AI 能力评估时使用。
不适用于: 已经处于 Loop 阶段需要优化具体系统的场景。
关键 trigger: "我现在在哪个阶段"、"AI 使用下一步"、"团队 AI 能力评估"。

## Test Results

| id | type | expected | actual | result | reason |
|---|---|---|---|---|---|
| should-trigger-01 | should_trigger | 调用 | 调用 | ✅ PASS | "我现在 AI 用得怎么样" 直接命中自评 trigger |
| should-trigger-02 | should_trigger | 调用 | 调用 | ✅ PASS | "团队评估 AI 使用能力" 匹配团队能力建设 trigger |
| should-trigger-03 | should_trigger | 调用 | 调用 | ✅ PASS | "从手动多用 AI 对话升级到 loop" 匹配升级路径 trigger |
| should-trigger-04 | should_trigger | 调用 | 调用 | ✅ PASS | "向新人解释为什么学 loop engineering" 匹配教学推广 trigger |
| should-not-trigger-01 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "设计 loop 的 trigger" 是具体设计问题，非阶段评估 |
| should-not-trigger-02 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "任务值不值得做 loop" 是决策问题，应进入 loop-worthiness-test |
| edge-01 | edge_case | 调用 | 调用 | ✅ PASS | "同时用 5 个 AI 对话但手动发起算 Stage 2 吗" — 确认阶段特征，会激活 |
| edge-02 | edge_case | 调用 | 调用 | ✅ PASS | "有 cron job 但没验证环节算 Stage 3 吗" — 阶段边界判断，会激活 |

## 统计

通过率: 8/8 (100%)
结论: ✅ 接受

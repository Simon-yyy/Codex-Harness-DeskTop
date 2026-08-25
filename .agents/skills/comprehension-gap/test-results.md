# test-results — comprehension-gap

## Skill Description (Trigger 条件)

识别和管理 Loop 系统的认知风险: 自动化程度越高,你真正理解的部分越少。
当用户发现"仓库里有很多代码但我看不懂"、"loop 产出很多但不确定对不对"、或需要向团队警示 AI 使用风险时使用。
不适用于: 纯技术调试、或产出完全可客观验证的场景。
关键 trigger: "AI 生成的代码我看不懂"、"产出太多理解不过来"、"AI 使用风险"。

## Test Results

| id | type | expected | actual | result | reason |
|---|---|---|---|---|---|
| should-trigger-01 | should_trigger | 调用 | 调用 | ✅ PASS | "AI 生成的代码我看不懂" 直接命中理解鸿沟 trigger |
| should-trigger-02 | should_trigger | 调用 | 调用 | ✅ PASS | "产出很多但不确定对不对" 匹配产出不确定性 trigger |
| should-trigger-03 | should_trigger | 调用 | 调用 | ✅ PASS | "团队 AI 使用风险警示" 匹配风险警示 trigger |
| should-trigger-04 | should_trigger | 调用 | 调用 | ✅ PASS | "无人盯着的 loop 有什么风险" 直接命中监督缺失 trigger |
| should-not-trigger-01 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "帮我写 loop 自动生成代码" 是构建需求，非风险管理 |
| should-not-trigger-02 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "stop condition 怎么设计" 是具体设计问题，非认知风险 |
| edge-01 | edge_case | 调用 | 调用 | ✅ PASS | "产出 100% 通过测试还担心认知差距吗" — 测试通过≠理解，会激活讨论 |
| edge-02 | edge_case | 调用 | 调用 | ✅ PASS | "AI 写文档有认知风险吗" — 低风险任务认知评估，会激活 |

## 统计

通过率: 8/8 (100%)
结论: ✅ 接受

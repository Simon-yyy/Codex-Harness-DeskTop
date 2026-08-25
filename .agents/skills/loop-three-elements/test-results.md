# test-results — loop-three-elements

**Skill trigger 条件摘要** (来自 SKILL.md description):
- 用途: 设计/审计循环系统,将循环拆解为 Trigger-Action-Stop 三要素
- 关键 trigger: "设计一个 loop"、"这个循环为什么不停止"、"什么是 loop 的最小结构"
- 不适用于: 单次任务执行、非循环的自动化脚本、已稳定运行无需重新设计的系统

| id | type | expected | actual | result | reason |
|---|---|---|---|---|---|
| should-trigger-01 | should_trigger | 调用 | 调用 | ✅ PASS | "设计一个每天自动检查服务器状态的 loop"直接命中 trigger "设计一个 loop",需要三要素拆解 |
| should-trigger-02 | should_trigger | 调用 | 调用 | ✅ PASS | "loop 跑了三天还没停"命中 stop condition 诊断场景,属于核心触发 |
| should-trigger-03 | should_trigger | 调用 | 调用 | ✅ PASS | "什么是 loop 的最小结构?想教团队"直接命中 trigger "什么是 loop 的最小结构" |
| should-trigger-04 | should_trigger | 调用 | 调用 | ✅ PASS | "帮我看看这个自动化脚本缺什么,有时候不执行"命中诊断循环结构缺失的 trigger |
| should-not-trigger-01 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "帮我写一个 Python 脚本备份数据库"是单次脚本编写,非循环结构分析,符合 Boundary 中的"单次任务"排除条件 |
| should-not-trigger-02 | should_not_trigger | 不调用 | 不调用 | ✅ PASS | "这个 cron job 报错了,帮我看看哪里不对"是调试场景,不是设计或分析循环结构 |
| edge-01 | edge_case | 调用 | 调用 | ✅ PASS | "我想让 AI 每天帮我写一篇日记,这算 loop 吗?"有循环结构成分(每天),可进入三要素分析并指出只是简单自动化 |
| edge-02 | edge_case | 不调用(深入编程) | 不调用(深入编程) | ✅ PASS | "while 循环怎么写才能正确退出"是编程语法问题,本 skill 不应深入编程语法,只会类比后引导到具体编程问题 |

通过率: 8/8 (100%)
结论: 接受

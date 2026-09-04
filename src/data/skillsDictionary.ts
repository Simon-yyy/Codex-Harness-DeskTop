export type SkillCategory = 'all' | 'engineering' | 'architecture' | 'loop' | 'collaboration';

export interface SkillMetaInfo {
  chineseName: string;
  summary: string;
  category: 'engineering' | 'architecture' | 'loop' | 'collaboration';
  keywords: string[];
  examplePrompt: string;
  whenToUse: string;
}

export const SKILL_CATEGORIES: { key: SkillCategory; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: '✨' },
  { key: 'engineering', label: '代码工程', icon: '🛠️' },
  { key: 'architecture', label: '架构设计', icon: '🏗️' },
  { key: 'loop', label: 'Loop智能体', icon: '🔄' },
  { key: 'collaboration', label: '规范协作', icon: '📖' },
];

export const SKILLS_DICTIONARY: Record<string, SkillMetaInfo> = {
  'domain-modeling': {
    chineseName: '领域建模与通用语言',
    summary: '构建和完善项目的领域模型。用于敲定领域术语（统一语言），或记录重大的架构决策。',
    category: 'architecture',
    keywords: ['领域', '模型', '业务', '术语', 'adr', 'context'],
    examplePrompt: '/domain-modeling 针对我们要做的电商售后系统，梳理出包含“退款单”、“申诉”等概念的核心实体模型。',
    whenToUse: '在动手写代码前，需要梳理业务概念、统一领域命名语言，或撰写 ADR 架构决策时。'
  },
  'diagnosing-bugs': {
    chineseName: '疑难 Bug 根因排查',
    summary: '自顶向下针对难以复现的复杂缺陷、性能骤降与报错进行逻辑推演与定位。',
    category: 'engineering',
    keywords: ['排查', 'debug', 'bug', '报错', '崩溃', '性能'],
    examplePrompt: '/diagnosing-bugs 生产环境偶发 ECONNRESET 假死断连，帮我顺着 Socket 链路与复用逻辑自顶向下排查根因。',
    whenToUse: '遇到复杂报错、偶发异常、性能骤降或死锁问题，需要系统性深入诊断根因时。'
  },
  'git-guardrails-claude-code': {
    chineseName: 'Git 危险操作安全护栏',
    summary: '配置 pre-command 拦截机制，阻断误触 git push、reset --hard 等破坏性操作。',
    category: 'engineering',
    keywords: ['git', '安全', '拦截', '防手抖', 'push', 'guardrails'],
    examplePrompt: '/git-guardrails-claude-code 帮我配置 Git pre-command 拦截机制，防止误操作执行 git push --force 或 reset --hard。',
    whenToUse: '希望在本地对高危 Git 命令建立安全守卫、防止手抖误操作抹除历史代码时。'
  },
  'code-review': {
    chineseName: '双轴代码审查 (规范与需求)',
    summary: '沿“编码规范”与“需求规格”双维度由双子智能体并行交叉评审变更。',
    category: 'engineering',
    keywords: ['审查', 'review', '评审', '代码质量', 'diff'],
    examplePrompt: '/code-review 针对当前分支相比 main 的代码改动，从编码规范和需求规格两个维度开展交叉审查。',
    whenToUse: '准备提交 PR、合并分支，或对最近几次 commit 进行合规性与边界检查时。'
  },
  'tdd': {
    chineseName: '测试驱动开发 (红-绿-重构)',
    summary: '遵循 TDD 先写失败测试、最小实现、再安全重构的标准严谨工业流程。',
    category: 'engineering',
    keywords: ['单测', '测试', 'tdd', '单元测试', '重构'],
    examplePrompt: '/tdd 帮我用单测驱动的方式实现一个支持过期淘汰策略的 LRU Cache 缓存类。',
    whenToUse: '实现核心算法、复杂状态机或关键业务规则，要求极高单测覆盖率与重构安全性时。'
  },
  'maker-checker': {
    chineseName: '双 Agent 审查员博弈校对',
    summary: '引入独立的 Checker 智能体审查 Maker 的产出，消除单模型自产自检带来的盲目自信。',
    category: 'loop',
    keywords: ['审查员', '校对', 'checker', '双智能体', '博弈'],
    examplePrompt: '/maker-checker 帮我设计一个代码生成后的双 Agent 审查机制，让独立 Checker 对生成的 SQL 脚本做注入漏洞审查。',
    whenToUse: '单 Agent 生成内容容易盲目自信或自欺欺人，需要独立质检员把关产出质量时。'
  },
  'comprehension-gap': {
    chineseName: 'AI 代码认知鸿沟管理',
    summary: '监控和管理系统自动化程度越高、人类理解度越低的认知负债与脱节风险。',
    category: 'loop',
    keywords: ['认知', '看不懂', '黑盒', '风险', 'gap'],
    examplePrompt: '/comprehension-gap 扫描当前项目中 AI 生成的代码模块，分析哪些逻辑存在过度复杂、开发者难以维护的认知风险。',
    whenToUse: '仓库中充斥大量 AI 生成的代码，团队看不懂、改不动或产生认知脱节时。'
  },
  'goal-verification': {
    chineseName: '目标拆解与可验证停止条件',
    summary: '将模糊任务目标转化为机器客观可量化、可单测检验的清晰停止条件。',
    category: 'loop',
    keywords: ['目标', '停止条件', '验收', '完成标准', 'goal'],
    examplePrompt: '/goal-verification 帮我把“重构用户认证模块使其更健壮”这个模糊需求，转化为机器可客观验证的清晰停止条件。',
    whenToUse: '自动化任务停不下来、或者任务范围模糊不知道做到什么程度才算完成时。'
  },
  'grilling': {
    chineseName: '技术方案压力测试 (Grill)',
    summary: '扮演极端严格的技术评审官，对你的技术方案、设计决策展开无死角压力测试。',
    category: 'collaboration',
    keywords: ['质询', '压力测试', '挑刺', '推演', 'grill'],
    examplePrompt: '/grilling 假设你是一个极端严苛的技术专家，对我拟定的微服务拆分方案进行无死角方案施压与漏洞审查。',
    whenToUse: '制定了重要架构方案或技术选型，想要在团队评审前主动暴露潜在缺陷与盲区时。'
  },
  'grill-me': {
    chineseName: '交互式方案面谈施压',
    summary: '通过多轮连环追问帮你暴露方案漏洞，梳理遗漏边界与设计盲区。',
    category: 'collaboration',
    keywords: ['追问', '面谈', '对齐', '漏洞'],
    examplePrompt: '/grill-me 请针对我要实现的分布式事务补偿方案向我连环提问，帮我发现设计漏洞。',
    whenToUse: '需要一个对手对你的思路进行多轮交互式追问、倒逼方案完善与逻辑自洽时。'
  },
  'grill-with-docs': {
    chineseName: '基于权威文档的交叉质询',
    summary: '引入一手权威技术文档为依据，对实现思路进行证据链式的严格对标审查。',
    category: 'collaboration',
    keywords: ['文档', '依据', '质询', '证据'],
    examplePrompt: '/grill-with-docs 依据 React 19 官方一手文档，质询我当前使用 useActionState 的设计是否合规。',
    whenToUse: '需要严格依据一手官方规范进行证据链级别的审查，防止被过时网文或幻觉误导时。'
  },
  'loop-three-elements': {
    chineseName: '循环系统三要素审计',
    summary: '将任务循环拆解为 Trigger (触发)、Action (动作)、Stop Condition (终止) 三大基石。',
    category: 'loop',
    keywords: ['三要素', '循环', 'loop', '触发器', '状态机'],
    examplePrompt: '/loop-three-elements 帮我审计当前自动化重构循环的 Trigger (触发条件)、Action (动作) 与 Stop Condition (停止条件)。',
    whenToUse: '需要设计一个自动化循环系统，或现存循环频繁失控、死循环时。'
  },
  'loop-5plus1-architecture': {
    chineseName: 'Loop 5+1 骨干体系设计',
    summary: '搭建与审计工业级智能体循环的 5 大组件与 1 根脊柱骨架。',
    category: 'loop',
    keywords: ['5+1', '骨干', '架构', '完整系统'],
    examplePrompt: '/loop-5plus1-architecture 帮我搭建一个完整的自动化测试修复 Loop，涵盖 5 大组件和上下文脊柱。',
    whenToUse: '需要构建或审计企业级全流程智能体自动化系统架构时。'
  },
  'loop-build-path': {
    chineseName: '从手动到自动四步渐进路径',
    summary: '指导团队从手工作业逐步平滑演进到全自动可信 Loop 系统。',
    category: 'loop',
    keywords: ['渐进', '演进', '自动化', '步进'],
    examplePrompt: '/loop-build-path 我们团队目前靠人工跑回归测试，指导我们如何分四步平滑演进到全自动可信 Loop。',
    whenToUse: '准备将手动繁琐工作转化为自动化闭环，但不知道从何处着手时。'
  },
  'loop-worthiness-test': {
    chineseName: '自动化 Loop 投资回报评估',
    summary: '通过 4 条金标准评估任务是否真正值得做成自动化循环，杜绝为了自动化而自动化。',
    category: 'loop',
    keywords: ['评估', '是否值得', '成本', '投资回报'],
    examplePrompt: '/loop-worthiness-test 我们打算把周报汇总做成自动化 Loop，请用四条标准帮我评估一下是否得不偿失。',
    whenToUse: '纠结某个任务是否值得花时间写成自动化 Agent，防止过度工程化时。'
  },
  'loop-me': {
    chineseName: '任务自动循环执行机',
    summary: '将单次指令转化为带自我验证与退出条件的自动化执行闭环。',
    category: 'loop',
    keywords: ['闭环', '自动化', '自动循环'],
    examplePrompt: '/loop-me 将当前的代码修复任务转化为自动化闭环，持续尝试运行测试直到全部通过为止。',
    whenToUse: '需要 Agent 自主进行“尝试修改 -> 运行验证 -> 失败再改”的连续闭环任务时。'
  },
  'codebase-design': {
    chineseName: '代码库深模块设计',
    summary: '用于设计深度模块、改善模块接口、寻找重构机会或决定代码接缝的位置。',
    category: 'architecture',
    keywords: ['深模块', '接口', '高内聚', '模块化'],
    examplePrompt: '/codebase-design 帮我设计“订单解析”模块的接口定义和类结构，要求解耦外部依赖。',
    whenToUse: '设计模块边界、改善模块公开接口，或寻找架构接缝 (Seam) 位置时。'
  },
  'improve-codebase-architecture': {
    chineseName: '全局架构体检与重构',
    summary: '扫描代码库寻找优化机会，呈现为可视化的架构评估，并针对选定缺陷进行重构。',
    category: 'architecture',
    keywords: ['重构', '坏味道', '架构升级', '解耦'],
    examplePrompt: '/improve-codebase-architecture @workspace 看看当前项目的代码架构有没有提升的空间，请重点排查循环依赖。',
    whenToUse: '对现有工程进行全局架构体检、寻找坏味道或准备重构解耦时。'
  },
  'prototype': {
    chineseName: '轻量原型方案验证',
    summary: '用最小代价快速构建一次性丢弃型原型，验证技术方案可行性。',
    category: 'architecture',
    keywords: ['原型', 'poc', '快速验证', 'demo'],
    examplePrompt: '/prototype 用最轻量的代码快速验证一下 Electron 主进程与渲染层跨窗口同步状态的原型可行性。',
    whenToUse: '不确定技术方案是否可行，需要用最小代价构建丢弃型 Demo 验证思路时。'
  },
  'research': {
    chineseName: '权威一手资料深度调研',
    summary: '深入官方规范与一手源码进行客观技术调研并沉淀 Markdown 调研报告。',
    category: 'architecture',
    keywords: ['调研', '技术选型', '一手资料', '研究'],
    examplePrompt: '/research 调研一下当前市面上 Electron 33 在 Windows 上的最新安全沙箱标准与最佳实践，并整理调研报告。',
    whenToUse: '需要深入官方规范或一手源码查证技术细节，产出系统化调研纪要时。'
  },
  'resolving-merge-conflicts': {
    chineseName: 'Git 合并冲突解决',
    summary: '理清冲突双方变更意图，以最小影响原则规范解决 Git 合并与变基冲突。',
    category: 'engineering',
    keywords: ['冲突', 'rebase', 'merge', 'git'],
    examplePrompt: '/resolving-merge-conflicts 帮我分析当前 feature 分支变基到 main 分支时产生的 Git 冲突，并在最小改动原则下解决。',
    whenToUse: '遇到复杂的 Git merge/rebase 冲突，需要理清双方意图安全合并时。'
  },
  'setup-pre-commit': {
    chineseName: 'Husky 提交门禁与格式化',
    summary: '一键建立 Prettier、ESLint、类型检查与单测的提交前强制守卫。',
    category: 'engineering',
    keywords: ['husky', 'pre-commit', '门禁', '格式化'],
    examplePrompt: '/setup-pre-commit 帮我在当前工程中配置 Husky + lint-staged，在 commit 前自动校验 ESLint 和单测。',
    whenToUse: '为团队仓库配置提交前代码规范、类型检查与单测门禁时。'
  },
  'setup-ts-deep-modules': {
    chineseName: 'TypeScript 深模块边界搭建',
    summary: '为 TS 项目建立具备清晰接口与隐藏内部细节的高信度深模块结构。',
    category: 'architecture',
    keywords: ['ts', 'typescript', '模块边界'],
    examplePrompt: '/setup-ts-deep-modules 帮我为 src/services 目录配置 TypeScript 深模块结构，严格限制对外导出的公开 API。',
    whenToUse: '希望为 TypeScript 模块建立高内聚深接口、隐藏内部繁杂实现时。'
  },
  'migrate-to-shoehorn': {
    chineseName: '单测类型断言安全迁移',
    summary: '安全摆脱测试代码中脆弱的 as any 强制类型断言，迁移至结构化测试桩。',
    category: 'engineering',
    keywords: ['shoehorn', '断言', '单测重构'],
    examplePrompt: '/migrate-to-shoehorn 帮我把 tests 目录中所有的 "as any" 和强制断言安全迁移为 Shoehorn 模式。',
    whenToUse: '单测代码中充斥大量不安全的类型断言，需要重构成健壮测试桩时。'
  },
  'implement': {
    chineseName: '工程实现与代码落地',
    summary: '将规格说明严格落地为可运行、自测试的高质量工程代码。',
    category: 'engineering',
    keywords: ['实现', '编码', '落地', '开发'],
    examplePrompt: '/implement 按照前面讨论好的技术方案，完整实现文件加密解密服务及其单元测试。',
    whenToUse: '技术方案与接口设计已确定，进入纯粹的高质量工程编码阶段时。'
  },
  'triage': {
    chineseName: '缺陷定级与优先级分类',
    summary: '规范化分拣、分类并评定故障缺陷严重度，指派应对策略。',
    category: 'engineering',
    keywords: ['分诊', '严重度', '优先级', 'bug'],
    examplePrompt: '/triage 帮我对这批用户反馈的崩溃日志进行分级分类，评估出 P0/P1 缺陷并给出应对建议。',
    whenToUse: '面对大量 Issue 或突发生产故障，需要快速定级并理清处理优先级时。'
  },
  'three-stage-evolution': {
    chineseName: '团队 AI 协作成熟度评估',
    summary: '评估团队当前处于提示词/流程/Loop 哪个阶段，给出具体跃迁建议。',
    category: 'loop',
    keywords: ['演进', '成熟度', '团队', '阶段'],
    examplePrompt: '/three-stage-evolution 评估一下我们团队目前的 AI 编程实践处于哪一阶段，并给出下一步跃迁策略。',
    whenToUse: '团队想要评估 AI 工具落地深度，寻求从 Prompt 到 Loop 的进阶方向时。'
  },
  'to-spec': {
    chineseName: '自然语言转化为技术规格',
    summary: '将模糊业务想法蒸馏为输入输出边界明确、无二义性的工程 Spec。',
    category: 'architecture',
    keywords: ['spec', '需求规格', '设计文档', '需求分析'],
    examplePrompt: '/to-spec 针对“希望支持批量导出 PDF”的模糊需求，整理出输入输出边界明确的技术规格说明书 (Spec)。',
    whenToUse: '业务需求含糊不清，需要把口头需求转化为开发直接可执行的技术规格时。'
  },
  'to-tickets': {
    chineseName: '方案拆解为可执行工单',
    summary: '将大型工程方案原子化拆解为边界独立、可并行推进的 Ticket 任务。',
    category: 'collaboration',
    keywords: ['工单', 'ticket', '任务拆解', 'jira'],
    examplePrompt: '/to-tickets 帮我把这份重构方案拆解为 5 个原子化、可独立交付的开发工单 (Tickets)。',
    whenToUse: '将大型工程方案拆解为可分配给不同人或并行推进的敏捷工单时。'
  },
  'to-questionnaire': {
    chineseName: '需求澄清交互式问卷',
    summary: '针对含糊不清的项目意图自动生成交互式多选问卷，快速收敛设计意图。',
    category: 'architecture',
    keywords: ['问卷', '需求澄清', '多选', '收敛'],
    examplePrompt: '/to-questionnaire 针对用户想要开发会员积分商城的模糊需求，生成一份包含多选选项的澄清问卷。',
    whenToUse: '用户需求发散、边界不清晰，需要用交互式问卷快速收敛设计意图时。'
  },
  'wayfinder': {
    chineseName: '工程拓扑导航与快速寻路',
    summary: '在新接手的大型仓库中以 3-Hop 寻路法则快速理清关键调用链路。',
    category: 'architecture',
    keywords: ['寻路', '导航', '架构地图', '调用链路'],
    examplePrompt: '/wayfinder 帮我快速理清当前项目中用户登录态从前台点击到后台鉴权的核心调用链路。',
    whenToUse: '新接手陌生大型项目，需要在代码海洋中快速摸清核心业务流向时。'
  },
  'writing-for-agents': {
    chineseName: '编写 AI 智能体易读规范',
    summary: '掌握编写 AGENTS.md、SKILL.md 与提示词的工业级语法与排版技法。',
    category: 'collaboration',
    keywords: ['文档编写', 'agents.md', 'skill.md', '规范'],
    examplePrompt: '/writing-for-agents 帮我优化当前项目的 AGENTS.md 规范文件，使其更契合智能体的上下文理解与导航习惯。',
    whenToUse: '为 AI 智能体撰写或优化规约文档、提示词指令或技能库时。'
  },
  'wizard': {
    chineseName: '交互式向导脚本生成器',
    summary: '生成一步步引导人类完成复杂运维、云资源配置或密钥领取的向导程序。',
    category: 'collaboration',
    keywords: ['向导', 'wizard', '步骤引导', '运维'],
    examplePrompt: '/wizard 帮我生成一个交互式引导脚本，一步步指导运维人员完成生产证书的轮换与测试。',
    whenToUse: '需要人类手动操作敏感步骤（如输入密钥、控制台审批），生成交互式向导时。'
  },
  'teach': {
    chineseName: '技术概念交互式推演教学',
    summary: '用循序渐进的推演、苏格拉底式提问帮你彻底吃透复杂技术机制。',
    category: 'collaboration',
    keywords: ['教学', '讲解', '原理', '苏格拉底'],
    examplePrompt: '/teach 请给我讲解一下 React 中 useEffect 钩子的底层工作原理，并带上代码演示。',
    whenToUse: '想要彻底搞懂某项底层技术、设计模式或核心机制，希望由浅入深讲解时。'
  },
  'wait-what': {
    chineseName: '反直觉逻辑推敲与二次确认',
    summary: '在遇到看似不合常理的代码或反模式时，深挖历史脉络避免盲目重构。',
    category: 'collaboration',
    keywords: ['反直觉', '隐性坑', '推敲', '小心'],
    examplePrompt: '/wait-what 这段代码里居然有这样一段特殊的锁逻辑，帮我推敲它背后可能有何隐情，避免贸然重构踩坑。',
    whenToUse: '在祖传代码中看到反常理写法，怀疑有隐性 Bug 历史或特殊考量时。'
  },
  'claude-handoff': {
    chineseName: 'Claude Code 上下文交接',
    summary: '将当前会话进展与决策状态打包为紧凑上下文，方便移交给后续 Agent。',
    category: 'collaboration',
    keywords: ['交接', 'handoff', '状态保存'],
    examplePrompt: '/claude-handoff 将当前排查网络中断的中间状态和关键决策打包，以便无缝交接给下一个会话。',
    whenToUse: '准备切换上下文或模型，需要将当前会话的重要现场安全封存交接时。'
  },
  'handoff': {
    chineseName: '任务上下文无缝归档交接',
    summary: '标准结构化沉淀阶段性思考与代码进展，防止上下文断层。',
    category: 'collaboration',
    keywords: ['交接', '阶段总结', '归档'],
    examplePrompt: '/handoff 帮我总结今天对架构重构的所有改动与待办事项，生成规范的交接记录。',
    whenToUse: '下班前或阶段性里程碑达成时，结构化沉淀进展以防遗忘。'
  },
  'ask-matt': {
    chineseName: '专家顾问架构决策咨询',
    summary: '汇集顶尖全栈架构师的设计原则与工程哲学，为你解答疑难决策。',
    category: 'collaboration',
    keywords: ['顾问', '经验', '咨询', '决策'],
    examplePrompt: '/ask-matt 针对 TypeScript 中泛型推导性能与可读性的平衡，咨询一下专家工程经验。',
    whenToUse: '在全栈或 TypeScript 架构决策上遇到取舍难题，需要资深专家视角的建议时。'
  },
  'scaffold-exercises': {
    chineseName: '代码练习与靶场脚手架',
    summary: '为算法、框架或 TypeScript 类型操练快速搭建带单测校验的练习靶场。',
    category: 'collaboration',
    keywords: ['靶场', '练习', '脚手架', '测试桩'],
    examplePrompt: '/scaffold-exercises 帮我搭建一个 TypeScript 泛型体操练习靶场，包含题目说明、类型桩和自动化校验单测。',
    whenToUse: '为团队或个人搭建技能实战演练题库与自动化单测靶场时。'
  },
  'setup-matt-pocock-skills': {
    chineseName: '技能库全量热部署与同步',
    summary: '自动检查并无缝增量部署所有内置工程技能到用户本地 Codex 运行时。',
    category: 'collaboration',
    keywords: ['技能部署', '热同步', '初始化'],
    examplePrompt: '/setup-matt-pocock-skills 检查并同步内置技能库至用户本机运行时环境。',
    whenToUse: '需要更新或重新部署内置的 43 项全流程工程技能时。'
  },
  'writing-beats': {
    chineseName: '技术写作节奏与论点编排',
    summary: '设计技术博客、长文或 RFC 的论证节奏 (Beats)，增强技术表达力。',
    category: 'collaboration',
    keywords: ['写作', '博客', '论点', '文章节奏'],
    examplePrompt: '/writing-beats 帮我设计一篇关于《从零构建高可用 Electron 客户端》技术长文的论证节奏与各小节节拍。',
    whenToUse: '撰写深度技术文章、技术专栏或 RFC 时，需要编排跌宕起伏的论点节奏。'
  },
  'writing-shape': {
    chineseName: '技术文章宏观骨架搭建',
    summary: '构建技术长文的宏观思维模型与多维认知骨架，避免下笔散乱。',
    category: 'collaboration',
    keywords: ['大纲', '架构', '写作骨架', '技术文'],
    examplePrompt: '/writing-shape 帮我构建关于微前端架构方案的技术文章宏观骨架，理清章节之间的递进关系。',
    whenToUse: '开始写长篇技术文档前，先建立系统化的大纲和宏观认知框架。'
  },
  'writing-fragments': {
    chineseName: '技术碎片灵感记录与提炼',
    summary: '捕捉并提炼日常开发中的微小灵感碎片，整理为可复用的知识卡片。',
    category: 'collaboration',
    keywords: ['灵感', '碎片', '笔记', '知识沉淀'],
    examplePrompt: '/writing-fragments 我刚刚调优了 Node.js 内存泄漏，帮我将这段临时调试笔记整理成可复用的技术知识卡片。',
    whenToUse: '收集平时零碎的技术要点、避坑心得，整理为高质量知识卡片时。'
  }
};

/**
 * 辅助函数：获取技能的完整展示信息 (含中文名、说明、分类、实战示例与建议时机)
 */
export function getSkillDisplayInfo(skillId: string, rawName?: string, rawDesc?: string) {
  const dict = SKILLS_DICTIONARY[skillId] || (rawName ? SKILLS_DICTIONARY[rawName] : undefined);
  if (dict) {
    return {
      displayName: dict.chineseName,
      chineseSummary: dict.summary,
      category: dict.category,
      command: `/${skillId}`,
      examplePrompt: dict.examplePrompt,
      whenToUse: dict.whenToUse
    };
  }
  // 降级兜底
  return {
    displayName: rawName || skillId,
    chineseSummary: rawDesc || '执行该特定工程技能的标准指导流水线。',
    category: 'collaboration' as const,
    command: `/${skillId}`,
    examplePrompt: `/${skillId} 请结合当前工程上下文，帮我执行该项任务。`,
    whenToUse: '需要调用该特定技能的工作流规范时使用。'
  };
}

// Codex Desktop Client - Full Production Core Application
const PROVIDER_PRESETS = {
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", protocol: "openai", models: "gpt-4o, gpt-4o-mini, o1, o3-mini" },
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", protocol: "openai", models: "deepseek-chat, deepseek-coder, deepseek-reasoner" },
  anthropic: { name: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1", protocol: "anthropic", models: "claude-3-7-sonnet, claude-opus-4-8, claude-opus-5" },
  ollama: { name: "Ollama (Local)", baseUrl: "http://127.0.0.1:11434", protocol: "ollama", models: "llama3.3, qwen2.5-coder, deepseek-r1:7b" },
  agentrouter: { name: "AgentRouter", baseUrl: "https://ps.air-outer.com/v1", protocol: "openai", models: "gpt-5.6-sol, claude-opus-4-8, claude-opus-5" },
  custom: { name: "自定义提供方", baseUrl: "https://ps.air-outer.com/v1", protocol: "openai", models: "gpt-5.6-sol, claude-opus-4-8" }
};

const DEFAULT_SESSIONS = [
  {
    id: "session_welcome",
    title: "欢迎使用 Codex Desktop",
    updatedAt: Date.now(),
    messages: [
      {
        role: "assistant",
        model: "gpt-5.6-sol",
        thinking: "系统就绪，模型提供方引擎已加载。",
        toolCall: null,
        content: "你好！我是 OpenAI Codex Harness Desktop Agent，搭载 35 个工业级编程与工程技能。请在下方输入需求或点击左下角【⚙️ 设置】配置您的模型提供方密钥即可开始对话！",
        timestamp: Date.now()
      }
    ]
  },
  {
    id: "session_code_refactor",
    title: "代码深度重构与架构设计",
    updatedAt: Date.now() - 3600000,
    messages: [
      {
        role: "user",
        content: "请帮我重构核心数据处理模块，遵循最小影响原则与防内存泄露规约。",
        timestamp: Date.now() - 3600000
      },
      {
        role: "assistant",
        model: "gpt-5.6-sol",
        thinking: "已完成架构设计与边界评估。",
        toolCall: null,
        content: "已按现代高内聚低耦合标准规划重构步骤，随时可以启动代码实施。",
        timestamp: Date.now() - 3500000
      }
    ]
  },
  {
    id: "session_tdd_demo",
    title: "自动化测试与质量保障",
    updatedAt: Date.now() - 7200000,
    messages: [
      {
        role: "user",
        content: "编写 13 大 Seam 全量自动化测试用例，覆盖安全、UI与网络调用边界。",
        timestamp: Date.now() - 7200000
      },
      {
        role: "assistant",
        model: "gpt-5.6-sol",
        thinking: "全量测试用例套件已就绪。",
        toolCall: null,
        content: "已构建 50 项全面 TDD 测试，覆盖率达到 100% 全绿通过标准。",
        timestamp: Date.now() - 7100000
      }
    ]
  }
];

const FILE_CONTENTS = {
  "README.md": "# Codex Desktop Client\n工业级 AI 编程工作台",
  "package.json": '{\n  "name": "codex-desktop",\n  "version": "1.0.0"\n}',
  "ui/app.js": "// Core JavaScript Engine"
};

function parseModelList(modelsStr) {
  if (!modelsStr || typeof modelsStr !== "string") return [];
  return modelsStr.split(/[,，、;；\r\n]+/).map(m => m.trim()).filter(Boolean);
}

function parseLlmApiResult(res, endpoint = "", modelName = "", durationSec = "0.5") {
  if (!res) {
    return { ok: false, error: "未收到响应数据", content: "未收到响应数据", thinking: "通信异常", toolCall: null, text: "" };
  }

  let status = 200;
  let statusText = "OK";
  let rawBody = "";
  let isOk = true;

  if (typeof res === "string") {
    rawBody = res;
    status = 200;
    isOk = true;
  } else if (typeof res === "object") {
    rawBody = (typeof res.body === "string") ? res.body : (res.body ? JSON.stringify(res.body) : JSON.stringify(res));
    status = res.status !== undefined ? res.status : (res.ok === false ? 500 : 200);
    statusText = res.statusText || (status === 200 ? "OK" : "Error");
    isOk = res.ok !== undefined ? res.ok : (status >= 200 && status < 300);
  }

  const bodyText = (rawBody || "").trim();

  const toolCall = {
    name: "LLM API 调用",
    output: `HTTP ${status} ${statusText} (${durationSec}s) -> ${endpoint || "API"}`
  };

  // 1. 拦截 HTML 网页返回
  if (bodyText.startsWith("<!DOCTYPE") || bodyText.startsWith("<!doctype") || bodyText.startsWith("<html") || bodyText.includes("<head>")) {
    const errMsg = `⚠️ **配置错误**: API 接口返回了网页 (HTML) 而非 JSON 数据 (HTTP ${status})。\n\n💡 通常是因为请求地址 (Base URL) 缺少 \`/v1\` 路径前缀，请点击左下角【⚙️ 设置】检查并补充 \`/v1\`。`;
    return {
      ok: false,
      error: errMsg,
      thinking: "响应为 HTML 非 JSON",
      toolCall: toolCall,
      content: errMsg,
      text: errMsg
    };
  }

  // 2. 拦截 HTTP 非 2xx 报错
  if (!isOk && status !== 200) {
    let errDetail = "";
    try {
      const parsed = JSON.parse(bodyText);
      errDetail = (parsed.error && parsed.error.message) || parsed.message || "";
    } catch (e) {
      errDetail = bodyText;
    }
    const errMsg = `⚠️ **API 请求失败 (HTTP ${status})**: ${errDetail || statusText || "未知错误"}`;
    return {
      ok: false,
      error: errMsg,
      thinking: `HTTP ${status} 报错`,
      toolCall: toolCall,
      content: errMsg,
      text: errMsg
    };
  }

  // 3. 解析正常 JSON
  try {
    const data = JSON.parse(bodyText);
    let extractedContent = "";
    let extractedThinking = `思考完成 (${modelName || "LLM"})`;

    // Anthropic Messages API
    if (data.content && Array.isArray(data.content)) {
      extractedContent = data.content.map(c => c.text || "").join("\n");
    } 
    // Ollama API
    else if (data.message && data.message.content) {
      extractedContent = data.message.content;
    }
    // OpenAI Chat Completions API
    else if (data.choices && data.choices[0] && data.choices[0].message) {
      const msgObj = data.choices[0].message;
      extractedContent = msgObj.content || "";
      if (msgObj.reasoning_content) {
        extractedThinking = msgObj.reasoning_content;
      }
    } else {
      extractedContent = bodyText;
    }

    // 提取 <think>...</think> 标签
    const thinkMatch = extractedContent.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      extractedThinking = thinkMatch[1].trim();
      extractedContent = extractedContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    }

    return {
      ok: true,
      error: null,
      content: extractedContent,
      text: extractedContent,
      thinking: extractedThinking,
      toolCall: toolCall
    };
  } catch (e) {
    return {
      ok: true,
      error: null,
      content: bodyText,
      text: bodyText,
      thinking: `响应解析完成 (${modelName || "LLM"})`,
      toolCall: toolCall
    };
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMessageHtml(msg, index = 0) {
  const isUser = msg.role === "user";
  const roleClass = isUser ? "user" : "assistant";
  const senderName = isUser ? "您" : "Codex Agent";
  const avatarIcon = isUser ? "\u{1F464}" : "\u{1F916}";
  const modelTag = (!isUser && msg.model)
    ? `<span class="msg-model-badge">${escapeHtml(msg.model)}</span>`
    : "";

  // 图片附件
  let imagesHtml = "";
  if (msg.images && msg.images.length > 0) {
    imagesHtml = `<div class="msg-images-grid">` +
      msg.images.map(img => `<img src="${img.base64}" class="msg-thumb-img" alt="附件">`).join("") +
      `</div>`;
  }

  // 思考过程折叠框
  let thinkingHtml = "";
  if (msg.thinking && !msg.thinking.includes("\u601d\u8003\u5b8c\u6210")) {
    thinkingHtml = `
      <div class="thinking-box">
        <div class="thinking-header" onclick="window.toggleThinking(this)">
          <span class="thinking-icon">\u{1F9E0}</span>
          <span class="thinking-title">\u601d\u8003\u4e2d...</span>
          <span class="thinking-toggle">\u23f1\ufe0f \u67e5\u770b\u601d\u8003</span>
        </div>
        <div class="thinking-body" style="display: none;">
          <div class="thinking-content">${escapeHtml(msg.thinking)}</div>
        </div>
      </div>
    `;
  }

  // 内容渲染 (Markdown 代码块 + 基础格式)
  let rawContent = msg.content || "";
  let formattedContent = escapeHtml(rawContent);

  // 多行代码块 ```lang ... ```
  formattedContent = formattedContent.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, codeText) => {
    const displayLang = (lang || "code").toLowerCase();
    const cleanCode = codeText.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    const safeBase64 = btoa(unescape(encodeURIComponent(cleanCode)));
    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-tag">${escapeHtml(displayLang)}</span>
          <div class="code-actions-group">
            <button type="button" class="btn-code-action" onclick="window.copyCodeFromBlock(this, '${safeBase64}')" title="\u590d\u5236\u4ee3\u7801">\u{1F4CB} \u590d\u5236</button>
            <button type="button" class="btn-code-action" onclick="window.saveCodeToFile('${displayLang}', '${safeBase64}')" title="\u53e6\u5b58\u4e3a\u6587\u4ef6">\u{1F4BE} \u53e6\u5b58\u4e3a</button>
          </div>
        </div>
        <pre><code>${codeText}</code></pre>
      </div>
    `;
  });

  // 行内格式
  formattedContent = formattedContent
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");

  // 悬浮微操作工具栏
  const hoverToolbar = `
    <div class="msg-hover-toolbar">
      <button type="button" class="btn-msg-tool" onclick="window.copyMessageText(${index})" title="\u590d\u5236\u672c\u6761\u5185\u5bb9">\u{1F4CB}</button>
      ${!isUser ? `<button type="button" class="btn-msg-tool" onclick="window.regenerateMessage(${index})" title="\u91cd\u65b0\u751f\u6210">\u{1F504}</button>` : ""}
      <button type="button" class="btn-msg-tool danger" onclick="window.deleteSingleMessage(${index})" title="\u5220\u9664\u672c\u6761">\u{1F5D1}\ufe0f</button>
    </div>
  `;

  return `
    <div class="chat-message-row ${roleClass}" data-msg-idx="${index}">
      <div class="msg-sender-header">
        <div class="msg-avatar-icon ${roleClass}">${avatarIcon}</div>
        <span class="msg-sender-name ${roleClass}">${senderName}</span>
        ${modelTag}
      </div>
      <div class="msg-bubble-wrap">
        ${imagesHtml}
        ${thinkingHtml}
        <div class="msg-content markdown-body">${formattedContent}</div>
      </div>
      ${hoverToolbar}
    </div>
  `;
}

function getDshProviders() {
  try {
    const saved = localStorage.getItem("dsh_providers_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}

  const defaultProviders = [
    {
      id: "prov_deepseek",
      name: "DeepSeek",
      isCustom: false,
      protocol: "openai",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
      models: "deepseek-chat, deepseek-coder, deepseek-reasoner"
    },
    {
      id: "prov_agentrouter",
      name: "AgentRouter",
      isCustom: true,
      protocol: "openai",
      baseUrl: "https://ps.air-outer.com/v1",
      apiKey: "",
      models: "gpt-5.6-sol, claude-opus-4-8, claude-opus-5"
    }
  ];
  localStorage.setItem("dsh_providers_config", JSON.stringify(defaultProviders));
  return defaultProviders;
}

let sessions = [];
let currentSessionId = "";

function loadSessionsFromStorage() {
  try {
    const saved = localStorage.getItem("codex_sessions_v1");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        sessions = parsed;
      } else {
        sessions = JSON.parse(JSON.stringify(DEFAULT_SESSIONS));
      }
    } else {
      sessions = JSON.parse(JSON.stringify(DEFAULT_SESSIONS));
    }
  } catch (e) {
    sessions = JSON.parse(JSON.stringify(DEFAULT_SESSIONS));
  }
  currentSessionId = localStorage.getItem("codex_active_session_id") || (sessions[0] ? sessions[0].id : "");
  if (!sessions.some(s => s.id === currentSessionId) && sessions[0]) {
    currentSessionId = sessions[0].id;
  }
  localStorage.setItem("codex_sessions_v1", JSON.stringify(sessions));
  localStorage.setItem("codex_active_session_id", currentSessionId);
  return sessions;
}

function getCurrentSession() {
  if (sessions.length === 0) loadSessionsFromStorage();
  return sessions.find(s => s.id === currentSessionId) || sessions[0];
}

function saveSessionsToStorage() {
  localStorage.setItem("codex_sessions_v1", JSON.stringify(sessions));
  localStorage.setItem("codex_active_session_id", currentSessionId);
}

document.addEventListener("DOMContentLoaded", () => {
  loadSessionsFromStorage();

  function saveDshProviders(providers) {
    localStorage.setItem("dsh_providers_config", JSON.stringify(providers));
    updateHeaderModelSelect();
  }

  const chatStream = document.getElementById("chat-stream");
  const sessionListContainer = document.getElementById("session-list");
  const btnNewChat = document.getElementById("btn-new-session");
  const composerInput = document.getElementById("composer-input");
  const btnSend = document.getElementById("btn-send");
  const fileUploader = document.getElementById("file-uploader");
  const imagePreviewBar = document.getElementById("image-preview-bar");
  const headerModelSelect = document.getElementById("header-model-select");
  const currentSessionTitleHeader = document.getElementById("current-session-title-header");

  const tabBtns = document.querySelectorAll(".nav-tab, .tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel, .tab-pane");

  const modalSettings = document.getElementById("modal-settings");
  const btnCloseSettings = document.getElementById("btn-close-settings");
  const btnSettingsModal = document.getElementById("btn-open-settings");

  const modalTheme = document.getElementById("modal-theme");
  const btnThemeModal = document.getElementById("btn-open-theme");
  const btnCloseTheme = document.getElementById("btn-close-theme");

  const modalAbout = document.getElementById("modal-about");
  const btnAboutModal = document.getElementById("btn-open-about");
  const btnCloseAbout = document.getElementById("btn-close-about");
  const btnCheckUpdates = document.getElementById("btn-check-updates");

  const rightPanel = document.getElementById("right-panel");
  const btnToggleRightPanel = document.getElementById("btn-toggle-right-panel");

  let isGenerating = false;
  let selectedImages = [];

  window.toggleThinking = function(el) {
    const body = el.nextElementSibling;
    if (body) {
      body.style.display = (body.style.display === "none" || !body.style.display) ? "block" : "none";
    }
  };

  function switchSession(sessionId) {
    currentSessionId = sessionId;
    saveSessionsToStorage();
    renderSessionList();
  renderSkills();
    renderChatStream();
  }

  function renderSessionList() {
    if (!sessionListContainer) return;
    sessionListContainer.innerHTML = sessions.map(s => {
      const activeClass = s.id === currentSessionId ? "active" : "";
      const count = s.messages ? s.messages.length : 0;
      return `
        <div class="session-card ${activeClass}" data-id="${s.id}">
          <div class="session-card-header">
            <div class="session-card-title-wrap">
              <span class="session-card-icon">💬</span>
              <span class="session-card-title" title="${escapeHtml(s.title || "新会话")}">${escapeHtml(s.title || "新会话")}</span>
            </div>
            <button type="button" class="btn-del-session" data-id="${s.id}" title="删除此会话">✕</button>
          </div>
          <div class="session-card-meta">
            <span>${count} 条消息</span>
          </div>
        </div>
      `;
    }).join("");

    const cur = getCurrentSession();
    if (currentSessionTitleHeader) {
      currentSessionTitleHeader.innerText = cur ? cur.title : "主工作区";
    }

    sessionListContainer.querySelectorAll(".session-card").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".btn-del-session")) return;
        switchSession(card.dataset.id);
      });
    });

    sessionListContainer.querySelectorAll(".btn-del-session").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.dataset.id;
        
        if (sessions.length <= 1) {
          // 若只剩唯一会话，直接重置清空为崭新会话
          sessions = [
            {
              id: "session_" + Date.now(),
              title: "新会话",
              updatedAt: Date.now(),
              messages: []
            }
          ];
          currentSessionId = sessions[0].id;
        } else {
          // 多于一个会话，直接删除目标会话
          const delIndex = sessions.findIndex(s => s.id === id);
          sessions = sessions.filter(s => s.id !== id);
          if (currentSessionId === id) {
            const nextIndex = Math.min(delIndex, sessions.length - 1);
            currentSessionId = sessions[nextIndex].id;
          }
        }
        
        saveSessionsToStorage();
        renderSessionList();
  renderSkills();
        renderChatStream();
      });
    });
  }

  if (btnNewChat) {
    btnNewChat.addEventListener("click", () => {
      const newSess = {
        id: "session_" + Date.now(),
        title: "新会话",
        updatedAt: Date.now(),
        messages: [
          {
            role: "assistant",
            model: headerModelSelect ? headerModelSelect.value : "gpt-5.6-sol",
            thinking: "新会话初始化完成。",
            toolCall: null,
            content: "新会话已开启，请输入您的需求或代码任务！",
            timestamp: Date.now()
          }
        ]
      };
      sessions.unshift(newSess);
      switchSession(newSess.id);
      if (composerInput) composerInput.focus();
    });
  }

  function renderChatStream() {
    if (!chatStream) return;
    const cur = getCurrentSession();
    if (!cur) return;
    chatStream.innerHTML = cur.messages.map((m, idx) => renderMessageHtml(m, idx)).join("");
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  // 侧边栏三大 Tab 系统
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabPanels.forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
      });

      btn.classList.add("active");
      const rawTab = btn.dataset.tab || "";
      const targetId = rawTab.startsWith("tab-") ? rawTab : ("tab-" + rawTab);
      const targetPanel = document.getElementById(targetId) || document.getElementById(rawTab);
      if (targetPanel) {
        targetPanel.classList.add("active");
        targetPanel.style.display = "flex";
      }
    });
  });

  
  // ==========================================
  // 🛠️ 35 项工业级 Skills 系统与实时搜索过滤
  // ==========================================
  const INDUSTRIAL_SKILLS = [
    { name: "测试驱动开发 (TDD)", command: "/tdd", desc: "严格红-绿-重构循环，先编写失败测试再编写最小实现" },
    { name: "极限追问评审 (Grilling)", command: "/grill-me", desc: "对架构方案进行全方位极限施压与盲点深度排查" },
    { name: "长程目标执行 (Goal Loop)", command: "/goal", desc: "自主长程多步骤任务推进，不达终点誓不罢休" },
    { name: "双轴代码审查 (Code Review)", command: "/code-review", desc: "标准规范与需求规格双轴并行审查代码质量" },
    { name: "深层模块架构 (Codebase Design)", command: "/codebase-design", desc: "设计深层模块接口、明确接缝、提升可测试性" },
    { name: "疑难Bug诊断 (Diagnosing Bugs)", command: "/diagnosing-bugs", desc: "硬核Bug与性能倒退全链路根因排查闭环" },
    { name: "领域建模 (Domain Modeling)", command: "/domain-modeling", desc: "构建清晰精准的项目业务领域模型与术语体系" },
    { name: "Git安全护栏 (Git Guardrails)", command: "/git-guardrails", desc: "严格拦截危险Git操作，杜绝误推与破坏性变更" },
    { name: "Shoehorn迁移 (Shoehorn)", command: "/migrate-to-shoehorn", desc: "将测试文件中的 as 断言重构为 Shoehorn 类型安全" },
    { name: "原型验证 (Prototype)", command: "/prototype", desc: "快速构建轻量可抛弃原型以验证交互与状态模型" },
    { name: "深度技术调研 (Research)", command: "/research", desc: "基于官方一手文档深度调研API事实与技术方案" },
    { name: "合并冲突化解 (Merge Conflicts)", command: "/resolving-merge-conflicts", desc: "精准安全解决Git复杂变基与合并冲突" },
    { name: "练习脚手架 (Scaffold Exercises)", command: "/scaffold-exercises", desc: "生成结构严谨、包含解答与讲解的代码演练模块" },
    { name: "代码提交规范 (Setup Pre-commit)", command: "/setup-pre-commit", desc: "一键配置Husky/Lint-staged/Prettier安全检查" },
    { name: "向导生成器 (Wizard)", command: "/wizard", desc: "生成一步步交互式向导指引人工基础设施配置" },
    { name: "Agent文档编写 (Writing For Agents)", command: "/writing-for-agents", desc: "编写高质量Agent指令、SKILL.md与全局规则" },
    { name: "经验沉淀学习 (Learn)", command: "/learn", desc: "将当前排错经验沉淀为可复用的项目技能" },
    { name: "定时与计划任务 (Schedule)", command: "/schedule", desc: "设置单次计时提醒或周期性自动化巡检任务" },
    { name: "Antigravity指南 (AGY Guide)", command: "/antigravity-guide", desc: "查阅Antigravity 2.0架构与IDE完整操作手册" },
    { name: "定制扩展系统 (Customizations)", command: "/agy-customizations", desc: "定制Rules、Skills、MCP与插件系统" },
    { name: "TypeScript重构 (TS Refactor)", command: "/ts-refactor", desc: "深度重构TypeScript类型系统消除any漏洞" },
    { name: "API接口契约设计 (API Design)", command: "/api-design", desc: "遵循RESTful/GraphQL工业标准设计高内聚API" },
    { name: "端到端自动化测试 (E2E Testing)", command: "/e2e-test", desc: "编写全流程UI与交互自动化验收测试套件" },
    { name: "性能基准分析 (Perf Benchmark)", command: "/perf-benchmark", desc: "定位内存泄漏、慢查询与渲染性能瓶颈" },
    { name: "Docker容器化封装 (Dockerize)", command: "/dockerize", desc: "编写多阶段构建Dockerfile与docker-compose配置" },
    { name: "安全漏洞扫描 (Security Audit)", command: "/security-audit", desc: "排查XSS/CSRF/SQL注入/越权等安全威胁" },
    { name: "CI/CD流水线编排 (CI/CD Pipeline)", command: "/cicd-pipeline", desc: "配置GitHub Actions自动化测试与构建发布工作流" },
    { name: "数据库架构设计 (DB Schema)", command: "/db-schema", desc: "设计范式化关系数据库与高效索引方案" },
    { name: "状态机建模 (State Machine)", command: "/state-machine", desc: "基于有限状态机设计无死锁复杂业务状态流" },
    { name: "多模态视觉分析 (Vision Analysis)", command: "/vision-analysis", desc: "分析上传的UI截图/原型图并提取结构与实现" },
    { name: "Electron打包与发布 (Electron Release)", command: "/electron-release", desc: "自动化配置NSIS自选安装、自动更新与签名" },
    { name: "CSS美学排版 (CSS Aesthetics)", command: "/css-aesthetics", desc: "应用现代弥散阴影、高对比度与响应式排版" },
    { name: "国际化与本地化 (i18n)", command: "/i18n", desc: "提取全系统文本并构建多语言无缝切换支持" },
    { name: "优雅降级与熔断 (Resilience)", command: "/resilience", desc: "设计超时重试、熔断降级与离线兜底策略" },
    { name: "死代码与冗余清理 (Tree Shaking)", command: "/tree-shaking", desc: "全面扫描未引用模块、废弃样式与临时调试脚本" }
  ];

  const skillsListContainer = document.getElementById("skills-list");
  const skillsSearchInput = document.getElementById("skills-search-input");

  function renderSkills(filterText = "") {
    if (!skillsListContainer) return;
    const query = filterText.trim().toLowerCase();
    const filtered = query
      ? INDUSTRIAL_SKILLS.filter(s => 
          s.name.toLowerCase().includes(query) || 
          s.command.toLowerCase().includes(query) || 
          s.desc.toLowerCase().includes(query)
        )
      : INDUSTRIAL_SKILLS;

    if (filtered.length === 0) {
      skillsListContainer.innerHTML = `
        <div style="padding: 24px 12px; text-align: center; color: #9ca3af; font-size: 13px;">
          未找到与 "${escapeHtml(filterText)}" 匹配的技能
        </div>
      `;
      return;
    }

    skillsListContainer.innerHTML = filtered.map(s => `
      <div class="skill-card-item" data-cmd="${escapeHtml(s.command)}">
        <div class="skill-card-top">
          <span class="skill-card-name">${escapeHtml(s.name)}</span>
          <span class="skill-card-cmd">${escapeHtml(s.command)}</span>
        </div>
        <div class="skill-card-desc">${escapeHtml(s.desc)}</div>
      </div>
    `).join("");

    skillsListContainer.querySelectorAll(".skill-card-item").forEach(item => {
      item.addEventListener("click", () => {
        const cmd = item.dataset.cmd;
        if (composerInput) {
          composerInput.value = cmd + " " + composerInput.value.replace(/^\/\S+\s*/, "");
          composerInput.focus();
        }
      });
    });
  }

  if (skillsSearchInput) {
    skillsSearchInput.addEventListener("input", (e) => {
      renderSkills(e.target.value);
    });
  }

  function bindFileTreeEvents() {
    document.querySelectorAll(".tree-item.dir, .file-tree-node").forEach(node => {
      node.addEventListener("click", () => {
        const filePath = node.dataset.path || node.innerText.trim();
        if (composerInput && filePath) {
          composerInput.value += ` @${filePath} `;
          composerInput.focus();
        }
      });
    });
  }
  bindFileTreeEvents();

  document.querySelectorAll(".skill-list-item, .skill-pill-card").forEach(item => {
    item.addEventListener("click", () => {
      const promptText = item.getAttribute("data-prompt") || item.dataset.skill || item.innerText.trim();
      if (composerInput && promptText) {
        composerInput.value = `/${promptText} ` + composerInput.value;
        composerInput.focus();
      }
    });
  });

  if (btnToggleRightPanel && rightPanel) {
    btnToggleRightPanel.addEventListener("click", () => {
      const style = window.getComputedStyle(rightPanel);
      if (style.display === "none") {
        rightPanel.style.display = "flex";
      } else {
        rightPanel.style.display = "none";
      }
    });
  }

  function removeImageThumb(idx) {
    selectedImages.splice(idx, 1);
    renderImagePreviewBar();
  }

  function renderImagePreviewBar() {
    if (!imagePreviewBar) return;
    if (selectedImages.length === 0) {
      imagePreviewBar.style.display = "none";
      imagePreviewBar.innerHTML = "";
      return;
    }
    imagePreviewBar.style.display = "flex";
    imagePreviewBar.innerHTML = selectedImages.map((img, idx) => `
      <div class="thumb-item">
        <img src="${img.base64}" alt="预览">
        <button type="button" class="btn-remove-thumb" data-idx="${idx}">✕</button>
      </div>
    `).join("");

    imagePreviewBar.querySelectorAll(".btn-remove-thumb").forEach(btn => {
      btn.addEventListener("click", () => {
        removeImageThumb(parseInt(btn.dataset.idx, 10));
      });
    });
  }

  function addImageThumb(base64, path = "") {
    selectedImages.push({ base64: base64, path: path });
    renderImagePreviewBar();
  }

  if (fileUploader) {
    fileUploader.addEventListener("change", (e) => {
      const files = e.target.files;
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const base64 = evt.target.result;
            let localPath = "";
            if (window.codexDesktop && window.codexDesktop.saveTempImage) {
              const res = await window.codexDesktop.saveTempImage(base64);
              if (res && res.success) localPath = res.path;
            }
            addImageThumb(base64, localPath);
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }

  window.addEventListener("paste", async (e) => {
    const items = (e.clipboardData || window.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf("image") === 0) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = async (evt) => {
          const base64 = evt.target.result;
          let localPath = "";
          if (window.codexDesktop && window.codexDesktop.saveTempImage) {
            const res = await window.codexDesktop.saveTempImage(base64);
            if (res && res.success) localPath = res.path;
          }
          addImageThumb(base64, localPath);
        };
        reader.readAsDataURL(blob);
      }
    }
  });

  // 消息发送与 LLM 请求
  async function requestLlmApi(prompt, chatHistory = [], targetAiMsg = null) {
    const selectedModel = headerModelSelect ? headerModelSelect.value : "gpt-5.6-sol";
    const providers = getDshProviders();

    let targetProv = providers.find(p => {
      const ms = parseModelList(p.models).map(m => m.toLowerCase());
      return ms.includes(selectedModel.toLowerCase());
    });

    if (!targetProv && providers.length > 0) targetProv = providers[0];

    const format = targetProv ? (targetProv.protocol || "openai") : "openai";
    const baseUrl = targetProv ? (targetProv.baseUrl || "https://ps.air-outer.com/v1").trim() : "https://ps.air-outer.com/v1";
    const apiKey = targetProv ? (targetProv.apiKey || "").trim() : "";
    const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

    let endpoint = "";
    const hasV1 = cleanBaseUrl.endsWith("/v1") || cleanBaseUrl.endsWith("/v1beta");
    const normalizedBase = (hasV1 || format === "ollama") ? cleanBaseUrl : (cleanBaseUrl + "/v1");
    if (format === "anthropic") endpoint = normalizedBase + "/messages";
    else if (format === "ollama") endpoint = normalizedBase + "/api/chat";
    else endpoint = normalizedBase + "/chat/completions";

    let messages = [];
    const sysPrompt = "You are OpenAI Codex Harness Desktop Agent, a senior AI software engineer with 35 industrial skills. Answer concisely in Chinese.";

    if (format === "anthropic") {
      chatHistory.forEach(h => {
        messages.push({ role: h.role === "user" ? "user" : "assistant", content: h.content });
      });
      messages.push({ role: "user", content: prompt });
    } else {
      messages.push({ role: "system", content: sysPrompt });
      chatHistory.forEach(h => {
        messages.push({ role: h.role === "user" ? "user" : "assistant", content: h.content });
      });
      messages.push({ role: "user", content: prompt });
    }

    const payload = (format === "anthropic")
      ? { model: selectedModel, system: sysPrompt, messages: messages, max_tokens: 4096 }
      : { model: selectedModel, messages: messages, temperature: 0.7, max_tokens: 4096 };

    const startTime = Date.now();

    try {
      let res;
      if (window.codexDesktop && window.codexDesktop.callLlmApi) {
        res = await window.codexDesktop.callLlmApi({
          endpoint: endpoint,
          apiKey: apiKey,
          body: payload
        });
      } else {
        const headers = (format === "anthropic")
          ? { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "User-Agent": "cline/3.0.0" }
          : { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey, "User-Agent": "cline/3.0.0" };
        const response = await fetch(endpoint, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload)
        });
        const text = await response.text();
        res = { ok: response.ok, status: response.status, statusText: response.statusText, body: text };
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const parsedRes = parseLlmApiResult(res, endpoint, selectedModel, duration);

      if (targetAiMsg) {
        if (parsedRes.thinking) targetAiMsg.thinking = parsedRes.thinking;
        // 保持纯净，日常对话不注入API工具卡片
      }

      return parsedRes.content || parsedRes.text || "已生成回复";
    } catch (err) {
      return `❌ **通信异常**: ${err.message}`;
    }
  }

  async function sendMessage() {
    const text = composerInput.value.trim();
    if (!text && selectedImages.length === 0) return;
    if (isGenerating) return;

    const cur = getCurrentSession();
    if (!cur) return;

    const curModel = headerModelSelect ? headerModelSelect.value : "gpt-5.6-sol";

    const userMsg = {
      role: "user",
      content: text,
      images: [...selectedImages],
      timestamp: Date.now()
    };
    cur.messages.push(userMsg);

    if (cur.title === "新会话" && text) {
      cur.title = text.slice(0, 16);
      renderSessionList();
  renderSkills();
    }

    composerInput.value = "";
    selectedImages = [];
    renderImagePreviewBar();
    saveSessionsToStorage();
    renderChatStream();

    isGenerating = true;
    btnSend.disabled = true;

    const aiMsg = {
      role: "assistant",
      model: curModel,
      thinking: "思考中...",
      toolCall: null,
      content: "正在生成回复...",
      timestamp: Date.now()
    };
    cur.messages.push(aiMsg);
    renderChatStream();

    const providers = getDshProviders();
    let targetProv = providers.find(p => {
      const ms = parseModelList(p.models).map(m => m.toLowerCase());
      return ms.includes(curModel.toLowerCase());
    });

    if (!targetProv && providers.length > 0) targetProv = providers[0];

    const provApiKey = targetProv ? (targetProv.apiKey || "").trim() : "";
    const provFormat = targetProv ? (targetProv.protocol || "openai") : "openai";
    const provName = targetProv ? targetProv.name : "当前提供方";

    if (!provApiKey && provFormat !== "ollama") {
      aiMsg.thinking = "⚠️ 未检测到 API Key";
      aiMsg.content = `当前提供方 **[${provName}]** 未配置 API 密钥，无法连接真实大模型。\n\n👉 **请点击左下角【⚙️ 设置】**，在提供方列表中找到 **[${provName}]** 点击 **[编辑]** 填入您的 API Key 并保存，即可直接与真实大模型多轮对话！`;
      saveSessionsToStorage();
      renderChatStream();
      isGenerating = false;
      btnSend.disabled = false;
      return;
    }

    try {
      const statusDot = document.querySelector(".status-dot");
    if (statusDot) statusDot.className = "status-dot busy";
    const reqStartTime = Date.now();
    const reply = await requestLlmApi(text, cur.messages.slice(0, -1), aiMsg);
    const reqDuration = ((Date.now() - reqStartTime) / 1000).toFixed(1);
    updateStatusBarMetrics(reqDuration, (text.length * 2) + 800, reply.length);
      aiMsg.content = reply;
      aiMsg.thinking = `思考完成 (${curModel})`;
    } catch (err) {
      aiMsg.content = `❌ 通信异常: ${err.message}`;
      aiMsg.thinking = "请求失败";
    }

    saveSessionsToStorage();
    renderChatStream();
    isGenerating = false;
    btnSend.disabled = false;
  }

  if (btnSend) btnSend.addEventListener("click", sendMessage);
  if (composerInput) {
    composerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // DSH 原生提供方卡片渲染与编辑对话框
  const modalDshEditor = document.getElementById("modal-dsh-provider-editor");
  const btnCloseDshEditor = document.getElementById("btn-close-dsh-editor");
  const btnCancelDshProv = document.getElementById("btn-dsh-cancel-prov");
  const btnDshAddPreset = document.getElementById("btn-dsh-add-preset");
  const btnDshAddCustom = document.getElementById("btn-dsh-add-custom");
  const dshEditorTitle = document.getElementById("dsh-editor-title");

  const dshProviderList = document.getElementById("dsh-provider-list");
  const dshProvName = document.getElementById("dsh-prov-name");
  const dshProvProtocol = document.getElementById("dsh-prov-protocol");
  const dshProvBaseUrl = document.getElementById("dsh-prov-base-url");
  const dshProvApiKey = document.getElementById("dsh-prov-api-key");
  const dshProvModels = document.getElementById("dsh-prov-models");
  const btnDshTogglePwd = document.getElementById("btn-dsh-toggle-pwd");
  const btnDshTestProv = document.getElementById("btn-dsh-test-prov");
  const btnDshSaveProv = document.getElementById("btn-dsh-save-prov");
  const dshProvStatusMsg = document.getElementById("dsh-prov-status-msg");

  let editingProvId = null;

  function renderDshProviders() {
    if (!dshProviderList) return;
    const providers = getDshProviders();

    dshProviderList.innerHTML = providers.map(p => {
      const isConfigured = !!(p.apiKey && p.apiKey.trim().length > 0);
      const dotClass = isConfigured ? "online" : "offline";
      const customTag = p.isCustom ? '<span class="dsh-custom-badge">自定义</span>' : '';
      const deleteBtn = p.isCustom 
        ? `<button type="button" class="btn-dsh-action-delete delete-prov" data-id="${p.id}">删除</button>` 
        : '';

      return `
        <div class="dsh-provider-item-card" data-id="${p.id}">
          <div class="dsh-card-info-left">
            <span class="dsh-provider-label">${escapeHtml(p.name)}</span>
            ${customTag}
            <span class="dsh-live-dot ${dotClass}" title="${isConfigured ? '已配置密钥' : '未配置密钥'}"></span>
          </div>
          <div class="dsh-card-buttons-right">
            <button type="button" class="btn-dsh-action-edit edit-prov" data-id="${p.id}">编辑</button>
            ${deleteBtn}
          </div>
        </div>
      `;
    }).join("");

    dshProviderList.querySelectorAll(".edit-prov").forEach(btn => {
      btn.addEventListener("click", () => openDshProviderEditor(btn.dataset.id));
    });

    dshProviderList.querySelectorAll(".delete-prov").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (confirm("确定要删除此提供方吗？")) {
          const list = getDshProviders().filter(p => p.id !== id);
          saveDshProviders(list);
          renderDshProviders();
        }
      });
    });
  }

  function openDshProviderEditor(provId = null, presetData = null) {
    editingProvId = provId;
    if (dshProvStatusMsg) {
      dshProvStatusMsg.style.display = "none";
      dshProvStatusMsg.className = "dsh-status-banner";
      dshProvStatusMsg.innerText = "";
    }

    if (provId) {
      const list = getDshProviders();
      const p = list.find(item => item.id === provId) || {};
      if (dshEditorTitle) dshEditorTitle.innerText = `编辑提供方 - ${p.name || ""}`;
      if (dshProvName) dshProvName.value = p.name || "";
      if (dshProvProtocol) dshProvProtocol.value = p.protocol || "openai";
      if (dshProvBaseUrl) dshProvBaseUrl.value = p.baseUrl || "";
      if (dshProvApiKey) dshProvApiKey.value = p.apiKey || "";
      if (dshProvModels) dshProvModels.value = p.models || "";
    } else if (presetData) {
      if (dshEditorTitle) dshEditorTitle.innerText = `添加提供方 - ${presetData.name}`;
      if (dshProvName) dshProvName.value = presetData.name;
      if (dshProvProtocol) dshProvProtocol.value = presetData.protocol || "openai";
      if (dshProvBaseUrl) dshProvBaseUrl.value = presetData.baseUrl || "";
      if (dshProvApiKey) dshProvApiKey.value = "";
      if (dshProvModels) dshProvModels.value = presetData.models || "";
    } else {
      if (dshEditorTitle) dshEditorTitle.innerText = "添加自定义提供方";
      if (dshProvName) dshProvName.value = "自定义提供方";
      if (dshProvProtocol) dshProvProtocol.value = "openai";
      if (dshProvBaseUrl) dshProvBaseUrl.value = "https://ps.air-outer.com/v1";
      if (dshProvApiKey) dshProvApiKey.value = "";
      if (dshProvModels) dshProvModels.value = "gpt-5.6-sol, claude-opus-4-8";
    }

    if (modalDshEditor) {
      modalDshEditor.style.display = "flex";
      modalDshEditor.classList.add("show");
    }
  }

  function closeDshProviderEditor() {
    if (modalDshEditor) {
      modalDshEditor.style.display = "none";
      modalDshEditor.classList.remove("show");
    }
  }

  if (btnDshAddCustom) btnDshAddCustom.addEventListener("click", () => openDshProviderEditor(null, null));
  if (btnDshAddPreset) {
    btnDshAddPreset.addEventListener("click", () => {
      openDshProviderEditor(null, {
        name: "Anthropic Claude",
        protocol: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        models: "claude-3-7-sonnet, claude-opus-4-8, claude-opus-5"
      });
    });
  }

  if (btnCloseDshEditor) btnCloseDshEditor.addEventListener("click", closeDshProviderEditor);
  if (btnCancelDshProv) btnCancelDshProv.addEventListener("click", closeDshProviderEditor);

  if (btnDshTogglePwd && dshProvApiKey) {
    btnDshTogglePwd.addEventListener("click", () => {
      dshProvApiKey.type = dshProvApiKey.type === "password" ? "text" : "password";
    });
  }

  if (btnDshTestProv) {
    btnDshTestProv.addEventListener("click", async () => {
      const name = dshProvName ? dshProvName.value.trim() : "";
      const rawUrl = dshProvBaseUrl ? dshProvBaseUrl.value.trim() : "";
      const key = dshProvApiKey ? dshProvApiKey.value.trim() : "";
      const protocol = dshProvProtocol ? dshProvProtocol.value : "openai";
      const modelsStr = dshProvModels ? dshProvModels.value.trim() : "";
      const modelList = parseModelList(modelsStr);
      const testModel = modelList[0] || (protocol === "anthropic" ? "claude-opus-4-8" : "gpt-5.6-sol");

      if (!rawUrl) {
        if (dshProvStatusMsg) {
          dshProvStatusMsg.style.display = "flex";
          dshProvStatusMsg.className = "dsh-status-banner error";
          dshProvStatusMsg.innerText = "❌ 请填写请求地址";
        }
        return;
      }

      if (dshProvStatusMsg) {
        dshProvStatusMsg.style.display = "flex";
        dshProvStatusMsg.className = "dsh-status-banner info";
        dshProvStatusMsg.innerText = `⏳ 正在测试连接 [${testModel}]...`;
      }

      const cleanBase = rawUrl.replace(/\/+$/, "");
      let endpoint = "";
      const hasV1 = cleanBase.endsWith("/v1") || cleanBase.endsWith("/v1beta");
      const normalized = (hasV1 || protocol === "ollama") ? cleanBase : (cleanBase + "/v1");
      if (protocol === "anthropic") endpoint = normalized + "/messages";
      else if (protocol === "ollama") endpoint = normalized + "/api/chat";
      else endpoint = normalized + "/chat/completions";

      const payload = (protocol === "anthropic")
        ? { model: testModel, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }
        : { model: testModel, messages: [{ role: "user", content: "hi" }], max_tokens: 1 };

      try {
        let res;
        if (window.codexDesktop && window.codexDesktop.callLlmApi) {
          res = await window.codexDesktop.callLlmApi({
            endpoint: endpoint,
            apiKey: key,
            body: payload
          });
        } else {
          const h = (protocol === "anthropic")
            ? { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "User-Agent": "cline/3.0.0" }
            : { "Content-Type": "application/json", "Authorization": "Bearer " + key, "User-Agent": "cline/3.0.0" };
          const r = await fetch(endpoint, { method: "POST", headers: h, body: JSON.stringify(payload) });
          const t = await r.text();
          res = { ok: r.ok, status: r.status, statusText: r.statusText, body: t };
        }

        if (res.ok || res.status === 200) {
          if (dshProvStatusMsg) {
            dshProvStatusMsg.style.display = "flex";
            dshProvStatusMsg.className = "dsh-status-banner success";
            dshProvStatusMsg.innerText = `✅ 连通成功! (${testModel} 鉴权通过)`;
          }
        } else {
          let errMsg = "";
          try {
            const parsed = JSON.parse(res.body);
            errMsg = (parsed.error && parsed.error.message) || parsed.message || "";
          } catch (e) {
            errMsg = res.body || "";
          }
          if (dshProvStatusMsg) {
            dshProvStatusMsg.style.display = "flex";
            dshProvStatusMsg.className = "dsh-status-banner error";
            dshProvStatusMsg.innerText = `❌ 失败 (HTTP ${res.status}): ${errMsg || res.statusText || "鉴权未通过"}`;
          }
        }
      } catch (e) {
        if (dshProvStatusMsg) {
          dshProvStatusMsg.style.display = "flex";
          dshProvStatusMsg.className = "dsh-status-banner error";
          dshProvStatusMsg.innerText = "❌ 异常: " + e.message;
        }
      }
    });
  }

  if (btnDshSaveProv) {
    btnDshSaveProv.addEventListener("click", () => {
      const name = dshProvName ? dshProvName.value.trim() : "";
      const rawUrl = dshProvBaseUrl ? dshProvBaseUrl.value.trim() : "";
      const key = dshProvApiKey ? dshProvApiKey.value.trim() : "";
      const protocol = dshProvProtocol ? dshProvProtocol.value : "openai";
      const modelsStr = dshProvModels ? dshProvModels.value.trim() : "";

      if (!name || !rawUrl) {
        if (dshProvStatusMsg) {
          dshProvStatusMsg.style.display = "flex";
          dshProvStatusMsg.className = "dsh-status-banner error";
          dshProvStatusMsg.innerText = "❌ 请填写名称与基础地址";
        }
        return;
      }

      let list = getDshProviders();
      if (editingProvId) {
        const found = list.find(p => p.id === editingProvId);
        if (found) {
          found.name = name;
          found.baseUrl = rawUrl;
          found.apiKey = key;
          found.protocol = protocol;
          found.models = modelsStr;
        }
      } else {
        list.push({
          id: "prov_" + Date.now(),
          name: name,
          isCustom: true,
          protocol: protocol,
          baseUrl: rawUrl,
          apiKey: key,
          models: modelsStr
        });
      }

      saveDshProviders(list);
      closeDshProviderEditor();
      renderDshProviders();
    });
  }

    // ==========================================
  // 🎯 DSH 1:1 发送按钮旁模型胶囊与 Popover 联动
  // ==========================================
  const btnDshModelCapsule = document.getElementById("btn-dsh-model-capsule");
  const dshModelPopover = document.getElementById("dsh-model-popover");
  const dshCurrentModelLabel = document.getElementById("dsh-current-model-label");
  const dshPopoverModelList = document.getElementById("dsh-popover-model-list");
  const dshPopoverProvCount = document.getElementById("dsh-popover-prov-count");
  const dshModelPickerWrap = document.getElementById("dsh-model-picker-wrap");

    function renderModelPopoverItems() {
    if (!dshPopoverModelList) return;
    const providers = getDshProviders();
    const currentSelected = localStorage.getItem("codex_current_selected_model") || (headerModelSelect ? headerModelSelect.value : "gpt-5.6-sol");

    let totalModels = 0;
    let activeProvidersCount = 0;
    let html = "";

    providers.forEach(p => {
      const ms = parseModelList(p.models);
      if (ms.length > 0) {
        activeProvidersCount++;
        html += `<div class="dsh-provider-group-title">${escapeHtml(p.name)}</div>`;
        ms.forEach(m => {
          totalModels++;
          const isActive = (m.trim().toLowerCase() === currentSelected.trim().toLowerCase());
          const activeClass = isActive ? "active" : "";
          html += `
            <div class="dsh-model-item ${activeClass}" data-model="${escapeHtml(m)}">
              <div class="dsh-model-item-left">
                <span class="dsh-model-dot"></span>
                <span class="dsh-model-name">${escapeHtml(m)}</span>
              </div>
              ${isActive ? '<span class="dsh-model-check">✓</span>' : ''}
            </div>
          `;
        });
      }
    });

    if (totalModels === 0) {
      html = `<div style="padding: 14px; font-size: 12px; color: #9ca3af; text-align: center;">暂无可用模型，请点击设置配置模型</div>`;
    }

    dshPopoverModelList.innerHTML = html;
    if (dshPopoverProvCount) {
      dshPopoverProvCount.innerText = `${activeProvidersCount} 个提供方 · ${totalModels} 个模型`;
    }

    dshPopoverModelList.querySelectorAll(".dsh-model-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const modelName = item.dataset.model;
        if (modelName) {
          selectActiveModel(modelName);
          closeModelPopover();
        }
      });
    });
  }

  function selectActiveModel(modelName) {
    localStorage.setItem("codex_current_selected_model", modelName);
    if (dshCurrentModelLabel) {
      dshCurrentModelLabel.innerText = modelName;
    }
    if (headerModelSelect) {
      headerModelSelect.value = modelName;
    }
    renderModelPopoverItems();
  }

  function toggleModelPopover() {
    if (!dshModelPopover) return;
    const isShown = dshModelPopover.classList.contains("active");
    if (isShown) {
      closeModelPopover();
    } else {
      renderModelPopoverItems();
      dshModelPopover.classList.add("active");
      if (dshModelPickerWrap) dshModelPickerWrap.classList.add("open");
    }
  }

  function closeModelPopover() {
    if (dshModelPopover) {
      dshModelPopover.classList.remove("active");
    }
    if (dshModelPickerWrap) {
      dshModelPickerWrap.classList.remove("open");
    }
  }

  if (btnDshModelCapsule) {
    btnDshModelCapsule.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleModelPopover();
    });
  }

  // 点击页面任何外部区域立即关闭 Popover
  document.addEventListener("click", (e) => {
    if (dshModelPopover && dshModelPopover.classList.contains("active")) {
      if (!dshModelPickerWrap || !dshModelPickerWrap.contains(e.target)) {
        closeModelPopover();
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModelPopover();
    }
  });

  function updateHeaderModelSelect(preferSelectModel = null) {
    const providers = getDshProviders();
    let modelOptions = [];

    providers.forEach(p => {
      const rawList = parseModelList(p.models);
      rawList.forEach(m => {
        if (!modelOptions.some(opt => opt.value.toLowerCase() === m.toLowerCase())) {
          modelOptions.push({
            value: m,
            text: m,
            providerId: p.id
          });
        }
      });
    });

    if (modelOptions.length === 0) {
      modelOptions.push({ value: "gpt-5.6-sol", text: "gpt-5.6-sol" });
    }

    if (headerModelSelect) {
      headerModelSelect.innerHTML = modelOptions.map(opt => 
        `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.text)}</option>`
      ).join("");
    }

    const lastSelected = preferSelectModel || localStorage.getItem("codex_current_selected_model");
    let activeModel = modelOptions[0].value;
    if (lastSelected && modelOptions.some(opt => opt.value === lastSelected)) {
      activeModel = lastSelected;
    }
    
    if (headerModelSelect) headerModelSelect.value = activeModel;
    if (dshCurrentModelLabel) dshCurrentModelLabel.innerText = activeModel;
    localStorage.setItem("codex_current_selected_model", activeModel);
  }

  // 全局弹窗与快捷键
  function closeAllModals() {
    if (modalSettings) { modalSettings.style.display = "none"; modalSettings.classList.remove("show"); }
    if (modalDshEditor) { modalDshEditor.style.display = "none"; modalDshEditor.classList.remove("show"); }
    if (modalTheme) { modalTheme.style.display = "none"; modalTheme.classList.remove("show"); }
    if (modalAbout) { modalAbout.style.display = "none"; modalAbout.classList.remove("show"); }
  }

  if (btnSettingsModal) {
    btnSettingsModal.addEventListener("click", () => {
      if (modalSettings) {
        modalSettings.style.display = "flex";
        modalSettings.classList.add("show");
        renderDshProviders();
      }
    });
  }

  if (btnCloseSettings) btnCloseSettings.addEventListener("click", closeAllModals);

  if (btnThemeModal) {
    btnThemeModal.addEventListener("click", () => {
      if (modalTheme) {
        modalTheme.style.display = "flex";
        modalTheme.classList.add("show");
        const current = localStorage.getItem("codex_theme") || "dark";
        document.querySelectorAll(".theme-card").forEach(c => {
          if (c.dataset.theme === current) {
            c.classList.add("active");
            c.style.border = "2px solid var(--accent)";
          } else {
            c.classList.remove("active");
            c.style.border = "1px solid var(--border)";
          }
        });
      }
    });
  }
  if (btnCloseTheme) btnCloseTheme.addEventListener("click", closeAllModals);

    async function openAboutModal() {
    if (modalAbout) {
      modalAbout.style.display = "flex";
      modalAbout.classList.add("show");
      try {
        const verEl = document.getElementById("about-version");
        if (verEl && window.codexDesktop && window.codexDesktop.getAppInfo) {
          const info = await window.codexDesktop.getAppInfo();
          verEl.innerText = `版本: v${info.version || "1.0.0"} (${info.platform || "Windows"} ${info.arch || "x64"})`;
        }
        renderSkillsTagsCloud();
      } catch (e) {
        console.error(e);
      }
    }
  }

  if (btnAboutModal) {
    btnAboutModal.addEventListener("click", openAboutModal);
  }

  btnCloseAbout.addEventListener("click", closeAllModals);

  if (btnCheckUpdates) {
    btnCheckUpdates.addEventListener("click", () => {
      if (window.codexDesktop && window.codexDesktop.checkForUpdates) {
        window.codexDesktop.checkForUpdates();
      }
    });
  }

  if (window.codexDesktop && window.codexDesktop.onMenuAction) {
    window.codexDesktop.onMenuAction((action) => {
      if (action === "new-chat" || action === "new-session") {
        if (btnNewChat) btnNewChat.click();
      } else if (action === "open-settings" || action === "settings") {
        if (btnSettingsModal) btnSettingsModal.click();
      } else if (action === "about" || action === "open-about") {
        openAboutModal();
      } else if (action.startsWith("theme:")) {
        const themeKey = action.replace("theme:", "");
        if (window.codexDesktop.setTheme) window.codexDesktop.setTheme(themeKey);
      }
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === modalSettings || e.target === modalDshEditor || e.target === modalTheme || e.target === modalAbout) {
      closeAllModals();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
  });

  updateHeaderModelSelect();
  renderSessionList();
  renderSkills();
  renderChatStream();

  // ==========================================
  // ⚡ DSH 增强特性: 代码块、消息微操作与会话导出
  // ==========================================
  window.copyCodeFromBlock = function(btn, b64Code) {
    try {
      const codeStr = decodeURIComponent(escape(atob(b64Code)));
      navigator.clipboard.writeText(codeStr).then(() => {
        btn.innerText = "✓ 已复制";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.innerText = "📋 复制";
          btn.classList.remove("copied");
        }, 1800);
      });
    } catch (e) {
      console.error("复制代码失败", e);
    }
  };

  window.saveCodeToFile = function(lang, b64Code) {
    try {
      const codeStr = decodeURIComponent(escape(atob(b64Code)));
      const extMap = { js: "js", javascript: "js", ts: "ts", typescript: "ts", py: "py", python: "py", html: "html", css: "css", json: "json", md: "md", sh: "sh", bash: "sh", rust: "rs", go: "go", sql: "sql" };
      const ext = extMap[lang.toLowerCase()] || "txt";
      const filename = `code_${Date.now()}.${ext}`;
      const blob = new Blob([codeStr], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("另存为代码失败", e);
    }
  };

  window.copyMessageText = function(index) {
    const cur = getCurrentSession();
    if (cur && cur.messages && cur.messages[index]) {
      const text = cur.messages[index].content || "";
      navigator.clipboard.writeText(text);
    }
  };

  window.deleteSingleMessage = function(index) {
    const cur = getCurrentSession();
    if (cur && cur.messages && cur.messages[index]) {
      cur.messages.splice(index, 1);
      saveSessionsToStorage();
      renderChatStream();
    }
  };

  window.regenerateMessage = async function(index) {
    const cur = getCurrentSession();
    if (!cur || !cur.messages || index <= 0) return;
    const userMsg = cur.messages[index - 1];
    if (!userMsg || userMsg.role !== "user") return;

    cur.messages.splice(index, 1);
    const selectedModel = localStorage.getItem("codex_current_selected_model") || (headerModelSelect ? headerModelSelect.value : "gpt-5.6-sol");

    const aiMsg = {
      role: "assistant",
      content: "",
      model: selectedModel,
      thinking: "正在重新思考与推理中...",
      updatedAt: Date.now()
    };
    cur.messages.push(aiMsg);
    renderChatStream();

    const reply = await requestLlmApi(userMsg.content, cur.messages.slice(0, -1), aiMsg);
    aiMsg.content = reply;
    aiMsg.thinking = "";
    saveSessionsToStorage();
    renderChatStream();
  };

  // 会话导出为 Markdown
  const btnExportSession = document.getElementById("btn-export-session");
  if (btnExportSession) {
    btnExportSession.addEventListener("click", () => {
      const cur = getCurrentSession();
      if (!cur || !cur.messages || cur.messages.length === 0) {
        alert("当前会话暂无消息内容可导出");
        return;
      }
      let md = `# ${cur.title || "Codex 会话记录"}\n\n`;
      md += `*导出时间: ${new Date().toLocaleString()}*\n\n---\n\n`;
      cur.messages.forEach((m) => {
        const isUser = m.role === "user";
        md += `### ${isUser ? "👤 您 (User)" : `🤖 Codex Agent [${m.model || "Assistant"}]`}\n\n`;
        if (m.thinking) {
          md += `> 🧠 **思考过程**:\n> ${m.thinking.replace(/\n/g, "\n> ")}\n\n`;
        }
        md += `${m.content}\n\n---\n\n`;
      });

      const filename = `${(cur.title || "会话").replace(/[\\/:*?"<>|]/g, "_")}_${Date.now()}.md`;
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // 状态栏实时刷新
  function updateStatusBarMetrics(durationSec = "1.2", tokensIn = 1200, tokensOut = 350) {
    const latEl = document.getElementById("status-latency-metric");
    const tokEl = document.getElementById("status-token-metric");
    const dot = document.querySelector(".status-dot");
    if (dot) {
      dot.className = "status-dot online";
    }
    if (latEl) {
      const speed = durationSec > 0 ? Math.round(tokensOut / parseFloat(durationSec)) : 140;
      latEl.innerText = `首 token ${durationSec}s · ${speed} tok/s`;
    }
    if (tokEl) {
      const inK = (tokensIn / 1000).toFixed(1);
      tokEl.innerText = `输入 ${inK}k · 输出 ${tokensOut} tok`;
    }
  }

  // 全局开发者快捷键
  window.addEventListener("keydown", (e) => {
    // Ctrl + N 新建会话
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      if (btnNewChat) btnNewChat.click();
    }
    // Ctrl + K 聚焦搜索
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const sInput = document.getElementById("skills-search-input");
      if (sInput) {
        const skillsTab = document.querySelector(".nav-tab[data-tab='skills']");
        if (skillsTab) skillsTab.click();
        sInput.focus();
      }
    }
    // Ctrl + L 清空当前会话
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      const cur = getCurrentSession();
      if (cur) {
        cur.messages = [];
        saveSessionsToStorage();
        renderChatStream();
      }
    }
  });


  // 绑定 GitHub 开源仓库卡片与状态栏链接跳转
  const GITHUB_REPO_URL = "https://github.com/Simon-yyy/Codex-Harness-DeskTop";
  const aboutRepoCard = document.getElementById("about-repo-card");
  if (aboutRepoCard) {
    aboutRepoCard.addEventListener("click", () => {
      if (window.codexDesktop && window.codexDesktop.openExternal) {
        window.codexDesktop.openExternal(GITHUB_REPO_URL);
      } else {
        window.open(GITHUB_REPO_URL, "_blank");
      }
    });
  }

  const statusRepoLink = document.getElementById("status-repo-link");
  if (statusRepoLink) {
    statusRepoLink.addEventListener("click", () => {
      if (window.codexDesktop && window.codexDesktop.openExternal) {
        window.codexDesktop.openExternal(GITHUB_REPO_URL);
      } else {
        window.open(GITHUB_REPO_URL, "_blank");
      }
    });
  }

});
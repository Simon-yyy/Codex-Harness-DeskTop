// 渲染层行为测试 (vm + DOM/localStorage 桩, 无需 Electron)
// 覆盖缝: S1 parseModelList / S3 会话持久化 / S5 渲染 XSS 转义 / S7 DSH 提供方持久化
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");

// ---------- 桩 ----------
function makeLocalStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    dump: () => store
  };
}

function makeElement(id) {
  const listeners = {};
  return {
    id,
    style: {},
    dataset: {},
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    click(ev) { (listeners["click"] || []).forEach(fn => fn(ev || { target: this, stopPropagation() {} })); },
    focus() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    nextElementSibling: null,
    scrollTop: 0,
    scrollHeight: 0,
    innerHTML: "",
    innerText: "",
    textContent: "",
    value: "",
    checked: false,
    type: "text",
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    }
  };
}

function createDomHarness(seedLocalStorage = {}) {
  const elements = new Map();
  const registry = new Proxy({}, {
    get(t, id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    }
  });
  let domReady = null;
  const documentStub = {
    addEventListener(type, fn) { if (type === "DOMContentLoaded") domReady = fn; },
    getElementById: (id) => registry[id],
    querySelectorAll: () => [],
    createElement: () => {
      // 模拟浏览器语义: textContent 赋值后 innerHTML 读出为转义实体
      let raw = "";
      const esc = (s) => String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
      return {
        get innerHTML() { return esc(raw); },
        set innerHTML(v) { raw = String(v); },
        get textContent() { return raw; },
        set textContent(v) { raw = String(v); }
      };
    }
  };
  const winListeners = {};
  const windowStub = {
    addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
    getComputedStyle: () => ({ display: "block" })
  };
  const localStorage = makeLocalStorage(seedLocalStorage);
  const silentConsole = { log() {}, info() {}, warn() {}, error() {} };
  const sandbox = {
    document: documentStub,
    window: windowStub,
    localStorage,
    console: silentConsole,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    parseInt,
    parseFloat,
    confirm: () => true
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appJs, sandbox, { filename: "app.js" });
  return { sandbox, registry, localStorage, fireDomReady: () => domReady && domReady() };
}

// ---------- S0: DOMContentLoaded 回调完整执行 (防合并损坏/悬挂引用) ----------
export function testDomReadyCompletes() {
  const h = createDomHarness();
  h.fireDomReady(); // 若回调中途抛 ReferenceError 等异常，这里会直接向上抛出使测试失败

  // 初始化渲染必须完成
  assert.ok(h.registry["session-list"].innerHTML.length > 0, "会话列表应完成渲染");
  assert.ok(h.registry["chat-stream"].innerHTML.length > 0, "聊天流应完成渲染");

  // 底部三个按钮必须已接线并能打开对应弹窗
  const pairs = [
    ["btn-open-settings", "modal-settings"],
    ["btn-open-theme", "modal-theme"],
    ["btn-open-about", "modal-about"]
  ];
  for (const [b, m] of pairs) {
    h.registry[b].click();
    assert.strictEqual(h.registry[m].style.display, "flex", `${b} 点击后 ${m} 应显示`);
    assert.ok(h.registry[m].classList.contains("show"), `${b} 点击后 ${m} 应带 show 类`);
  }
}

// ---------- S1: parseModelList ----------
export function testParseModelList() {
  const { sandbox } = createDomHarness();
  const parse = sandbox.parseModelList;
  assert.ok(typeof parse === "function", "parseModelList 应为顶层函数");
  // 跨 realm 比较: 用 JSON 序列化避免原型差异
  const eq = (actual, expected) => assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));

  eq(parse("gpt-4o, claude-opus-4-8"), ["gpt-4o", "claude-opus-4-8"]);
  // 中文顿号 / 中文逗号 / 中文分号 混用
  eq(parse("gpt-4o、claude-opus-4-8，deepseek-chat；o1"), ["gpt-4o", "claude-opus-4-8", "deepseek-chat", "o1"]);
  // 空白与换行
  eq(parse("  gpt-4o \n deepseek-chat \r\n o1 "), ["gpt-4o", "deepseek-chat", "o1"]);
  // 空输入 / 非法输入
  eq(parse(""), []);
  eq(parse(null), []);
  eq(parse("，，，；;  "), []);
  // 去重不在此函数职责内：重复项原样保留
  eq(parse("gpt-4o, gpt-4o"), ["gpt-4o", "gpt-4o"]);
}

// ---------- S3: 会话持久化 ----------
export function testSessionPersistence() {
  // 1) 全新启动写入默认会话
  const h1 = createDomHarness();
  h1.sandbox.loadSessionsFromStorage();
  const seeded = JSON.parse(h1.localStorage.dump().codex_sessions_v1);
  assert.strictEqual(seeded.length, 3, "默认会话应写入本地存储");
  assert.ok(h1.sandbox.getCurrentSession(), "应存在当前会话");

  // 2) 损坏 JSON 回退默认会话且不抛异常
  const h2 = createDomHarness({ codex_sessions_v1: "{corrupt!!" });
  h2.sandbox.loadSessionsFromStorage();
  const seeded2 = JSON.parse(h2.localStorage.dump().codex_sessions_v1);
  assert.strictEqual(seeded2.length, 3, "损坏数据应回退为默认会话");

  // 3) 保存 → 重载往返 (标题修改持久化)
  const h3 = createDomHarness();
  h3.sandbox.loadSessionsFromStorage();
  const cur = h3.sandbox.getCurrentSession();
  const curId = cur.id;
  cur.title = "持久化标题";
  h3.sandbox.saveSessionsToStorage();
  const after = JSON.parse(h3.localStorage.dump().codex_sessions_v1);
  assert.strictEqual(after.find(s => s.id === curId).title, "持久化标题");

  // 4) 活动会话恢复
  const h4 = createDomHarness();
  h4.sandbox.loadSessionsFromStorage();
  const dump4 = h4.localStorage.dump();
  const targetId = JSON.parse(dump4.codex_sessions_v1)[1].id;
  const h5 = createDomHarness({ ...dump4, codex_active_session_id: targetId });
  h5.sandbox.loadSessionsFromStorage();
  assert.strictEqual(h5.sandbox.getCurrentSession().id, targetId, "应恢复上次活动会话");
}

// ---------- S5: 渲染 XSS 转义 ----------
export function testRenderXssGuard() {
  const evil = "<script>alert(1)</script><img src=x onerror=alert(2)>";
  const sess = [{
    id: "s1",
    title: "xss",
    updatedAt: Date.now(),
    messages: [
      { role: "user", content: evil, timestamp: 1 },
      { role: "assistant", model: "gpt-4o", thinking: evil, toolCall: { name: evil, output: evil }, content: evil, timestamp: 2 }
    ]
  }];
  const h = createDomHarness({ codex_sessions_v1: JSON.stringify(sess), codex_active_session_id: "s1" });
  h.fireDomReady();
  const html = h.registry["chat-stream"].innerHTML;

  assert.ok(html.includes("&lt;script&gt;"), "script 标签应被转义为实体");
  assert.ok(!html.includes("<script>alert"), "不得出现未转义的可执行 script");
  assert.ok(html.includes("&lt;img"), "img 标签应被转义");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "用户消息应完整转义");
  // thinking 与 toolCall 输出同样转义
  assert.ok(html.includes("&lt;img src=x onerror=alert(2)&gt;"), "thinking/toolCall 也应转义");
}

// ---------- S7: DSH 提供方持久化 ----------
export function testDshProviders() {
  const h = createDomHarness();
  const get = h.sandbox.getDshProviders;
  assert.ok(typeof get === "function", "getDshProviders 应为顶层函数");

  // 首次调用写入默认提供方 (OpenAI, DeepSeek, Anthropic, AgentRouter, Ollama)
  const first = get();
  assert.strictEqual(first.length, 5, "默认应有 5 个提供方预设");
  assert.ok(first.some(p => p.id === "prov_openai"));
  assert.ok(first.some(p => p.id === "prov_deepseek"));
  assert.ok(first.some(p => p.id === "prov_anthropic"));
  assert.ok(first.some(p => p.id === "prov_agentrouter"));
  assert.ok(first.some(p => p.id === "prov_ollama"));

  // 已保存数据直接返回 (往返一致)
  const second = get();
  assert.strictEqual(second.length, 5);
  assert.strictEqual(second[0].id, first[0].id);

  // 外部保存的自定义提供方可读回
  h.localStorage.setItem("dsh_providers_config", JSON.stringify([{ id: "custom1", name: "My", isCustom: true, protocol: "openai", baseUrl: "https://x/v1", apiKey: "", models: "m1" }]));
  const third = get();
  assert.ok(third.some(p => p.id === "custom1"));

  // 损坏 JSON → 回退默认
  h.localStorage.setItem("dsh_providers_config", "{bad json");
  const fourth = get();
  assert.strictEqual(fourth.length, 5, "损坏 JSON 应回退默认提供方");

  // 空数组 → 回退默认
  h.localStorage.setItem("dsh_providers_config", "[]");
  const fifth = get();
  assert.strictEqual(fifth.length, 5, "空数组应回退默认提供方");
}

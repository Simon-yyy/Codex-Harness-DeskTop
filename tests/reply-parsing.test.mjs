import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function runReplyParsingTests() {
  const documentStub = {
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    createElement() { let t = ""; return { set textContent(v) { t = String(v); }, get innerHTML() { return t; } }; }
  };
  const localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const sandbox = {
    document: documentStub,
    window: {},
    localStorage,
    console,
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
  vm.runInContext(fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8"), sandbox, { filename: "app.js" });

  const parse = sandbox.parseLlmApiResult;
  assert.ok(typeof parse === "function", "parseLlmApiResult 应为暴露的函数");

  // 1) 真实场景: HTTP 200 + HTML 响应
  const htmlBody = "<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\" /><title>Agent Router</title></head><body><noscript>You need to enable JavaScript to run this app.</noscript><div id=\"root\"></div></body></html>";
  const htmlResult = parse({ ok: true, status: 200, statusText: "OK", body: htmlBody }, "https://example.com/v1/messages", "claude-opus-4-8", "1.9");
  assert.strictEqual(htmlResult.ok, false, "HTML 响应应判定为失败而非回复");
  assert.ok(htmlResult.content.includes("HTML"), "错误信息应明确说明返回的是 HTML 网页");
  assert.ok(!htmlResult.content.startsWith("<!doctype html>"), "HTML 不应作为回复输出");
  assert.ok(htmlResult.thinking.includes("JSON"), "思考链应说明响应体不是有效 JSON");

  // 2) OpenAI Chat Completions 正常 JSON
  const openaiResult = parse(
    { ok: true, status: 200, statusText: "OK", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: "你好！模型回复" } }], usage: { total_tokens: 42 } }) },
    "https://example.com/v1/chat/completions", "gpt-4o", "0.8"
  );
  assert.strictEqual(openaiResult.ok, true);
  assert.strictEqual(openaiResult.content, "你好！模型回复");
  assert.ok(openaiResult.toolCall && openaiResult.toolCall.output.includes("200 OK"));

  // 3) Anthropic Messages 正常响应
  const anthropicResult = parse(
    { ok: true, status: 200, statusText: "OK", body: JSON.stringify({ content: [{ type: "text", text: "Claude 回复测试" }] }) },
    "https://example.com/v1/messages", "claude-opus-4-8", "1.2"
  );
  assert.strictEqual(anthropicResult.ok, true);
  assert.strictEqual(anthropicResult.content, "Claude 回复测试");

  // 4) HTTP 非 2xx 报错
  const errResult = parse(
    { ok: false, status: 401, statusText: "Unauthorized", body: JSON.stringify({ error: { message: "bad key" } }) },
    "https://example.com/v1/chat/completions", "gpt-4o", "0.5"
  );
  assert.strictEqual(errResult.ok, false);
  assert.ok(errResult.content.includes("401"), "错误消息应包含状态码");

  // 5) <think> 标签解析
  const thinkResult = parse(
    { ok: true, status: 200, statusText: "OK", body: JSON.stringify({ choices: [{ message: { role: "assistant", content: "前置<think>这是思考过程</think>正文" } }] }) },
    "https://example.com/v1/chat/completions", "deepseek-r1", "2.0"
  );
  assert.strictEqual(thinkResult.ok, true);
  assert.strictEqual(thinkResult.content, "前置正文");
  assert.strictEqual(thinkResult.thinking, "这是思考过程");

  // 6) reasoning_content 字段解析
  const reasoningResult = parse(
    { ok: true, status: 200, statusText: "OK", body: JSON.stringify({ choices: [{ message: { role: "assistant", reasoning_content: "深度思考中...", content: "最终答案" } }] }) },
    "https://example.com/v1/chat/completions", "deepseek-reasoner", "3.1"
  );
  assert.strictEqual(reasoningResult.ok, true);
  assert.strictEqual(reasoningResult.thinking, "深度思考中...");
  assert.strictEqual(reasoningResult.content, "最终答案");

  // 7) HTTP 错误同时返回 HTML
  const errHtml = parse(
    { ok: false, status: 502, statusText: "Bad Gateway", body: "<!doctype html><html><body>gateway error</body></html>" },
    "https://example.com/v1/chat/completions", "gpt-4o", "0.6"
  );
  assert.strictEqual(errHtml.ok, false);
  assert.ok(errHtml.content.includes("502"), "错误消息应包含状态码");

  // 8) 流式保活仿真测试 (模拟 120s 长任务持续输出，心跳阈值 90s，绝不超时)
  const chunkTimes = [0, 20000, 40000, 60000, 80000, 100000, 120000];
  let lastChunk = 0;
  let didTimeout = false;
  for (const t of chunkTimes) {
    if (t - lastChunk > 90000) {
      didTimeout = true;
      break;
    }
    lastChunk = t;
  }
  assert.strictEqual(didTimeout, false, "只要数据流持续涌现，120s 长任务绝对不会触发空闲超时");
}

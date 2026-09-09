import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

/**
 * Seam 18: 主动打断流式生成与消息撤回修改状态机 TDD 测试套件
 */
export function runInteractionFeaturesTests() {
  process.stdout.write("\n═══ Seam 18: 主动打断流式生成与消息撤回修改状态机 ═══\n");

  const rootDir = process.cwd();

  function test(name, fn) {
    try {
      fn();
      process.stdout.write(`  ✅ [PASS] ${name}\n`);
    } catch (err) {
      process.stdout.write(`  ❌ [FAIL] ${name}\n`);
      process.stdout.write(`           → ${err.message}\n`);
      throw err;
    }
  }

  test("main.js: abort-llm-stream 管道与 activeLlmStreams 强行掐断连接机制完备", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    assert.ok(mainJs.includes("abort-llm-stream"), "main.js 必须注册 abort-llm-stream IPC 处理器");
    assert.ok(mainJs.includes("activeLlmStreams"), "main.js 必须维护活跃请求映射表 activeLlmStreams");
    assert.ok(mainJs.includes("req.destroy()"), "main.js 必须具备物理掐断底层的 req.destroy 逻辑");
  });

  test("preload.js: 安全隔离桥梁暴露 abortLlmStream 接口", () => {
    const preloadJs = fs.readFileSync(path.join(rootDir, "preload.js"), "utf8");
    assert.ok(preloadJs.includes("abortLlmStream:"), "preload.js 必须向渲染进程暴露 abortLlmStream 桥梁");
  });

  test("useSessions.ts: rollbackMessage 精准抹去该轮问答", () => {
    const sessionsHook = fs.readFileSync(path.join(rootDir, "src", "hooks", "useSessions.ts"), "utf8");
    assert.ok(sessionsHook.includes("rollbackMessage"), "useSessions 必须导出 rollbackMessage");
    assert.ok(sessionsHook.includes("splice(messageIndex"), "rollbackMessage 必须精准抹去该轮问答");
  });

  test("React 界面层: Composer 停止按钮与 ChatStream 撤回修改接线完备", () => {
    const appTsx = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    const composerTsx = fs.readFileSync(path.join(rootDir, "src", "components", "Composer", "Composer.tsx"), "utf8");
    const chatStreamTsx = fs.readFileSync(path.join(rootDir, "src", "components", "ChatStream", "ChatStream.tsx"), "utf8");
    assert.ok(appTsx.includes("handleStopGeneration"), "App.tsx 必须实现 handleStopGeneration");
    assert.ok(appTsx.includes("handleRevokeMessage"), "App.tsx 必须实现 handleRevokeMessage");
    assert.ok(composerTsx.includes("onStopGeneration"), "Composer 必须支持 onStopGeneration 回调");
    assert.ok(chatStreamTsx.includes("onRevokeMessage"), "ChatStream 必须支持 onRevokeMessage 回调");
    assert.ok(chatStreamTsx.includes("撤回修改"), "ChatStream 必须渲染撤回修改按钮");
  });

  test("React 界面层: Composer 支持文本/代码附件附加与发送拼装", () => {
    const composerTsx = fs.readFileSync(path.join(rootDir, "src", "components", "Composer", "Composer.tsx"), "utf8");
    assert.ok(composerTsx.includes("isTextAttachment"), "Composer 必须识别文本附件");
    assert.ok(composerTsx.includes("【附件文件:"), "发送时必须将文本附件拼入 prompt");
    assert.ok(composerTsx.includes("暂不支持"), "不支持的文件类型必须给出提示");
    assert.ok(composerTsx.includes("e.target.value = ''") || composerTsx.includes('e.target.value = ""'), "选完文件后必须清空 input 以便重复选择");
    assert.ok(composerTsx.includes("wrapAttachmentFence"), "附件内容必须用自适应 fence 包裹防打断");
    assert.ok(composerTsx.includes("hasNullByte"), "文本附件必须做 Null Byte 二进制嗅探");
    assert.ok(composerTsx.includes("isSensitiveAttachmentName"), "敏感文件名（如 .env）必须拦截");
    const extBlock = composerTsx.match(/TEXT_FILE_EXTS = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(extBlock, "必须定义 TEXT_FILE_EXTS");
    assert.ok(!extBlock[1].includes("'.env'") && !extBlock[1].includes('".env"'), "TEXT_FILE_EXTS 不得包含 .env");
  });
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runInteractionFeaturesTests();
}

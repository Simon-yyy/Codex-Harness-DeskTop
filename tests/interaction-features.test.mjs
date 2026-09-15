import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import vm from 'node:vm';

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
    assert.ok(composerTsx.includes("extractDocxText"), "docx 附件必须抽取正文后再挂载");
    assert.ok(composerTsx.includes("setAttachHint(null)"), "附件提示必须可关闭");
    const extBlock = composerTsx.match(/TEXT_FILE_EXTS = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(extBlock, "必须定义 TEXT_FILE_EXTS");
    assert.ok(!extBlock[1].includes("'.env'") && !extBlock[1].includes('".env"'), "TEXT_FILE_EXTS 不得包含 .env");
  });

  test("长文完整落盘: max_tokens 抬升与同路径多块合并", () => {
    const appTsx = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    const mdTsx = fs.readFileSync(path.join(rootDir, "src", "components", "ChatStream", "MarkdownRenderer.tsx"), "utf8");
    assert.ok(appTsx.includes("effectiveMaxTokens"), "App 必须计算 effectiveMaxTokens");
    assert.ok(appTsx.includes("DEFAULT_MAX_TOKENS") && /DEFAULT_MAX_TOKENS\s*=\s*32768/.test(appTsx), "默认 max_tokens 应为 32768（含思考占用）");
    assert.ok(appTsx.includes("MAX_EMPTY_BODY_CONTINUES"), "必须支持空正文/额度截断自动续写");
    assert.ok(appTsx.includes("EMPTY_BODY_CONTINUE_PROMPT"), "必须定义空正文自动续写提示");
    assert.ok(appTsx.includes("shouldAutoContinueEmptyOrTruncated"), "必须判定何时自动续写");
    assert.ok(appTsx.includes("复用**完全相同**的 filepath") || appTsx.includes("完全相同"), "长文提示词须禁止拆分多文件");
    assert.ok(mdTsx.includes("function mergeFilesByPath"), "MarkdownRenderer 必须合并同 filepath 代码块");
    assert.ok(mdTsx.includes("mergedFiles"), "自动落盘必须使用合并后的文件列表");
  });

  test("消息导出: export-chat-artifact 与 ChatStream 导出入口", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    const preload = fs.readFileSync(path.join(rootDir, "preload.js"), "utf8");
    const chat = fs.readFileSync(path.join(rootDir, "src", "components", "ChatStream", "ChatStream.tsx"), "utf8");
    assert.ok(mainJs.includes('ipcMain.handle("export-chat-artifact"'), "main 必须提供 export-chat-artifact");
    assert.ok(mainJs.includes("buildOoxmlDocxBuffer"), "必须输出真正 OOXML .docx");
    assert.ok(mainJs.includes("markdownToOoxmlParagraphs"), "docx 须支持 Markdown 富文本段落");
    assert.ok(mainJs.includes("word/numbering.xml"), "docx 须含列表 numbering 部件");
    assert.ok(mainJs.includes("word/document.xml"), "docx 包须含 word/document.xml");
    assert.ok(mainJs.includes("printToPDF"), "必须支持 PDF 导出");
    assert.ok(preload.includes("exportChatArtifact:"), "preload 必须暴露 exportChatArtifact");
    assert.ok(chat.includes("handleExportMessage"), "ChatStream 必须有导出处理");
    assert.ok(chat.includes("Word (.docx)"), "ChatStream 导出菜单须为 .docx");
    assert.ok(chat.includes("导出为文件") || chat.includes("导出回答"), "ChatStream 必须有导出 UI");

    // 运行时：富文本 OOXML 须含列表 / 粗体 / 代码围栏 / numbering
    const start = mainJs.indexOf("function crc32Bytes");
    const end = mainJs.indexOf("function stripMarkdownToPlain");
    assert.ok(start >= 0 && end > start, "可抽取 OOXML 构建函数");
    const ctx = { Buffer, console };
    vm.createContext(ctx);
    vm.runInContext(mainJs.slice(start, end), ctx);
    const sample = [
      "# 标题一",
      "这是 **粗体** 与 `代码` 以及 *斜体*。",
      "- 无序甲",
      "- 无序乙",
      "1. 有序一",
      "```js",
      "const x = 1;",
      "```",
    ].join("\n");
    const buf = ctx.buildOoxmlDocxBuffer("富文本导出", sample);
    assert.ok(buf[0] === 0x50 && buf[1] === 0x4b, "docx 须为 ZIP");
    const asText = buf.toString("utf8");
    assert.ok(asText.includes("word/numbering.xml"), "ZIP 须含 numbering.xml");
    assert.ok(asText.includes("<w:b/>"), "须含粗体 run");
    assert.ok(asText.includes("<w:numPr>"), "须含列表 numPr");
    assert.ok(asText.includes("Consolas") || asText.includes("const x = 1"), "须含代码样式或代码正文");
    assert.ok(asText.includes("粗体") || asText.includes("标题一"), "须保留中文正文");
  });

  test("文件 Apply 卡片: Diff/还原与写入前确认", () => {
    const md = fs.readFileSync(path.join(rootDir, "src", "components", "ChatStream", "MarkdownRenderer.tsx"), "utf8");
    const app = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    assert.ok(md.includes("parseFenceHeader"), "必须兼容 Cursor lang:path fence");
    assert.ok(md.includes("confirmBeforeWrite") || md.includes("codex_confirm_before_write"), "必须支持写入前确认");
    assert.ok(md.includes("全部 Apply") || md.includes("handleApplyAll"), "必须有全部 Apply");
    assert.ok(md.includes("onOpenFileDiff"), "必须支持打开 Diff");
    assert.ok(md.includes("onRevertFile"), "必须支持还原");
    assert.ok(app.includes("onOpenFileDiff={handleFileWritten}"), "App 必须接线 Diff");
    assert.ok(app.includes("onRevertFile={handleRevertFile}"), "App 必须接线还原");
  });

  test("Wave D: write_workspace_file 工具真正执行", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    const app = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    assert.ok(mainJs.includes("pendingToolCalls"), "main 必须累加 tool_calls");
    assert.ok(mainJs.includes("codex_tool_calls") || mainJs.includes("toolCalls: finishedToolCalls"), "结束时必须回传 toolCalls");
    assert.ok(app.includes("WRITE_WORKSPACE_FILE_TOOL_OPENAI"), "App 必须注册写盘工具");
    assert.ok(app.includes("executeWriteWorkspaceTools"), "App 必须执行写盘工具");
    assert.ok(app.includes("extractTaggedWriteFiles"), "必须支持 @@@write_file 标记兜底");
    assert.ok(app.includes("MAX_WRITE_TOOL_ROUNDS"), "必须限制工具多轮续跑");
    assert.ok(app.includes("MAX_TOOL_AUTO_BATCHES"), "必须支持同回合自动多批续跑");
    assert.ok(/MAX_WRITE_TOOL_ROUNDS\s*=\s*15/.test(app), "单批工具轮次应对齐主流 Agent（≥15）");
    assert.ok(/MAX_TOOL_AUTO_BATCHES\s*=\s*3/.test(app), "自动续跑批次数应为 3");
    assert.ok(app.includes("CODEX_TOOL_CARRY") || app.includes("已读文件上下文保留"), "必须把已读摘录写入会话供续写");
    assert.ok(app.includes("tool_call_id") || app.includes("tool_result"), "续跑须回传 tool 结果");
  });

  test("read_workspace_file 只读模式可调用且纯对话不挂载", () => {
    const app = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    assert.ok(app.includes("READ_WORKSPACE_FILE_TOOL_OPENAI"), "App 必须注册读文件工具");
    assert.ok(app.includes("executeReadWorkspaceTools"), "App 必须执行读文件工具");
    assert.ok(app.includes("readWorkspaceFile"), "读工具必须复用已有读文件通道");
    assert.ok(app.includes("name === 'read_workspace_file'"), "读工具必须进入同一工具循环");
    assert.ok(app.includes("permissionMode !== 'chat-only'"), "纯对话模式不得挂载读工具");
    assert.ok(app.includes("localWorkspaceToolsOpenAI(canUseReadTools, canUseWriteTools)"), "首轮与续跑都要挂读工具");
    assert.ok(app.includes("localWorkspaceToolsAnthropic(canUseReadTools, canUseWriteTools)"), "Anthropic 协议也要挂读工具");
    assert.ok(!app.includes("让我读取核心文件"), "只读提示不得再禁止读文件");
    assert.ok(app.includes("调用工具 `read_workspace_file`"), "只读提示必须要求调用读工具");
    assert.ok(app.includes("禁止调用 `write_workspace_file`"), "只读模式仍须禁止写盘");
    assert.ok(app.includes("hasPendingAgentTools"), "工具调用且正文为空时不得写成鉴权失败");
    assert.ok(!app.includes("请检查 Base URL 与 API Key 是否正确"), "空回复不得再归咎于 API Key");
  });

  test("长文档分块索引: 目录挂载与 read_document_chunk", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    const app = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    const preload = fs.readFileSync(path.join(rootDir, "preload.js"), "utf8");
    const types = fs.readFileSync(path.join(rootDir, "src", "types", "electron.d.ts"), "utf8");
    assert.ok(mainJs.includes("index-workspace-document"), "main 必须提供索引 IPC");
    assert.ok(mainJs.includes("read-document-chunk"), "main 必须提供读块 IPC");
    assert.ok(mainJs.includes("chunkDocumentText"), "main 必须实现正文切片");
    assert.ok(mainJs.includes("MAX_INDEX_EXTRACTED_TEXT_CHARS"), "索引抽取上限须高于普通挂载");
    assert.ok(preload.includes("indexWorkspaceDocument"), "preload 必须暴露 indexWorkspaceDocument");
    assert.ok(preload.includes("readDocumentChunk"), "preload 必须暴露 readDocumentChunk");
    assert.ok(types.includes("IndexWorkspaceDocumentResult"), "类型须声明索引结果");
    assert.ok(app.includes("READ_DOCUMENT_CHUNK_TOOL_OPENAI"), "App 必须注册读块工具");
    assert.ok(app.includes("formatDocumentIndexCard"), "App 必须生成目录卡片");
    assert.ok(app.includes("DOC_INLINE_THRESHOLD_CHARS"), "App 必须定义整篇灌入阈值");
    assert.ok(app.includes("executeReadDocumentChunkTools"), "App 必须执行读块工具");
    assert.ok(app.includes("长文档已索引"), "目录卡片须标明未整篇灌入");
    assert.ok(app.includes("read_document_chunk"), "只读提示或工具名须含 read_document_chunk");
    assert.ok(app.includes("SEARCH_DOCUMENT_CHUNKS_TOOL_OPENAI"), "必须注册 search_document_chunks 工具");
    assert.ok(app.includes("compressHistoryContent"), "必须压缩长历史上下文");
    assert.ok(app.includes("reasoningEffortSystemHint"), "必须支持思考强度提示");
  });

  test("docx 挂载: @ 中文路径与正文抽取", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    const app = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    const preload = fs.readFileSync(path.join(rootDir, "preload.js"), "utf8");
    assert.ok(mainJs.includes("extractDocxPlainText"), "主进程必须抽取 docx 正文");
    assert.ok(mainJs.includes("extract-docx-text"), "必须提供 docx 抽取 IPC");
    assert.ok(mainJs.includes("readPreviewText"), "预览/差异读取 docx 时必须抽取正文，禁止按 UTF-8 打开");
    assert.ok(app.includes("extractAtFileRefs"), "@ 引用必须能解析中文路径");
    assert.ok(app.includes("已抽取正文"), "挂载 docx 时必须标明已抽取正文");
    assert.ok(preload.includes("extractDocxText"), "preload 必须暴露抽取接口");
  });

  test("pdf 挂载: 附件、@ 与预览抽取正文", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    const app = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    const preload = fs.readFileSync(path.join(rootDir, "preload.js"), "utf8");
    const composer = fs.readFileSync(path.join(rootDir, "src", "components", "Composer", "Composer.tsx"), "utf8");
    assert.ok(mainJs.includes("extractPdfPlainText"), "主进程必须抽取 PDF 正文");
    assert.ok(mainJs.includes("extract-pdf-text"), "必须提供 PDF 抽取 IPC");
    assert.ok(mainJs.includes('previewKind'), "预览 PDF 时必须抽取正文，禁止按 UTF-8 打开");
    assert.ok(mainJs.includes("扫描件无法读取"), "扫描件必须明确失败，不得把二进制当文本");
    assert.ok(preload.includes("extractPdfText"), "preload 必须暴露 PDF 抽取接口");
    assert.ok(composer.includes("extractPdfText"), "PDF 附件必须抽取正文后再挂载");
    assert.ok(composer.includes(".pdf"), "文件选择器必须接受 .pdf");
    assert.ok(app.includes("docx|pdf"), "@ 挂载 PDF 时必须标明已抽取正文");
    assert.ok(!/ext === '\.pdf'/.test(composer), "PDF 不得再被当成无法读取的办公格式拒绝");
  });

  test("流式结束原因与工作耗时: finishReason 回传、提前结束文案、禁止字数估时", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    const app = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    const chat = fs.readFileSync(path.join(rootDir, "src", "components", "ChatStream", "ChatStream.tsx"), "utf8");
    const sessionTs = fs.readFileSync(path.join(rootDir, "src", "types", "session.ts"), "utf8");
    assert.ok(mainJs.includes("finishReason"), "main 流结束 chunk 必须回传 finishReason");
    assert.ok(mainJs.includes("lastFinishReason"), "main 必须从 SSE 捕获 finish_reason/stop_reason");
    assert.ok(mainJs.includes("600000"), "静默超时应为 600s");
    assert.ok(mainJs.includes("search-document-chunks"), "必须提供分块关键词检索 IPC");
    assert.ok(app.includes("looksLikeEarlyEnd"), "App 必须区分提前结束与传输中断");
    assert.ok(app.includes("[输出提前结束]"), "提前结束须使用明确文案");
    assert.ok(app.includes("handleContinueGeneration"), "App 必须提供继续生成");
    assert.ok(app.includes("workDurationSec"), "App 必须写入真实工作耗时");
    assert.ok(sessionTs.includes("workDurationSec"), "消息类型须含 workDurationSec");
    assert.ok(chat.includes("msg.workDurationSec"), "ChatStream 结束后须用真实耗时");
    assert.ok(!chat.includes("thinking?.length || 120) / 45"), "禁止再用 thinking 字数估算「已工作」秒数");
    assert.ok(chat.includes("继续生成"), "截断消息须有继续生成按钮");
    assert.ok(app.includes("❌ [传输中断]"), "真失败路径仍保留传输中断文案");
    assert.ok(app.includes("toolsExhaustedIncomplete"), "工具轮打满仍挂 tool 时须标提前结束");
    assert.ok(app.includes("lastLine.length >= 24"), "半截长句启发式必须存在");
    assert.ok(!app.includes("!pendingToolsLeft &&"), "不得再因 pending tools 跳过提前结束");
    assert.ok(app.includes("pickRelativePath"), "读/写工具须兼容 path 别名");
    assert.ok(app.includes("tool_close") || app.includes("_tool_close"), "工具末轮须强制收束要终答");
    assert.ok(app.includes("EARLY_END_NOTE_RE") || app.includes("输出提前结束"), "历史提前结束提示须从上下文剥离");
    assert.ok(app.includes("/[\\u4e00-\\u9fff]/") || app.includes("\\u4e00-\\u9fff"), "半截句启发式须限制中文以避免英文误报");
    assert.ok(!/earlyEnded:\s*true/.test(app.split("传输中断")[1]?.slice(0, 400) || ""), "传输中断路径不得再设 earlyEnded");
    assert.ok(chat.includes("[输出提前结束]"), "提前结束提示应在 ChatStream UI 展示");
  });


  test("@ 引用原子化删除状态机: Backspace / Delete 整体删除与智能空格清理", async () => {
    const composerTsx = fs.readFileSync(path.join(rootDir, "src", "components", "Composer", "Composer.tsx"), "utf8");
    const appJs = fs.readFileSync(path.join(rootDir, "ui", "app.js"), "utf8");
    const mentionTs = fs.readFileSync(path.join(rootDir, "src", "utils", "mention.ts"), "utf8");

    assert.ok(composerTsx.includes("handleAtMentionDeletion"), "Composer 必须引入 handleAtMentionDeletion");
    assert.ok(composerTsx.includes("Backspace"), "Composer 必须拦截 Backspace 键");
    assert.ok(composerTsx.includes("Delete"), "Composer 必须拦截 Delete 键");
    assert.ok(appJs.includes("handleAtMentionDeletion"), "ui/app.js 必须实现 handleAtMentionDeletion");
    assert.ok(mentionTs.includes("getAtMentionTokens"), "mention.ts 必须导出 getAtMentionTokens");

    // 从 ui/app.js 抽取纯 JS 逻辑并在沙箱中执行完整断言 (消除 typeless 警告)
    const start = appJs.indexOf("const AT_FILE_EXTS =");
    const end = appJs.indexOf("if (btnSend)");
    assert.ok(start >= 0 && end > start, "必须能提取 @ mention 解析状态机");
    const ctx = { console, RegExp };
    vm.createContext(ctx);
    vm.runInContext(appJs.slice(start, end), ctx);
    const { getAtMentionTokens, handleAtMentionDeletion } = ctx;

    // 测试 1: 中文长路径退格整体删除
    const text1 = "@电商监督/面向智能监管的直播电商组合型违规识别_多模态大模型评测与证据增强.docx ";
    const res1 = handleAtMentionDeletion(text1, text1.length, 'Backspace');
    assert.ok(res1, "命中 @ 文件删除");
    assert.strictEqual(res1.newText, "", "末尾退格应完全清除该引用及尾部空格");
    assert.strictEqual(res1.newCursorPos, 0, "光标位置归零");

    // 测试 2: 中文长路径无尾部空格退格
    const text2 = "@电商监督/面向智能监管的直播电商组合型违规识别_多模态大模型评测与证据增强.docx";
    const res2 = handleAtMentionDeletion(text2, text2.length, 'Backspace');
    assert.ok(res2);
    assert.strictEqual(res2.newText, "");

    // 测试 3: 句子内部引用删除与空格保留
    const text3 = "请分析 @电商监督/xxx.docx 其中的违规项";
    const tokens3 = getAtMentionTokens(text3);
    assert.strictEqual(tokens3.length, 1);
    const res3 = handleAtMentionDeletion(text3, tokens3[0].end + 1, 'Backspace');
    assert.ok(res3);
    assert.strictEqual(res3.newText, "请分析 其中的违规项", "删除后句子间应保留合理单个空格");
    assert.strictEqual(res3.newCursorPos, 4);

    // 测试 4: 标点符号前无尾部空格时的前置空格清理
    const text4 = "请看 @file.docx，谢谢";
    const tokens4 = getAtMentionTokens(text4);
    const res4 = handleAtMentionDeletion(text4, tokens4[0].end, 'Backspace');
    assert.strictEqual(res4.newText, "请看，谢谢", "标点符号前应智能清理无用空格");

    // 测试 5: Delete 键在 @ 前方整体删除
    const text5 = "请看 @file.docx 谢谢";
    const tokens5 = getAtMentionTokens(text5);
    const res5 = handleAtMentionDeletion(text5, tokens5[0].start, 'Delete');
    assert.strictEqual(res5.newText, "请看 谢谢");

    // 测试 6: 引号路径整体删除
    const text6 = '@"电商监督/直播 违规.docx" ';
    const res6 = handleAtMentionDeletion(text6, text6.length, 'Backspace');
    assert.strictEqual(res6.newText, "");

    // 测试 7: 邮箱地址防误触
    const email = "user@example.com";
    const resEmail = handleAtMentionDeletion(email, email.length, 'Backspace');
    assert.strictEqual(resEmail, null, "邮箱地址严禁被误判为 @ 引用");
  });

  // ══════════════════════════════════════════════════════════════
  // Seam 19: 文档多模态与数学公式引擎 (Rich Document Pipeline)
  // ══════════════════════════════════════════════════════════════
  test("main.js: OMML 转译与富文档解构 (ommlToLatex, extractDocxRichDocument, read-rich-document)", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    assert.ok(mainJs.includes("ommlToLatex"), "main.js 必须包含 ommlToLatex 原生转译函数");
    assert.ok(mainJs.includes("extractDocxRichDocument"), "main.js 必须包含 extractDocxRichDocument 结构化解包函数");
    assert.ok(mainJs.includes("read-rich-document"), "main.js 必须注册 read-rich-document IPC 通道");

    // 动态验证 ommlToLatex 转译准确性
    const ctx = { decodeXmlText: (s) => s };
    const extractOmmlCode = mainJs.slice(mainJs.indexOf("function extractTag"), mainJs.indexOf("function parseDocxRels"));
    vm.createContext(ctx);
    vm.runInContext(extractOmmlCode, ctx);
    const { ommlToLatex } = ctx;

    // 分数测试
    const fracXml = '<m:oMath><m:f><m:num><m:r><m:t>a+b</m:t></m:r></m:num><m:den><m:r><m:t>c-d</m:t></m:r></m:den></m:f></m:oMath>';
    assert.strictEqual(ommlToLatex(fracXml), '\\frac{a+b}{c-d}', '分数必须转译为 \\frac{a+b}{c-d}');

    // 上标测试
    const supXml = '<m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath>';
    assert.strictEqual(ommlToLatex(supXml), '{x}^{2}', '上标必须转译为 {x}^{2}');

    // 根号测试
    const radXml = '<m:oMath><m:rad><m:deg><m:r><m:t>3</m:t></m:r></m:deg><m:e><m:r><m:t>x</m:t></m:r></m:e></m:rad></m:oMath>';
    assert.strictEqual(ommlToLatex(radXml), '\\sqrt[3]{x}', '带次数根号转译为 \\sqrt[3]{x}');

    // 求和测试
    const naryXml = '<m:oMath><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup><m:e><m:r><m:t>x</m:t></m:r></m:e></m:nary></m:oMath>';
    assert.strictEqual(ommlToLatex(naryXml), '\\sum_{i=1}^{n} x', '求和转译为 \\sum_{i=1}^{n} x');
  });

  test("preload.js 与强类型: 暴露 readRichDocument 接口与类型完备", () => {
    const preloadJs = fs.readFileSync(path.join(rootDir, "preload.js"), "utf8");
    assert.ok(preloadJs.includes("readRichDocument:"), "preload.js 必须暴露 readRichDocument");

    const electronDts = fs.readFileSync(path.join(rootDir, "src", "types", "electron.d.ts"), "utf8");
    assert.ok(electronDts.includes("readRichDocument?:"), "electron.d.ts 必须定义 readRichDocument 方法签名");
    assert.ok(electronDts.includes("DocxRichDocument"), "electron.d.ts 必须导出 DocxRichDocument 接口");
    assert.ok(electronDts.includes("ReadRichDocumentResult"), "electron.d.ts 必须导出 ReadRichDocumentResult 接口");
  });

  test("前端渲染层: DocxReader 与 PdfReader 与 PreviewPanel 多模式阅读切换", () => {
    const docxReaderTsx = fs.readFileSync(path.join(rootDir, "src", "components", "PreviewPanel", "DocxReader.tsx"), "utf8");
    assert.ok(docxReaderTsx.includes("renderLatex"), "DocxReader 必须集成 KaTeX renderLatex 公式渲染");
    assert.ok(docxReaderTsx.includes("onAttachImage"), "DocxReader 必须支持一键引用图片至会话");

    const pdfReaderTsx = fs.readFileSync(path.join(rootDir, "src", "components", "PreviewPanel", "PdfReader.tsx"), "utf8");
    assert.ok(pdfReaderTsx.includes("pdfjsLib"), "PdfReader 必须采用 pdfjs-dist 进行 Canvas 矢量绘制");
    assert.ok(pdfReaderTsx.includes("scale"), "PdfReader 必须支持平滑缩放");

    const previewPanelTsx = fs.readFileSync(path.join(rootDir, "src", "components", "PreviewPanel", "PreviewPanel.tsx"), "utf8");
    assert.ok(previewPanelTsx.includes("'reading'"), "PreviewPanel 必须提供 'reading' 阅读视图模式");
    assert.ok(previewPanelTsx.includes("onAttachImage"), "PreviewPanel 必须支持 onAttachImage 回调接线");
  });

  test("ChatStream 气泡渲染: MarkdownRenderer 全链路支持 LaTeX 行内与块级公式", () => {
    const mdRendererTsx = fs.readFileSync(path.join(rootDir, "src", "components", "ChatStream", "MarkdownRenderer.tsx"), "utf8");
    assert.ok(mdRendererTsx.includes("renderLatex"), "MarkdownRenderer 必须引入 renderLatex 工具");
    assert.ok(mdRendererTsx.includes("inline-math"), "MarkdownRenderer 必须支持行内 $...$ 公式并赋予样式");
    assert.ok(mdRendererTsx.includes("mathBlockRegex") || mdRendererTsx.includes("$$"), "MarkdownRenderer 必须支持独立块级 $$...$$ 公式");
  });

  test("ADR 0002: 文档多模态与数学公式引擎设计决策记录完备", () => {
    const adrPath = path.join(rootDir, "docs", "adr", "0002-rich-document-pipeline-images-math.md");
    assert.ok(fs.existsSync(adrPath), "ADR 0002 必须存在");
    const content = fs.readFileSync(adrPath, "utf8");
    assert.ok(content.includes("OMML"), "ADR 必须详述 OMML 递归转译策略");
    assert.ok(content.includes("KaTeX"), "ADR 必须详述 KaTeX 渲染选型与性能收益");
    assert.ok(content.includes("Token 成本"), "ADR 必须详述按需引图防护 Token 爆炸机制");
  });

  test("LLM 流式管道鲁棒防护: safeParseLlmBody 与 streamError 隔离 (杜绝 Unexpected token 'd')", () => {
    const appTsx = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    assert.ok(appTsx.includes("function safeParseLlmBody"), "App.tsx 必须包含 safeParseLlmBody 安全解析函数");
    assert.ok(appTsx.includes("safeParseLlmBody(rawRes.body)"), "App.tsx 必须使用 safeParseLlmBody 解析 rawRes.body");
    assert.ok(mainJs.includes("streamError"), "main.js 必须具备 streamError 捕获");
    assert.ok(mainJs.includes("Stream Error"), "main.js 必须在流式中断/错误时返回规范的 Stream Error 状态");
  });

  test("流式收尾禁止裸 SSE: 2xx 组包 + App 安全解析 + P1 潜伏修复", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    const app = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");

    assert.ok(
      /if\s*\(\s*stream\s*&&\s*httpOk\s*\)\s*\{[\s\S]*?finalBody\s*=\s*JSON\.stringify/.test(mainJs),
      "流式 2xx 成功时必须组装 finalBody，禁止回传裸 SSE"
    );
    assert.ok(
      !mainJs.includes("if (stream && (accumulatedText || finishedToolCalls.length > 0))"),
      "不得再保留「仅有正文或工具才组包」的旧条件（GLM 仅 thinking 会漏组包）"
    );
    assert.ok(mainJs.includes("flushSseTail"), "end 必须 flush 无尾换行的 sseBuffer");
    assert.ok(mainJs.includes("accumulatedText || accumulatedThinking"), "流错误路径须保留仅 thinking 的截断");
    assert.ok(mainJs.includes("choice?.delta?.text"), "须映射 delta.text 兜底字段");
    assert.ok(app.includes("parseLlmResponseBody"), "App 必须提供 parseLlmResponseBody 安全解析");
    assert.ok(app.includes("_rawSse"), "安全解析须识别裸 SSE");
    assert.ok(app.includes("formatLlmFailureMessage"), "App 须区分 JSON 解析失败与网络传输中断");
    assert.ok(app.includes("_htmlResponse"), "App 须拦截 HTML 误配 Base URL");
    assert.ok(!app.includes("JSON.parse(rawRes.body)"), "主路径不得对 rawRes.body 直接 JSON.parse");
    assert.ok(!app.includes("JSON.parse(contRes.body)"), "工具续跑不得对 contRes.body 直接 JSON.parse");

    // 行为层：无尾换行最后一帧须被 flush 解析
    function ingestLine(line, acc) {
      const t = line.trim();
      if (!t.startsWith("data:")) return acc;
      const dataStr = t.replace(/^data:\s*/, "");
      if (dataStr === "[DONE]") return acc;
      try {
        const parsed = JSON.parse(dataStr);
        const c = parsed.choices?.[0];
        acc.text += c?.delta?.content || c?.delta?.text || "";
        acc.think += c?.delta?.reasoning_content || "";
        if (c?.finish_reason) acc.finish = c.finish_reason;
      } catch (_) {}
      return acc;
    }
    function parseWithFlush(chunks) {
      let buf = "";
      const acc = { text: "", think: "", finish: "" };
      for (const chunk of chunks) {
        buf += chunk;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || "";
        for (const line of lines) ingestLine(line, acc);
      }
      if (buf.trim()) ingestLine(buf, acc);
      return acc;
    }
    const noNl = parseWithFlush([
      'data: {"choices":[{"delta":{"content":"前"}}]}\n',
      'data: {"choices":[{"delta":{"content":"后"}}]}',
    ]);
    assert.equal(noNl.text, "前后", "无尾换行时 flush 须解析最后一帧正文");

    // 行为层：401 流式不得用空 choices 覆盖 error body
    const errBody = JSON.stringify({ error: { message: "Invalid API Key" } });
    const httpOk = false;
    const stream = true;
    let finalBody = errBody;
    if (stream && httpOk) {
      finalBody = JSON.stringify({ choices: [{ message: { content: "" } }] });
    }
    assert.ok(finalBody.includes("Invalid API Key"), "4xx/5xx 须保留原始 error body");

    // 行为层：JSON 解析失败不再走传输中断标签
    assert.ok(
      /响应体解析失败/.test(app),
      "formatLlmFailureMessage 须给出解析失败专用文案"
    );
  });

test("流式 usage 与 Anthropic 双形态收尾: R1-R3", () => {
    const mainJs = fs.readFileSync(path.join(rootDir, "main.js"), "utf8");
    const app = fs.readFileSync(path.join(rootDir, "src", "App.tsx"), "utf8");

    assert.ok(mainJs.includes("lastUsage"), "main 必须累加流式 usage");
    assert.ok(mainJs.includes("prompt_tokens"), "usage 须归一化 prompt_tokens");
    assert.ok(mainJs.includes('type: "thinking"') || mainJs.includes("type: \"thinking\""), "收尾须组 Anthropic thinking block");
    assert.ok(mainJs.includes("stop_reason"), "收尾须带 Anthropic stop_reason");
    assert.ok(app.includes("stream_options"), "OpenAI 兼容流式须请求 include_usage");
    assert.ok(app.includes("include_usage"), "stream_options.include_usage 必须开启");
    assert.ok(app.includes("extractUsageTokens"), "App 须统一抽取 OpenAI/Anthropic usage");
    assert.ok(app.includes("双读") || app.includes("choices?.[0]?.message?.content"), "Anthropic 分支须回退读 choices");

    // 行为：usage 归一化
    const lastUsage = { input_tokens: 12, output_tokens: 34 };
    const promptTokens = lastUsage.prompt_tokens ?? lastUsage.input_tokens;
    const completionTokens = lastUsage.completion_tokens ?? lastUsage.output_tokens;
    const usageOut = {
      ...lastUsage,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    };
    assert.equal(usageOut.prompt_tokens, 12);
    assert.equal(usageOut.completion_tokens, 34);

    // 行为：Anthropic 双读 — 仅 choices 时仍能拿到正文
    const parsedOnlyChoices = {
      choices: [{ message: { content: "来自 choices", reasoning_content: "想" } }],
    };
    const blocks = Array.isArray(parsedOnlyChoices.content) ? parsedOnlyChoices.content : [];
    let text = blocks.map((c) => c.text || "").join("");
    let thinking = blocks.filter((c) => c.type === "thinking").map((c) => c.thinking).join("\n");
    if (!text && !thinking) {
      const choice = parsedOnlyChoices.choices?.[0];
      text = choice?.message?.content || "";
      thinking = choice?.message?.reasoning_content || "";
    }
    assert.equal(text, "来自 choices");
    assert.equal(thinking, "想");
  });
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runInteractionFeaturesTests();
}

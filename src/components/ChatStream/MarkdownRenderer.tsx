import React, { useState, useEffect, useRef } from 'react';
import {
  Copy, Check, FileDown, Loader2, CheckCircle, AlertCircle, FileCode,
  Edit3, Zap, ChevronDown, ChevronUp, Layers, CheckCheck, FileText, BookOpen
} from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  permissionMode?: string;
  workspaceDir?: string | null;
  onFileWritten?: (filePath: string) => void;
  isStreaming?: boolean;
}

interface DetectedCodeItem {
  index: number;
  language: string;
  filePath: string;
  code: string;
}

// 智能探测代码中包含的目标文件路径 (支持连字符、下划线、多级路径与扩展名)
function detectFilePath(code: string): string | null {
  const lines = code.split('\n').slice(0, 5);
  for (const raw of lines) {
    const line = raw.trim();
    // 形式 1: // filepath: docs/DISTRIBUTION-AUDIT.md 或 <!-- filepath: src/components/App-Header.tsx -->
    const m1 = line.match(/^(?:\/\/|#|\/\*|<!--)\s*(?:filepath|file|path|文件路径|路径|目标文件|target)\s*[:=]\s*([a-zA-Z0-9_\-./\\]+)/i);
    if (m1 && m1[1]) {
      const clean = m1[1].replace(/^[./\\]+/, '').trim();
      if (clean) return clean;
    }
    // 形式 2: // src/components/Header.tsx 或 # scripts/build-app.mjs 或 // docs/DISTRIBUTION-AUDIT.md
    const m2 = line.match(/^(?:\/\/|#)\s*([a-zA-Z0-9_\-./\\]+\.(?:[a-zA-Z0-9]{1,10}))$/);
    if (m2 && m2[1] && !m2[1].includes('http')) return m2[1].replace(/^[./\\]+/, '').trim();
  }
  return null;
}

// 智能探测长篇技术文档/审查报告标题并推导工作区落盘路径
function detectDocumentReportInfo(content: string): { title: string; suggestedPath: string } | null {
  if (!content || content.length < 280) return null;
  const lines = content.split('\n');
  for (const raw of lines.slice(0, 10)) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('# ')) {
      const title = trimmed.replace(/^#+\s*/, '').replace(/[*`_]/g, '').trim();
      if (title.length >= 2) {
        const safeFileName = title
          .replace(/[\\/:*?"<>|]/g, '-')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
        return {
          title,
          suggestedPath: `docs/${safeFileName}.md`,
        };
      }
    }
  }
  return null;
}

// 清洗写入代码（剔除首行 filepath 标注，保持源码纯净）
function cleanCodeForWriting(code: string): string {
  const lines = code.split('\n');
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (/^(?:\/\/|#|\/\*|<!--)\s*(?:filepath|file|path|文件路径|路径|目标文件|target)\s*[:=]/i.test(firstLine)) {
      return lines.slice(1).join('\n');
    }
  }
  return code;
}

// 独立代码块组件 (支持一键复制代码与一键安全写入本地文件)
const CodeBlock: React.FC<{
  language: string;
  code: string;
  permissionMode?: string;
  workspaceDir?: string | null;
  onFileWritten?: (filePath: string) => void;
  isAppliedGlobally?: boolean;
}> = ({ language, code, permissionMode, workspaceDir, onFileWritten, isAppliedGlobally }) => {
  const [copied, setCopied] = useState(false);
  const detectedPath = detectFilePath(code);
  const [customPath, setCustomPath] = useState<string>(detectedPath || '');
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [writeResult, setWriteResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWriteToFile = async () => {
    const targetPath = (customPath || detectedPath || '').trim();
    if (!targetPath) {
      setIsEditingPath(true);
      return;
    }

    if (!window.codexDesktop?.writeWorkspaceFile) {
      setWriteResult({ ok: false, msg: '当前客户端环境不支持写文件接口' });
      return;
    }

    // 检查权限：支持 workspace-readwrite 与 full-access
    const isWritable = permissionMode === 'workspace-readwrite' || permissionMode === 'full-access';
    if (!isWritable) {
      setWriteResult({ ok: false, msg: '当前为只读模式，请在下方切换为【工作区读写】' });
      setTimeout(() => setWriteResult(null), 3500);
      return;
    }

    setIsWriting(true);
    setWriteResult(null);

    try {
      const res = await window.codexDesktop.writeWorkspaceFile({
        relativePath: targetPath,
        content: cleanCodeForWriting(code),
        createBackup: true
      });

      if (res && res.ok) {
        setWriteResult({ ok: true, msg: `已写入 (备份 .bak)` });
        if (onFileWritten) onFileWritten(targetPath);
        setTimeout(() => setWriteResult(null), 3000);
      } else {
        setWriteResult({ ok: false, msg: res?.reason || '写入失败' });
        setTimeout(() => setWriteResult(null), 4000);
      }
    } catch (err: any) {
      setWriteResult({ ok: false, msg: err.message || '写入异常' });
      setTimeout(() => setWriteResult(null), 4000);
    } finally {
      setIsWriting(false);
    }
  };

  // 格式化语言名称显示 (如 powershell -> PowerShell)
  const formatLang = (lang: string) => {
    if (!lang) return 'Code';
    const lower = lang.toLowerCase();
    if (lower === 'powershell') return 'PowerShell';
    if (lower === 'javascript' || lower === 'js') return 'JavaScript';
    if (lower === 'typescript' || lower === 'ts') return 'TypeScript';
    if (lower === 'python' || lower === 'py') return 'Python';
    if (lower === 'bash' || lower === 'sh') return 'Bash';
    if (lower === 'json') return 'JSON';
    if (lower === 'html') return 'HTML';
    if (lower === 'css') return 'CSS';
    if (lower === 'sql') return 'SQL';
    if (lower === 'java') return 'Java';
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  };

  const isWritableMode = permissionMode === 'workspace-readwrite' || permissionMode === 'full-access';
  const hasApplied = isAppliedGlobally || writeResult?.ok;

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#27272a] bg-[#18181b] shadow-xs transition-all">
      {/* 顶部标头栏 */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#202023] border-b border-[#2e2e33] text-[11px] text-[#a1a1aa] select-none gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono font-semibold text-xs text-[#d4d4d8] shrink-0">{formatLang(language)}</span>

          {/* 文件路径标签 / 自定义路径输入 */}
          {isEditingPath ? (
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingPath(false);
                  if (e.key === 'Escape') setIsEditingPath(false);
                }}
                placeholder="输入相对路径 (如 src/App.tsx)..."
                autoFocus
                className="text-[10px] font-mono px-1.5 py-0.5 bg-[#18181b] border border-accent rounded text-white outline-none w-full max-w-[200px]"
              />
              <button
                type="button"
                onClick={() => setIsEditingPath(false)}
                className="text-[10px] text-accent hover:underline shrink-0"
              >
                确定
              </button>
            </div>
          ) : (customPath || detectedPath) ? (
            <div
              onClick={() => setIsEditingPath(true)}
              className="flex items-center gap-1 text-[10px] font-mono text-text-muted hover:text-white truncate cursor-pointer py-0.5 px-1 rounded hover:bg-[#2a2a2e] transition-colors"
              title="点击修改目标文件相对路径"
            >
              <FileCode size={11} className="text-accent shrink-0" />
              <span className="truncate">{customPath || detectedPath}</span>
              <Edit3 size={10} className="text-text-muted shrink-0 opacity-0 group-hover:opacity-100" />
            </div>
          ) : null}
        </div>

        {/* 右侧操作按钮组：一键写入本地文件 + 一键复制代码 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 写入本地文件按钮 */}
          {(customPath || detectedPath || isWritableMode) && (
            <button
              type="button"
              onClick={handleWriteToFile}
              disabled={isWriting}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                hasApplied
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : writeResult?.ok === false
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : isWritableMode
                  ? 'bg-accent/15 hover:bg-accent text-accent hover:text-white border border-accent/30 active:scale-95'
                  : 'hover:bg-[#2e2e33] text-text-muted hover:text-text-primary'
              }`}
              title={
                hasApplied
                  ? '该文件已成功写入磁盘并生成备份副本'
                  : !isWritableMode
                  ? '当前处于只读模式，请先在下方切换为【工作区读写】'
                  : customPath || detectedPath
                  ? `点击直接将代码写入: ${customPath || detectedPath}`
                  : '指定文件相对路径后直接写入工程'
              }
            >
              {isWriting ? (
                <>
                  <Loader2 size={11} className="animate-spin text-accent" />
                  <span>写入中...</span>
                </>
              ) : hasApplied ? (
                <>
                  <CheckCircle size={11} />
                  <span>{writeResult?.msg || '已写入 (.bak)'}</span>
                </>
              ) : writeResult?.ok === false ? (
                <>
                  <AlertCircle size={11} />
                  <span className="truncate max-w-[140px]">{writeResult.msg}</span>
                </>
              ) : (
                <>
                  <FileDown size={11} />
                  <span>{customPath || detectedPath ? '写入文件' : '写入...'}</span>
                </>
              )}
            </button>
          )}

          {/* 复制代码按钮 */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#2e2e33] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer text-[11px] font-medium"
            title="复制代码内容"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            <span className={copied ? 'text-emerald-400 font-medium' : ''}>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>

      {/* 代码内容主体：等宽字体、水平自由滚动防折断 */}
      <pre className="p-3.5 overflow-x-auto font-mono leading-relaxed text-[#e4e4e7] bg-[#18181b] select-text">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// 行内语法解析器：处理 `code` 与 **bold**
function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(regex);

  parts.forEach((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      tokens.push(
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent font-mono text-[11px] font-medium select-text"
        >
          {part.slice(1, -1)}
        </code>
      );
    } else if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      tokens.push(
        <strong key={i} className="font-semibold text-text-primary">
          {renderInline(part.slice(2, -2))}
        </strong>
      );
    } else if (part) {
      tokens.push(part);
    }
  });

  return tokens;
}

// 行段落解析器：处理标题、列表、引用、分割线等块级排版
function renderParagraphBlock(text: string, blockKey: string | number): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      elements.push(<div key={`${blockKey}_empty_${i}`} className="h-2" />);
      continue;
    }

    // 1. 分割线
    if (/^(\*\*\*|---|___)$/.test(line)) {
      elements.push(<hr key={`${blockKey}_hr_${i}`} className="my-3 border-border/50" />);
      continue;
    }

    // 2. 标题阶梯
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`${blockKey}_h1_${i}`} className="text-sm font-bold text-text-primary mt-3.5 mb-1.5 pb-1 border-b border-border/40">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`${blockKey}_h2_${i}`} className="text-xs font-bold text-text-primary mt-3 mb-1">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`${blockKey}_h3_${i}`} className="text-xs font-semibold text-text-primary mt-2.5 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={`${blockKey}_h4_${i}`} className="text-xs font-medium text-text-secondary mt-2 mb-0.5">
          {renderInline(line.slice(5))}
        </h4>
      );
      continue;
    }

    // 3. 引用块
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={`${blockKey}_quote_${i}`} className="border-l-2 border-accent/70 pl-3 py-1 my-1.5 bg-accent/5 rounded-r text-text-muted text-xs leading-relaxed">
          {renderInline(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // 4. 无序列表 (- 或 * 开头)
    if (/^[-*]\s+/.test(line)) {
      const listContent = line.replace(/^[-*]\s+/, '');
      elements.push(
        <div key={`${blockKey}_ul_${i}`} className="flex items-start gap-2 ml-1 my-0.5 text-xs text-text-primary leading-relaxed">
          <span className="text-accent text-[9px] mt-1 shrink-0">●</span>
          <div className="flex-1">{renderInline(listContent)}</div>
        </div>
      );
      continue;
    }

    // 5. 有序列表 (数字. 开头)
    const orderMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderMatch) {
      const num = orderMatch[1];
      const listContent = orderMatch[2];
      elements.push(
        <div key={`${blockKey}_ol_${i}`} className="flex items-start gap-1.5 ml-1 my-0.5 text-xs text-text-primary leading-relaxed">
          <span className="font-semibold text-accent shrink-0 text-xs">{num}.</span>
          <div className="flex-1">{renderInline(listContent)}</div>
        </div>
      );
      continue;
    }

    // 6. 普通正文行
    elements.push(
      <div key={`${blockKey}_p_${i}`} className="text-xs text-text-primary leading-relaxed break-words select-text">
        {renderInline(rawLine)}
      </div>
    );
  }

  return <div key={blockKey} className="space-y-1">{elements}</div>;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  permissionMode,
  workspaceDir,
  onFileWritten,
  isStreaming = false
}) => {
  if (!content) return null;

  // 1. 全文解析所有代码块与关联文件
  const detectedFiles: DetectedCodeItem[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)(?:```|$)/g;
  let m: RegExpExecArray | null;
  while ((m = codeBlockRegex.exec(content)) !== null) {
    const language = m[1] || '';
    const code = m[2] ? m[2].replace(/\n$/, '') : '';
    const filePath = detectFilePath(code);
    if (filePath) {
      detectedFiles.push({
        index: m.index,
        language,
        filePath,
        code
      });
    }
  }

  // 2. 批量状态追踪
  const [appliedPaths, setAppliedPaths] = useState<Set<string>>(new Set());
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [isFilesExpanded, setIsFilesExpanded] = useState(false);
  // 默认开启自动写盘！只要用户在下方选了【工作区读写】，AI 输出代码时默认直接落盘
  const [autoApplyEnabled, setAutoApplyEnabled] = useState<boolean>(() => {
    return localStorage.getItem('codex_auto_apply_changes') !== 'false';
  });

  const autoAppliedRef = useRef(false);
  const isWritableMode = permissionMode === 'workspace-readwrite' || permissionMode === 'full-access';

  // 识别长篇文档/审查报告
  const docReport = detectedFiles.length === 0 ? detectDocumentReportInfo(content) : null;
  const [docSaved, setDocSaved] = useState(false);
  const [isSavingDoc, setIsSavingDoc] = useState(false);

  const handleSaveDocToWorkspace = async () => {
    if (!docReport || isSavingDoc) return;
    if (!isWritableMode) {
      alert('当前处于只读模式，请先在界面下方切换为【工作区读写】后再保存！');
      return;
    }
    if (!window.codexDesktop?.writeWorkspaceFile) {
      alert('当前客户端环境不支持写文件通道');
      return;
    }

    setIsSavingDoc(true);
    try {
      const res = await window.codexDesktop.writeWorkspaceFile({
        relativePath: docReport.suggestedPath,
        content: content,
        createBackup: true
      });
      if (res && res.ok) {
        setDocSaved(true);
        if (onFileWritten) onFileWritten(docReport.suggestedPath);
      } else {
        alert(res?.reason || '保存文档失败');
      }
    } catch (err: any) {
      alert(err.message || '写入文档异常');
    } finally {
      setIsSavingDoc(false);
    }
  };

  // 3. 一键全部应用写入逻辑 (Apply All)
  const handleApplyAll = async () => {
    if (detectedFiles.length === 0 || isApplyingAll) return;

    if (!isWritableMode) {
      alert('当前处于只读模式，请先在界面下方切换为【工作区读写】后再应用变更！');
      return;
    }

    if (!window.codexDesktop?.writeWorkspaceFile) {
      alert('当前运行环境未就绪写文件通道');
      return;
    }

    setIsApplyingAll(true);
    setBatchProgress({ current: 0, total: detectedFiles.length });
    const newlyApplied = new Set(appliedPaths);

    for (let i = 0; i < detectedFiles.length; i++) {
      const item = detectedFiles[i];
      setBatchProgress({ current: i + 1, total: detectedFiles.length });
      try {
        const res = await window.codexDesktop.writeWorkspaceFile({
          relativePath: item.filePath,
          content: cleanCodeForWriting(item.code),
          createBackup: true
        });
        if (res && res.ok) {
          newlyApplied.add(item.filePath);
          if (onFileWritten) onFileWritten(item.filePath);
        }
      } catch (err) {
        console.error(`写入文件 ${item.filePath} 失败:`, err);
      }
    }

    setAppliedPaths(newlyApplied);
    setIsApplyingAll(false);
    setBatchProgress(null);
  };

  // 4. 自动写盘 (Auto-Apply on Completion)
  // 当开启自动写盘、为读写模式、且刚完成流式生成（从生成中变为完成态）时，触发全自动落盘
  const wasStreamingRef = useRef(isStreaming);
  useEffect(() => {
    const justFinishedStreaming = wasStreamingRef.current && !isStreaming;
    wasStreamingRef.current = isStreaming;

    if (
      autoApplyEnabled &&
      isWritableMode &&
      justFinishedStreaming &&
      detectedFiles.length > 0 &&
      !autoAppliedRef.current
    ) {
      autoAppliedRef.current = true;
      handleApplyAll();
    }
  }, [isStreaming, autoApplyEnabled, isWritableMode, detectedFiles.length]);

  const toggleAutoApply = () => {
    const next = !autoApplyEnabled;
    setAutoApplyEnabled(next);
    localStorage.setItem('codex_auto_apply_changes', next ? 'true' : 'false');
  };

  // 5. 渲染各段落与代码块
  const blocks: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const renderRegex = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)(?:```|$)/g;

  while ((match = renderRegex.exec(content)) !== null) {
    const textBefore = content.slice(lastIndex, match.index);
    if (textBefore) {
      blocks.push(renderParagraphBlock(textBefore, `text_${lastIndex}`));
    }

    const language = match[1] || '';
    const code = match[2] ? match[2].replace(/\n$/, '') : '';
    const blockPath = detectFilePath(code);
    const isApplied = blockPath ? appliedPaths.has(blockPath) : false;

    blocks.push(
      <CodeBlock
        key={`code_${match.index}`}
        language={language}
        code={code}
        permissionMode={permissionMode}
        workspaceDir={workspaceDir}
        onFileWritten={(path) => {
          setAppliedPaths(prev => new Set(prev).add(path));
          if (onFileWritten) onFileWritten(path);
        }}
        isAppliedGlobally={isApplied}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  const remainingText = content.slice(lastIndex);
  if (remainingText) {
    blocks.push(renderParagraphBlock(remainingText, `text_${lastIndex}`));
  }

  const allApplied = detectedFiles.length > 0 && detectedFiles.every(f => appliedPaths.has(f.filePath));

  return (
    <div className="w-full space-y-1">
      {/* 📑 长篇结构化审查报告 / 交付文档卡片 */}
      {docReport && (
        <div className="mb-3 rounded-xl border border-accent/30 bg-accent/5 overflow-hidden transition-all shadow-sm">
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-accent/10 border-b border-accent/20">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1 rounded-md bg-accent text-white flex items-center justify-center shrink-0">
                <FileText size={13} />
              </span>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    结构化审查报告 / 交付文档
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-accent/20 text-accent font-medium truncate max-w-[180px]">
                    {docReport.suggestedPath}
                  </span>
                </div>
                <span className="text-[11px] text-text-muted truncate">
                  {docSaved
                    ? '🎉 已成功写入工作区工程，左侧文件树与右侧全景抽屉已同步展开'
                    : '检测到完整结构化分析报告，支持一键落盘保存到工作区并大屏阅读'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSaveDocToWorkspace}
                disabled={isSavingDoc || docSaved}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                  docSaved
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                    : isSavingDoc
                    ? 'bg-accent/50 text-white cursor-wait'
                    : isWritableMode
                    ? 'bg-accent hover:bg-accent/90 text-white shadow-md active:scale-95'
                    : 'bg-bg-hover text-text-muted border border-border hover:text-text-primary'
                }`}
                title={!isWritableMode ? '需先在下方切换为【工作区读写】' : `点击直接写入: ${docReport.suggestedPath}`}
              >
                {isSavingDoc ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>写入中...</span>
                  </>
                ) : docSaved ? (
                  <>
                    <CheckCheck size={13} className="text-emerald-400" />
                    <span>已存入工作区 (.md)</span>
                  </>
                ) : (
                  <>
                    <FileDown size={13} />
                    <span>一键存为工作区文档</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onFileWritten) onFileWritten(docReport.suggestedPath);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-border bg-bg-card hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                title="在右侧宽屏抽屉中全景大屏阅读"
              >
                <BookOpen size={12} className="text-accent" />
                <span>侧边全景阅读</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 Codex / Claude 风格：Agent 变更交付中心 (Change Delivery Bar) */}
      {detectedFiles.length > 0 && (
        <div className="mb-3 rounded-xl border border-accent/30 bg-accent/5 overflow-hidden transition-all shadow-sm">
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-accent/10 border-b border-accent/20">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1 rounded-md bg-accent text-white flex items-center justify-center">
                <Zap size={13} />
              </span>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-text-primary">
                    Codex 变更交付中心
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-accent/20 text-accent font-medium">
                    {detectedFiles.length} 个文件
                  </span>
                </div>
                <span className="text-[11px] text-text-muted">
                  {allApplied
                    ? '🎉 所有涉及文件已全部安全写入本地工作区'
                    : isApplyingAll
                    ? `正在写入本地工程 (${batchProgress?.current}/${batchProgress?.total})...`
                    : `检测到 ${detectedFiles.length} 处工程变更，支持一键落盘或自动同步`}
                </span>
              </div>
            </div>

            {/* 操作控制区 */}
            <div className="flex items-center gap-2 shrink-0">
              {/* 自动写盘 Toggle 开关 */}
              <button
                type="button"
                onClick={toggleAutoApply}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer border ${
                  autoApplyEnabled
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'bg-bg-hover border-border text-text-muted hover:text-text-primary'
                }`}
                title="开启后，在工作区读写模式下流式生成结束将全自动静默写盘物理文件"
              >
                <Check size={10} className={autoApplyEnabled ? 'opacity-100' : 'opacity-20'} />
                <span>自动写盘</span>
              </button>

              {/* 【⚡ 一键全部写入本地工程】按钮 */}
              <button
                type="button"
                onClick={handleApplyAll}
                disabled={isApplyingAll || allApplied}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                  allApplied
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                    : isApplyingAll
                    ? 'bg-accent/50 text-white cursor-wait'
                    : isWritableMode
                    ? 'bg-accent hover:bg-accent/90 text-white shadow-md active:scale-95'
                    : 'bg-bg-hover text-text-muted border border-border hover:text-text-primary'
                }`}
                title={!isWritableMode ? '需先将下方权限切换为【工作区读写】' : '将本次回复中的所有文件修改一次性写入磁盘工程'}
              >
                {isApplyingAll ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>写入中...</span>
                  </>
                ) : allApplied ? (
                  <>
                    <CheckCheck size={13} className="text-emerald-400" />
                    <span>全部已写入 (.bak)</span>
                  </>
                ) : (
                  <>
                    <FileDown size={13} />
                    <span>一键全部写入工程</span>
                  </>
                )}
              </button>

              {/* 折叠/展开文件列表 */}
              <button
                type="button"
                onClick={() => setIsFilesExpanded(!isFilesExpanded)}
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-accent/15 transition-colors cursor-pointer"
                title="展开/收起变更文件清单"
              >
                {isFilesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          {/* 可展开的文件清单面板 */}
          {isFilesExpanded && (
            <div className="p-2.5 bg-bg-card/40 flex flex-wrap gap-1.5 animate-fadeIn">
              {detectedFiles.map((item, fIdx) => {
                const written = appliedPaths.has(item.filePath);
                return (
                  <div
                    key={fIdx}
                    onClick={() => {
                      if (onFileWritten) onFileWritten(item.filePath);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                      written
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-bg-base border-border text-text-secondary hover:border-accent/40'
                    }`}
                    title={`点击在右侧面板预览: ${item.filePath}`}
                  >
                    {written ? <CheckCircle size={10} className="text-emerald-400" /> : <FileCode size={10} className="text-accent" />}
                    <span>{item.filePath}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Markdown 块主体 */}
      {blocks}
    </div>
  );
};


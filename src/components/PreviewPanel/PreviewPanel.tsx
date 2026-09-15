import React, { useState, useMemo, useEffect } from 'react';
import { X, Layers, Code, Copy, Check, CornerDownLeft, GitCompare, RotateCcw, BookOpen, Loader2, Maximize2, ListTree } from 'lucide-react';
import { ReadRichDocumentResult, IndexWorkspaceDocumentResult, DocumentChunkMeta } from '../../types/electron';
import { DocxReader } from './DocxReader';
import { PdfReader } from './PdfReader';

export interface PreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  filePath?: string;
  codeContent?: string;
  originalContent?: string | null;
  hasBackup?: boolean;
  onRevert?: (filePath: string) => Promise<void>;
  onInsertToPrompt?: (text: string) => void;
  onAttachImage?: (img: { id: string; name: string; dataUrl: string }) => void;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

// 快速且精准的行级 LCS Diff 引擎
function computeLineDiff(oldText: string, newText: string): { lines: DiffLine[]; addedCount: number; removedCount: number } {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const n = oldLines.length;
  const m = newLines.length;

  if (n * m > 250000) {
    const lines: DiffLine[] = [];
    let added = 0;
    let removed = 0;
    const maxLen = Math.max(n, m);
    for (let i = 0; i < maxLen; i++) {
      if (i < n && i < m) {
        if (oldLines[i] === newLines[i]) {
          lines.push({ type: 'unchanged', text: newLines[i], oldLineNumber: i + 1, newLineNumber: i + 1 });
        } else {
          lines.push({ type: 'removed', text: oldLines[i], oldLineNumber: i + 1 });
          lines.push({ type: 'added', text: newLines[i], newLineNumber: i + 1 });
          added++;
          removed++;
        }
      } else if (i < n) {
        lines.push({ type: 'removed', text: oldLines[i], oldLineNumber: i + 1 });
        removed++;
      } else {
        lines.push({ type: 'added', text: newLines[i], newLineNumber: i + 1 });
        added++;
      }
    }
    return { lines, addedCount: added, removedCount: removed };
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lines: DiffLine[] = [];
  let i = n;
  let j = m;
  let added = 0;
  let removed = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      lines.unshift({
        type: 'unchanged',
        text: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      lines.unshift({
        type: 'added',
        text: newLines[j - 1],
        newLineNumber: j,
      });
      added++;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      lines.unshift({
        type: 'removed',
        text: oldLines[i - 1],
        oldLineNumber: i,
      });
      removed++;
      i--;
    }
  }

  return { lines, addedCount: added, removedCount: removed };
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  isOpen,
  onClose,
  title = '系统已准备就绪',
  filePath,
  codeContent = `// 点击左侧【文件】列表中的任一文件\n// 即可在此处实时查看文件源码并在输入框引用`,
  originalContent,
  hasBackup = false,
  onRevert,
  onInsertToPrompt,
  onAttachImage,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'reading' | 'code' | 'diff'>('code');
  const [isReverting, setIsReverting] = useState(false);
  const [richLoading, setRichLoading] = useState(false);
  const [richDocData, setRichDocData] = useState<ReadRichDocumentResult | null>(null);
  const [lightboxImg, setLightboxImg] = useState<{ src: string; name?: string } | null>(null);
  const [docIndex, setDocIndex] = useState<IndexWorkspaceDocumentResult | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [chunkPreview, setChunkPreview] = useState<string>('');
  const [chunkLoading, setChunkLoading] = useState(false);
  const [chunkQuery, setChunkQuery] = useState('');
  const [searchHits, setSearchHits] = useState<DocumentChunkMeta[] | null>(null);

  // ↔️ 右侧预览栏左缘拖拽拉伸 (范围 360px ~ 900px，默认 420，持久化保存)
  const PANEL_MIN_W = 360;
  const PANEL_MAX_W = 900;
  const PANEL_DEFAULT_W = 420;
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('codex_preview_panel_width');
      if (saved) return Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, parseInt(saved, 10)));
    } catch (e) {}
    return PANEL_DEFAULT_W;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;
    let latestWidth = panelWidth;
    const handleMouseMove = (e: MouseEvent) => {
      const maxW = Math.min(PANEL_MAX_W, Math.floor(window.innerWidth * 0.7));
      const newWidth = Math.max(PANEL_MIN_W, Math.min(maxW, window.innerWidth - e.clientX));
      latestWidth = newWidth;
      setPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('codex_preview_panel_width', latestWidth.toString());
      } catch (e) {}
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // 仅在 isResizing 切换时挂载/卸载；拖拽中用闭包 latestWidth 落盘
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResizing]);

  const isRichDoc = useMemo(() => {
    return !!filePath && /\.(docx|pdf)$/i.test(filePath);
  }, [filePath]);

  // 当选定文件变更时，自动判断是否加载富文档
  useEffect(() => {
    if (!isOpen || !filePath) {
      setRichDocData(null);
      return;
    }

    if (isRichDoc && window.codexDesktop?.readRichDocument) {
      setRichLoading(true);
      setViewMode('reading');
      window.codexDesktop.readRichDocument(filePath)
        .then((res) => {
          if (res?.ok) {
            setRichDocData(res);
          } else {
            setRichDocData(null);
          }
        })
        .catch((err) => {
          console.error('[PreviewPanel] 加载富文档异常:', err);
          setRichDocData(null);
        })
        .finally(() => {
          setRichLoading(false);
        });
    } else {
      setRichDocData(null);
      setViewMode('code');
    }
  }, [isOpen, filePath, isRichDoc]);

  // 长文档：自动建立/读取分块索引，供侧栏浏览与检索
  useEffect(() => {
    if (!isOpen || !filePath || !window.codexDesktop?.indexWorkspaceDocument) {
      setDocIndex(null);
      setActiveChunkId(null);
      setChunkPreview('');
      setSearchHits(null);
      return;
    }
    if (!/\.(pdf|docx|md|txt|markdown)$/i.test(filePath)) {
      setDocIndex(null);
      return;
    }
    let cancelled = false;
    setIndexLoading(true);
    window.codexDesktop
      .indexWorkspaceDocument(filePath)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && res.docId) setDocIndex(res);
        else setDocIndex(null);
      })
      .catch(() => {
        if (!cancelled) setDocIndex(null);
      })
      .finally(() => {
        if (!cancelled) setIndexLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, filePath]);

  // 当备份存在时，自动提供 Diff 视角
  const diffResult = useMemo(() => {
    if (!hasBackup || !originalContent) return null;
    return computeLineDiff(originalContent, codeContent);
  }, [hasBackup, originalContent, codeContent]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!codeContent) return;
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevertClick = async () => {
    if (!filePath || !onRevert) return;
    const ok = window.confirm(`⚠️ 确定要撤销此次 AI 写入，并将【${title}】还原为修改前的版本吗？`);
    if (!ok) return;

    try {
      setIsReverting(true);
      await onRevert(filePath);
      setViewMode('code');
    } catch (err) {
      console.error('还原文件异常:', err);
    } finally {
      setIsReverting(false);
    }
  };

  const lineCount = codeContent ? codeContent.split('\n').length : 0;
  const ext = (filePath || title).split('.').pop()?.toUpperCase() || 'CODE';

  return (
    <>
      <aside
        style={{ width: `${panelWidth}px` }}
        className={`relative h-full bg-bg-sidebar border-l border-border flex flex-col flex-shrink-0 animate-slideLeft z-20 select-none shadow-xl ${
          isResizing ? 'cursor-col-resize' : 'transition-[width] duration-150'
        }`}
      >
        {/* ↔️ 左边缘微光拖拽手柄条 */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          className="absolute top-0 left-0 w-2 h-full cursor-col-resize hover:bg-accent/40 active:bg-accent transition-colors z-30 group"
          title="按住左右拖拽调节预览栏宽度"
        >
          <div className="w-0.5 h-full mx-auto bg-transparent group-hover:bg-accent group-active:bg-accent transition-colors" />
        </div>

        {/* 头部导航与模式切换 */}
        <div className="h-13 px-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
            <Layers size={15} className="text-accent" />
            <span>文档审阅与对比</span>
          </div>

          {/* 模式切换胶囊 */}
          <div className="flex items-center gap-1 bg-bg-base/80 p-0.5 rounded-lg border border-border">
            {isRichDoc && (
              <button
                type="button"
                onClick={() => setViewMode('reading')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                  viewMode === 'reading'
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
                title="阅读富排版视图 (公式/图片/表格/Canvas)"
              >
                <BookOpen size={12} />
                <span>阅读</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                viewMode === 'code'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title="查看文本/源码"
            >
              <Code size={12} />
              <span>{isRichDoc ? '纯文本' : '源码'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('diff')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                viewMode === 'diff'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              title={hasBackup ? '查看修改前后差异对比 (Diff)' : '当前无历史备份'}
            >
              <GitCompare size={12} />
              <span>差异</span>
              {hasBackup && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          </div>

          {/* 操作区 */}
          <div className="flex items-center gap-1">
            {codeContent && (
              <button
                onClick={handleCopy}
                className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors"
                title="复制文本"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors"
              title="关闭面板"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* 内容主体 */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden shadow-xs">
            {/* 文件信息栏与还原按钮 */}
            <div className="px-3 py-2 bg-bg-sidebar border-b border-border flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold text-[10px] font-mono">
                  {ext}
                </span>
                <span className="font-mono text-text-primary font-medium truncate" title={filePath || title}>
                  {title}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* 差异统计 */}
                {viewMode === 'diff' && diffResult && (
                  <div className="flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="text-emerald-400 font-bold">+{diffResult.addedCount}</span>
                    <span className="text-rose-400 font-bold">-{diffResult.removedCount}</span>
                  </div>
                )}

                {/* 还原按钮 */}
                {hasBackup && onRevert && filePath && (
                  <button
                    type="button"
                    onClick={handleRevertClick}
                    disabled={isReverting}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-medium transition-colors cursor-pointer"
                    title="撤销当前修改，安全还原为修改前的副本"
                  >
                    <RotateCcw size={10} className={isReverting ? 'animate-spin' : ''} />
                    <span>{isReverting ? '还原中...' : '还原'}</span>
                  </button>
                )}

                {viewMode === 'code' && (
                  <span className="text-[10px] text-text-muted font-mono">
                    {lineCount} 行
                  </span>
                )}
              </div>
            </div>

            {/* 快捷操作条 */}
            {filePath && onInsertToPrompt && (
              <div className="px-3 py-1.5 bg-bg-card/80 border-b border-border-light flex items-center justify-between text-[11px]">
                <span className="text-text-muted text-[10px] truncate max-w-[200px]" title={filePath}>
                  {filePath}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const fileRef = filePath.includes(' ') ? `@"${filePath}"` : `@${filePath}`;
                    onInsertToPrompt(`${fileRef} `);
                  }}
                  className="flex items-center gap-1 text-[10px] text-accent hover:underline cursor-pointer shrink-0"
                  title="在当前输入框中引用该文件"
                >
                  <CornerDownLeft size={10} />
                  <span>引用至对话</span>
                </button>
              </div>
            )}

            {/* 长文档分块目录 */}
            {(indexLoading || (docIndex?.chunks && docIndex.chunks.length > 0)) && (
              <div className="border-b border-border bg-bg-card/50 px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-primary">
                    <ListTree size={12} className="text-accent" />
                    <span>
                      分块索引
                      {docIndex?.chunkCount ? ` · ${docIndex.chunkCount} 块` : ''}
                      {docIndex?.sourceTruncated ? ' · 源文已截断' : ''}
                    </span>
                  </div>
                  {indexLoading && <Loader2 size={12} className="animate-spin text-text-muted" />}
                </div>
                {docIndex?.docId && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={chunkQuery}
                      onChange={(e) => setChunkQuery(e.target.value)}
                      placeholder="关键词检索分块…"
                      className="flex-1 min-w-0 px-2 py-1 rounded border border-border bg-bg-base text-[10px] text-text-primary outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      className="px-2 py-1 rounded text-[10px] bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25"
                      onClick={async () => {
                        if (!docIndex.docId || !chunkQuery.trim() || !window.codexDesktop?.searchDocumentChunks) {
                          setSearchHits(null);
                          return;
                        }
                        const res = await window.codexDesktop.searchDocumentChunks({
                          docId: docIndex.docId,
                          query: chunkQuery.trim(),
                          limit: 12,
                        });
                        if (res?.ok && res.hits?.length) {
                          setSearchHits(
                            res.hits.map((h) => ({
                              id: h.chunkId,
                              title: h.title,
                              summary: h.snippet,
                              charCount: h.charCount,
                            }))
                          );
                        } else {
                          setSearchHits([]);
                        }
                      }}
                    >
                      检索
                    </button>
                    {searchHits && (
                      <button
                        type="button"
                        className="px-1.5 py-1 text-[10px] text-text-muted hover:text-text-primary"
                        onClick={() => setSearchHits(null)}
                      >
                        清除
                      </button>
                    )}
                  </div>
                )}
                <div className="max-h-36 overflow-y-auto space-y-0.5 pr-0.5">
                  {(searchHits || docIndex?.chunks || []).slice(0, 60).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={async () => {
                        if (!docIndex?.docId || !window.codexDesktop?.readDocumentChunk) return;
                        setActiveChunkId(c.id);
                        setChunkLoading(true);
                        try {
                          const res = await window.codexDesktop.readDocumentChunk({
                            docId: docIndex.docId,
                            chunkId: c.id,
                          });
                          setChunkPreview(res?.ok ? res.content || '' : res?.reason || '读取失败');
                          setViewMode('code');
                        } finally {
                          setChunkLoading(false);
                        }
                      }}
                      className={`w-full text-left px-1.5 py-1 rounded text-[10px] leading-snug transition-colors ${
                        activeChunkId === c.id
                          ? 'bg-accent/20 text-accent border border-accent/30'
                          : 'hover:bg-bg-hover text-text-secondary border border-transparent'
                      }`}
                      title={c.summary}
                    >
                      <span className="font-mono text-text-muted mr-1">[{c.id}]</span>
                      <span className="font-medium">{c.title}</span>
                      <span className="text-text-muted ml-1">· {c.charCount}字</span>
                    </button>
                  ))}
                  {searchHits && searchHits.length === 0 && (
                    <p className="text-[10px] text-text-muted px-1">无命中，可换关键词或浏览完整目录</p>
                  )}
                </div>
                {chunkLoading && (
                  <div className="flex items-center gap-1 text-[10px] text-text-muted">
                    <Loader2 size={10} className="animate-spin" />
                    正在加载分块…
                  </div>
                )}
              </div>
            )}

            {/* 1. 阅读模式 */}
            {viewMode === 'reading' && (
              <div className="min-h-[300px]">
                {richLoading ? (
                  <div className="flex flex-col items-center justify-center p-12 text-text-muted space-y-2">
                    <Loader2 size={22} className="animate-spin text-accent" />
                    <span className="text-xs">正在解析文档图文与数学公式...</span>
                  </div>
                ) : richDocData?.type === 'docx' && richDocData.richDocument ? (
                  <DocxReader
                    document={richDocData.richDocument}
                    onAttachImage={onAttachImage}
                    onOpenLightbox={(src, name) => setLightboxImg({ src, name })}
                  />
                ) : richDocData?.type === 'pdf' && richDocData.base64 ? (
                  <PdfReader base64Data={richDocData.base64} />
                ) : (
                  <div className="p-8 text-center text-text-muted text-xs space-y-2">
                    <p>未能以富排版模式加载该文档，建议切换到纯文本模式查看。</p>
                    <button
                      type="button"
                      onClick={() => setViewMode('code')}
                      className="px-2 py-1 rounded bg-accent/15 text-accent text-xs hover:bg-accent hover:text-white transition-colors cursor-pointer"
                    >
                      切换至纯文本查看
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 2. 源码 / 纯文本视图 */}
            {viewMode === 'code' && (
              <pre className="p-3 font-mono text-text-secondary text-[11px] leading-relaxed overflow-x-auto whitespace-pre bg-bg-base/60 select-text max-h-[calc(100vh-240px)]">
                <code>{chunkPreview || codeContent}</code>
              </pre>
            )}

            {/* 3. 差异 (Diff) 视图 */}
            {viewMode === 'diff' && (
              <div className="font-mono text-[11px] leading-relaxed bg-bg-base/60 select-text max-h-[calc(100vh-240px)] overflow-x-auto overflow-y-auto">
                {!hasBackup || !diffResult ? (
                  <div className="p-6 text-center text-text-muted text-xs">
                    <p>当前文件暂无历史修改记录或属于新创建文件。</p>
                    <p className="text-[10px] mt-1 text-text-muted/70">当大模型修改已有文件时，系统会自动生成对比并支持还原。</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20 py-1">
                    {diffResult.lines.map((dl, idx) => {
                      if (dl.type === 'added') {
                        return (
                          <div key={idx} className="flex items-start bg-emerald-500/15 text-emerald-300 px-2 py-0.5 hover:bg-emerald-500/20">
                            <span className="w-8 text-right pr-2 text-emerald-500/60 select-none text-[10px] shrink-0 font-mono">
                              {dl.newLineNumber}
                            </span>
                            <span className="w-4 text-center text-emerald-400 select-none shrink-0 font-bold">
                              +
                            </span>
                            <span className="whitespace-pre-wrap break-all flex-1">{dl.text || ' '}</span>
                          </div>
                        );
                      }
                      if (dl.type === 'removed') {
                        return (
                          <div key={idx} className="flex items-start bg-rose-500/15 text-rose-300 px-2 py-0.5 hover:bg-rose-500/20">
                            <span className="w-8 text-right pr-2 text-rose-500/60 select-none text-[10px] shrink-0 font-mono">
                              {dl.oldLineNumber}
                            </span>
                            <span className="w-4 text-center text-rose-400 select-none shrink-0 font-bold">
                              -
                            </span>
                            <span className="whitespace-pre-wrap break-all flex-1">{dl.text || ' '}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="flex items-start text-text-secondary px-2 py-0.5 hover:bg-bg-hover/30">
                          <span className="w-8 text-right pr-2 text-text-muted/40 select-none text-[10px] shrink-0 font-mono">
                            {dl.newLineNumber}
                          </span>
                          <span className="w-4 text-center text-transparent select-none shrink-0">
                            {' '}
                          </span>
                          <span className="whitespace-pre-wrap break-all flex-1">{dl.text || ' '}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 高清图片 Lightbox 浮层 */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxImg(null)}
              className="absolute -top-10 right-0 p-1.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
              title="关闭"
            >
              <X size={18} />
            </button>
            <img
              src={lightboxImg.src}
              alt={lightboxImg.name || '大图'}
              className="max-h-[80vh] max-w-full rounded-lg shadow-2xl object-contain"
            />
            {lightboxImg.name && (
              <div className="mt-2 text-xs font-mono text-white/80 select-text">
                {lightboxImg.name}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

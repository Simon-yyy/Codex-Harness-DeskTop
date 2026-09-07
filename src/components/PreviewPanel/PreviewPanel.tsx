import React, { useState, useMemo } from 'react';
import { X, Layers, Code, Copy, Check, CornerDownLeft, GitCompare, RotateCcw, Plus, Minus } from 'lucide-react';

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

  // 保护性截断（行数过大时退化为快速比对，防止 UI 卡顿）
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
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'diff'>('code');
  const [isReverting, setIsReverting] = useState(false);

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
    <aside className={`h-full bg-bg-sidebar border-l border-border flex flex-col flex-shrink-0 animate-slideLeft z-20 select-none shadow-xl transition-all duration-200 ${
      viewMode === 'diff' ? 'w-96 sm:w-[500px]' : 'w-88 sm:w-96'
    }`}>
      {/* 头部导航与模式切换 */}
      <div className="h-13 px-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
          <Layers size={15} className="text-accent" />
          <span>代码审查与对比</span>
        </div>

        {/* 模式切换胶囊 */}
        <div className="flex items-center gap-1 bg-bg-base/80 p-0.5 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
              viewMode === 'code'
                ? 'bg-accent text-white shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
            title="查看最新完整源码"
          >
            <Code size={12} />
            <span>源码</span>
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
              title="复制全部源码"
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
                onClick={() => onInsertToPrompt(`@${filePath}`)}
                className="flex items-center gap-1 text-[10px] text-accent hover:underline cursor-pointer shrink-0"
                title="在当前输入框中引用该文件"
              >
                <CornerDownLeft size={10} />
                <span>引用至对话</span>
              </button>
            </div>
          )}

          {/* 源码视图 */}
          {viewMode === 'code' && (
            <pre className="p-3 font-mono text-text-secondary text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap bg-bg-base/60 select-text max-h-[calc(100vh-240px)]">
              <code>{codeContent}</code>
            </pre>
          )}

          {/* 差异 (Diff) 视图 */}
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
  );
};

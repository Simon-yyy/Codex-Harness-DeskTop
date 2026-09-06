import React, { useState } from 'react';
import { X, Layers, Code, Copy, Check, CornerDownLeft, FileCode } from 'lucide-react';

interface PreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  filePath?: string;
  codeContent?: string;
  onInsertToPrompt?: (text: string) => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  isOpen,
  onClose,
  title = '系统已准备就绪',
  filePath,
  codeContent = `// 点击左侧【文件】列表中的任一文件\n// 即可在此处实时查看文件源码并在输入框引用`,
  onInsertToPrompt,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!codeContent) return;
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = codeContent ? codeContent.split('\n').length : 0;
  const ext = (filePath || title).split('.').pop()?.toUpperCase() || 'CODE';

  return (
    <aside className="w-88 sm:w-96 h-full bg-bg-sidebar border-l border-border flex flex-col flex-shrink-0 animate-slideLeft z-20 select-none shadow-xl">
      {/* 头部 */}
      <div className="h-13 px-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
          <Layers size={15} className="text-accent" />
          <span>代码与变更预览</span>
        </div>
        <div className="flex items-center gap-1">
          {codeContent && (
            <button
              onClick={handleCopy}
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors"
              title="复制全部代码"
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
          {/* 文件信息栏 */}
          <div className="px-3 py-2 bg-bg-sidebar border-b border-border flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
              <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold text-[10px] font-mono">
                {ext}
              </span>
              <span className="font-mono text-text-primary font-medium truncate" title={filePath || title}>
                {title}
              </span>
            </div>
            <span className="text-[10px] text-text-muted font-mono shrink-0">
              {lineCount} 行
            </span>
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

          {/* 源码区域 */}
          <pre className="p-3 font-mono text-text-secondary leading-relaxed overflow-x-auto whitespace-pre-wrap bg-bg-base/60 select-text max-h-[calc(100vh-230px)]">
            <code>{codeContent}</code>
          </pre>
        </div>
      </div>
    </aside>
  );
};

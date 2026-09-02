import React from 'react';
import { X, Layers, Code } from 'lucide-react';

interface PreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  codeContent?: string;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  isOpen,
  onClose,
  title = '系统已准备就绪',
  codeContent = `// 点击左侧【文件】列表中的任一文件\n// 即可在此处实时查看文件源码并在输入框引用`,
}) => {
  if (!isOpen) return null;

  return (
    <aside className="w-80 h-full bg-bg-sidebar border-l border-border flex flex-col flex-shrink-0 animate-slideLeft z-20 select-none">
      {/* 头部 */}
      <div className="h-13 px-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
          <Layers size={15} className="text-accent" />
          <span>变更预览 & 查看器</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors"
          title="关闭面板"
        >
          <X size={15} />
        </button>
      </div>

      {/* 内容主体 */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden shadow-xs">
          <div className="px-3 py-2 bg-bg-sidebar border-b border-border flex items-center gap-2 text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold text-[10px]">
              OVERVIEW
            </span>
            <span className="font-mono text-text-primary font-medium truncate">{title}</span>
          </div>
          <pre className="p-3 font-mono text-xs text-text-secondary leading-relaxed overflow-x-auto whitespace-pre-wrap bg-bg-base/60 select-text">
            <code>{codeContent}</code>
          </pre>
        </div>
      </div>
    </aside>
  );
};

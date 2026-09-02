import React from 'react';
import { ExternalLink, Terminal } from 'lucide-react';

export const StatusBar: React.FC = () => {
  return (
    <footer className="h-7 bg-bg-sidebar border-t border-border px-3 flex items-center justify-between text-[11px] font-mono text-text-muted select-none z-10">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-accent-green font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
          就绪
        </span>
        <span className="opacity-30">|</span>
        <span>首 token 1.2s · 138 tok/s</span>
        <span className="opacity-30">|</span>
        <span>缓存命中 99%</span>
        <span className="opacity-30">|</span>
        <span>输入 2.4k · 输出 620 tok</span>
      </div>

      <div className="flex items-center gap-3">
        <a
          href="https://github.com/Simon-yyy/Codex-Harness-DeskTop"
          target="_blank"
          rel="noreferrer"
          className="hover:text-accent flex items-center gap-1 transition-colors"
        >
          <span>⭐ GitHub: Codex-Harness-DeskTop</span>
          <ExternalLink size={10} />
        </a>
        <span className="opacity-30">|</span>
        <span className="text-text-muted">Ctrl+N 新建 · Ctrl+K 搜索 · Ctrl+L 重置</span>
      </div>
    </footer>
  );
};

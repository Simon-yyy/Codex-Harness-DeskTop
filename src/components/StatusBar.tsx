import React from 'react';
import { ExternalLink, Loader2, Zap } from 'lucide-react';

export interface GenerationMetrics {
  isGenerating: boolean;
  firstTokenLatencyMs: number | null;
  speedTokPerSec: number | null;
  cacheHitPercent: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

interface StatusBarProps {
  metrics?: GenerationMetrics;
}

function formatTokens(count: number | null): string {
  if (count === null || count === undefined) return '0';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}m`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export const StatusBar: React.FC<StatusBarProps> = ({ metrics }) => {
  const isGenerating = !!metrics?.isGenerating;
  const hasData = metrics && (metrics.firstTokenLatencyMs !== null || metrics.outputTokens !== null);

  const ttftStr = metrics?.firstTokenLatencyMs !== null && metrics?.firstTokenLatencyMs !== undefined
    ? `${(metrics.firstTokenLatencyMs / 1000).toFixed(2)}s`
    : null;

  const speedStr = metrics?.speedTokPerSec !== null && metrics?.speedTokPerSec !== undefined
    ? `${metrics.speedTokPerSec} tok/s`
    : null;

  const cacheStr = metrics?.cacheHitPercent !== null && metrics?.cacheHitPercent !== undefined
    ? `缓存命中 ${metrics.cacheHitPercent}%`
    : null;

  const ioStr = hasData
    ? `输入 ${formatTokens(metrics?.inputTokens ?? 0)} · 输出 ${formatTokens(metrics?.outputTokens ?? 0)} tok`
    : null;

  return (
    <footer className="h-7 bg-bg-sidebar border-t border-border px-3 flex items-center justify-between text-[11px] font-mono text-text-muted select-none z-10">
      <div className="flex items-center gap-3">
        {/* 状态徽标 */}
        {isGenerating ? (
          <span className="flex items-center gap-1.5 text-accent font-medium animate-pulse">
            <Loader2 size={12} className="animate-spin text-accent" />
            生成中...
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-accent-green font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
            就绪
          </span>
        )}

        <span className="opacity-30">|</span>

        {/* 遥测性能指标展示 (100% 真实流式数据) */}
        {hasData ? (
          <>
            <span className="flex items-center gap-1 text-text-secondary">
              <Zap size={11} className="text-amber-400" />
              <span>
                {ttftStr ? `首 token ${ttftStr}` : '首 token 测算中'}
                {speedStr ? ` · ${speedStr}` : ''}
              </span>
            </span>

            {cacheStr && (
              <>
                <span className="opacity-30">|</span>
                <span className="text-emerald-400">{cacheStr}</span>
              </>
            )}

            {ioStr && (
              <>
                <span className="opacity-30">|</span>
                <span className="text-text-secondary">{ioStr}</span>
              </>
            )}
          </>
        ) : (
          <span className="text-text-muted/70">待命中 · 暂无本轮调用消耗</span>
        )}
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

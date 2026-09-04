import React, { useEffect, useState } from 'react';
import { X, ExternalLink, RefreshCw, Sparkles, Shield, Cpu } from 'lucide-react';
import { AppInfo } from '@/types/electron';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckUpdates: () => void;
  onOpenFeedback?: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  onCheckUpdates,
  onOpenFeedback,
}) => {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    if (isOpen && window.codexDesktop && window.codexDesktop.getAppInfo) {
      window.codexDesktop.getAppInfo().then(res => setInfo(res));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-accent to-accent-secondary text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-full bg-white/20 hover:bg-white/30 text-white"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-3.5 mb-2">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl font-bold">
              CX
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-wide">Codex Desktop</h2>
              <p className="text-xs text-orange-100 font-mono">
                版本: v{info?.version || '1.0.2'} ({info?.platform || 'Windows'} {info?.arch || 'x64'})
              </p>
            </div>
          </div>
          <p className="text-xs text-orange-50 leading-relaxed mt-2">
            现代化 OpenAI Codex 工业级桌面客户端，装配 43 项技能库与 Tab Queueing 调度流水线。
          </p>
        </div>

        {/* Info list */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-bg-sidebar rounded-xl border border-border space-y-1">
              <span className="text-text-muted flex items-center gap-1.5 font-medium">
                <Cpu size={13} className="text-accent" />
                Electron 底座
              </span>
              <p className="font-mono text-text-primary font-semibold">v33.4.11 (Node v20.18.3)</p>
            </div>
            <div className="p-3 bg-bg-sidebar rounded-xl border border-border space-y-1">
              <span className="text-text-muted flex items-center gap-1.5 font-medium">
                <Shield size={13} className="text-accent" />
                内置技能库
              </span>
              <p className="font-mono text-text-primary font-semibold">43 项工业与 Loop 技能已装配</p>
            </div>
          </div>

          <div className="p-3 bg-bg-sidebar rounded-xl border border-border flex items-center justify-between text-xs">
            <span className="text-text-secondary">开源仓库</span>
            <a
              href="https://github.com/Simon-yyy/Codex-Harness-DeskTop"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline flex items-center gap-1 font-mono font-medium"
            >
              <span>Simon-yyy/Codex-Harness-DeskTop</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-bg-sidebar flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onCheckUpdates}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:bg-bg-hover text-text-primary rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>检查更新...</span>
            </button>
            {onOpenFeedback && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFeedback();
                }}
                className="flex items-center gap-1 px-3 py-1.5 border border-border hover:bg-bg-hover text-text-secondary hover:text-red-400 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                <span>🐞 问题反馈</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-accent hover:bg-accent-secondary text-white rounded-lg text-xs font-semibold"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

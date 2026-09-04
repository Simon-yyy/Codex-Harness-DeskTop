import React, { useState, useEffect } from 'react';
import { X, Sparkles, Copy, Check, CornerDownLeft, Play, Bookmark } from 'lucide-react';
import { getSkillDisplayInfo, SKILL_CATEGORIES } from '@/data/skillsDictionary';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

interface SkillDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  skill: SkillItem | null;
  onInsertPrompt: (text: string) => void;
}

export const SkillDetailModal: React.FC<SkillDetailModalProps> = ({
  isOpen,
  onClose,
  skill,
  onInsertPrompt,
}) => {
  const [copied, setCopied] = useState(false);
  const [showRawPrompt, setShowRawPrompt] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !skill) return null;

  const info = getSkillDisplayInfo(skill.id, skill.name, skill.description);
  const categoryInfo = SKILL_CATEGORIES.find(c => c.key === info.category);

  const handleCopyExample = async () => {
    try {
      await navigator.clipboard.writeText(info.examplePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // 剪贴板异常兜底
    }
  };

  const handleUseExample = () => {
    onInsertPrompt(`${info.examplePrompt} `);
    onClose();
  };

  const handleUseCommandOnly = () => {
    onInsertPrompt(`/${skill.id} `);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 卡片头部 */}
        <div className="p-4 border-b border-border bg-bg-sidebar flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-text-primary truncate">
                  {info.displayName}
                </h3>
                {categoryInfo && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-card border border-border text-text-muted shrink-0 flex items-center gap-1">
                    <span>{categoryInfo.icon}</span>
                    <span>{categoryInfo.label}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[11px] text-accent font-semibold">
                  /{skill.id}
                </span>
                <span className="text-[10px] text-text-muted truncate">
                  · {skill.name}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
            title="关闭 (ESC)"
          >
            <X size={16} />
          </button>
        </div>

        {/* 卡片内容区域 (滚动) */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs select-text">
          {/* 1. 说明 */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-text-secondary flex items-center gap-1.5">
              <Bookmark size={13} className="text-accent" />
              <span>功能说明</span>
            </div>
            <p className="text-xs text-text-primary leading-relaxed bg-bg-sidebar/50 p-3 rounded-xl border border-border">
              {info.chineseSummary}
            </p>
          </div>

          {/* 2. 用法示例 (核心亮点) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-text-secondary flex items-center gap-1.5">
                <Play size={12} className="text-emerald-500 fill-emerald-500" />
                <span>实战用法示例</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyExample}
                  className="flex items-center gap-1 px-2 py-0.8 text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors cursor-pointer select-none"
                  title="复制示例 Prompt"
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-emerald-500" />
                      <span className="text-emerald-500 font-medium">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>复制</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 终端代码质感示例卡片 */}
            <div className="relative group bg-bg-sidebar border border-accent/20 rounded-xl p-3 font-mono text-xs leading-relaxed text-text-primary shadow-xs">
              <div className="text-accent-warm select-all whitespace-pre-wrap font-sans">
                {info.examplePrompt}
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-end gap-2">
                <button
                  onClick={handleUseCommandOnly}
                  className="px-2.5 py-1 text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors cursor-pointer select-none font-sans"
                  title="仅将指令 /{skill.id} 填入输入框"
                >
                  仅填指令 /{skill.id}
                </button>
                <button
                  onClick={handleUseExample}
                  className="px-3 py-1 bg-accent text-white hover:brightness-110 rounded-lg text-[11px] font-medium flex items-center gap-1.5 shadow-xs transition-all cursor-pointer select-none font-sans"
                  title="将此示例直接填入输入框，直接体验"
                >
                  <CornerDownLeft size={12} />
                  <span>填入此示例并使用</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. 适用场景建议 */}
          {info.whenToUse && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-text-secondary flex items-center gap-1.5">
                <span className="text-amber-500 font-bold">🎯</span>
                <span>建议使用场景</span>
              </div>
              <div className="p-3 bg-bg-sidebar/40 rounded-xl border border-border text-text-secondary leading-relaxed text-[11px]">
                {info.whenToUse}
              </div>
            </div>
          )}

          {/* 4. 底层官方定义/规约预览 (折叠) */}
          {(skill.description || skill.prompt) && (
            <div className="pt-2 border-t border-border">
              <button
                onClick={() => setShowRawPrompt(!showRawPrompt)}
                className="text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer select-none flex items-center justify-between w-full"
              >
                <span>{showRawPrompt ? '收起底层规约' : '查看底层规约与英文定义'}</span>
                <span className="text-[10px] text-accent font-mono">{showRawPrompt ? '▲' : '▼'}</span>
              </button>
              {showRawPrompt && (
                <div className="mt-2 space-y-2 text-[10px] animate-fadeIn">
                  {skill.description && (
                    <div className="p-2 bg-bg-sidebar rounded border border-border text-text-muted italic">
                      {skill.description}
                    </div>
                  )}
                  {skill.prompt && (
                    <div className="p-2 bg-bg-sidebar rounded border border-border font-mono text-text-muted max-h-32 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                      {skill.prompt}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部动作条 */}
        <div className="p-3 border-t border-border bg-bg-sidebar flex items-center justify-between">
          <span className="text-[10px] text-text-muted">
            按 ESC 键或点击外部可随时关闭
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

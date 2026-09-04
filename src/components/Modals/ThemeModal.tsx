import React from 'react';
import { X, Check } from 'lucide-react';
import { ThemeType } from '@/hooks/useTheme';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeType;
  onSelectTheme: (theme: ThemeType) => void;
}

const THEMES: { id: ThemeType; name: string; desc: string; previewClass: string }[] = [
  {
    id: 'dark',
    name: 'escook Dark (默认)',
    desc: '经典暖调极客深灰 · 彬哥标志性暖阳橙',
    previewClass: 'bg-[#252526] border-[#ef820c]',
  },
  {
    id: 'dark-soft',
    name: 'escook Dark Soft',
    desc: 'Ayu 经典深海蓝灰 · 温润柔光奶杏黄',
    previewClass: 'bg-[#1f2430] border-[#ffcc66]',
  },
  {
    id: 'light',
    name: 'escook Light',
    desc: 'Solarized 护眼暖米白 · 典雅紫罗兰',
    previewClass: 'bg-[#fdf6e3] border-[#705697]',
  },
  {
    id: 'light-soft',
    name: 'escook Light Soft',
    desc: '现代极简清透浅灰 · 柔和活力橙',
    previewClass: 'bg-[#fafafa] border-[#ff9940]',
  },
];

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between bg-bg-sidebar">
          <div>
            <h3 className="text-sm font-bold text-text-primary">主题外观切换</h3>
            <p className="text-xs text-text-muted">实时毫秒级热切换 4 套高对比度主题。</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-2.5">
          {THEMES.map(th => {
            const isSelected = currentTheme === th.id;
            return (
              <div
                key={th.id}
                onClick={() => onSelectTheme(th.id)}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/10 shadow-xs'
                    : 'border-border hover:border-accent/40 bg-bg-sidebar/40 hover:bg-bg-hover'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary">{th.name}</span>
                    {isSelected && (
                      <span className="text-[10px] bg-accent text-white px-1.5 py-0.2 rounded font-semibold">
                        当前
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted">{th.desc}</p>
                </div>

                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-accent bg-accent text-white' : 'border-border'}`}>
                  {isSelected && <Check size={14} />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-border bg-bg-sidebar text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-accent hover:bg-accent-secondary text-white rounded-lg text-xs font-semibold"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

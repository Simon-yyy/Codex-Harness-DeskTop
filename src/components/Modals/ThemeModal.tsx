import React, { useState, useEffect } from 'react';
import { X, Check, Palette, Type, Code, Sliders } from 'lucide-react';
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

// 主流代码编程字体预设
export const CODE_FONTS = [
  {
    id: 'JetBrains Mono',
    name: 'JetBrains Mono',
    desc: '现代 IDE 黄金标准 · 符号分明清晰',
    value: "'JetBrains Mono', Consolas, monospace",
  },
  {
    id: 'Cascadia Code',
    name: 'Cascadia Code',
    desc: '微软官方极客等宽 · 现代工整',
    value: "'Cascadia Code', Consolas, monospace",
  },
  {
    id: 'Fira Code',
    name: 'Fira Code',
    desc: '编程连字美学先锋 · 视觉舒缓',
    value: "'Fira Code', Consolas, monospace",
  },
  {
    id: 'Consolas',
    name: 'Consolas',
    desc: 'Windows 经典原生等宽 · 极低锯齿',
    value: "Consolas, 'Courier New', monospace",
  },
  {
    id: 'Source Code Pro',
    name: 'Source Code Pro',
    desc: 'Adobe 专业开源等宽 · 高度可读',
    value: "'Source Code Pro', Consolas, monospace",
  },
];

// 主流界面文本字体预设
export const TEXT_FONTS = [
  {
    id: 'System',
    name: '系统原生字体 (System UI)',
    desc: '跟随操作系统默认 · 原生流畅 Segoe UI / 苹方',
    value: 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", sans-serif',
  },
  {
    id: 'Inter',
    name: 'Inter',
    desc: '现代科技界面无衬线字体 · 极致细腻',
    value: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  {
    id: 'Chinese-Optimized',
    name: '清晰中文优化 (PingFang / 微软雅黑)',
    desc: '针对中文字符笔画优化 · 阅读饱满',
    value: '"PingFang SC", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif',
  },
  {
    id: 'Roboto',
    name: 'Roboto',
    desc: 'Google 经典几何无衬线 · 清晰明朗',
    value: 'Roboto, system-ui, -apple-system, sans-serif',
  },
];

export const FONT_SIZES = [
  { id: '12px', label: '紧凑 (12px)', value: '12px' },
  { id: '13px', label: '标准 (13px)', value: '13px' },
  { id: '14px', label: '舒适 (14px)', value: '14px' },
];

export function applySavedFontSettings() {
  try {
    const saved = localStorage.getItem('codex_font_settings');
    if (saved) {
      const cfg = JSON.parse(saved);
      if (cfg.codeFont) document.documentElement.style.setProperty('--font-mono', cfg.codeFont);
      if (cfg.textFont) document.documentElement.style.setProperty('--font-sans', cfg.textFont);
      if (cfg.codeSize) document.documentElement.style.setProperty('--font-code-size', cfg.codeSize);
    }
  } catch (e) {}
}

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
}) => {
  const [activeTab, setActiveTab] = useState<'theme' | 'font'>('theme');

  const [fontConfig, setFontConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('codex_font_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      codeFont: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      codeFontId: 'Cascadia Code',
      textFont: 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", sans-serif',
      textFontId: 'System',
      codeSize: '12px',
    };
  });

  // 字体配置变动时实时写入 CSS 变量并持久化
  const updateFont = (patch: Partial<typeof fontConfig>) => {
    const next = { ...fontConfig, ...patch };
    setFontConfig(next);
    localStorage.setItem('codex_font_settings', JSON.stringify(next));
    if (next.codeFont) document.documentElement.style.setProperty('--font-mono', next.codeFont);
    if (next.textFont) document.documentElement.style.setProperty('--font-sans', next.textFont);
    if (next.codeSize) document.documentElement.style.setProperty('--font-code-size', next.codeSize);
  };

  useEffect(() => {
    applySavedFontSettings();
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 Header 与选项卡切换 */}
        <div className="p-4 border-b border-border bg-bg-sidebar flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-text-primary">界面个性化定制</h3>
              <p className="text-xs text-text-muted">
                {activeTab === 'theme' ? '实时毫秒级热切换 4 套高对比度主题。' : '自由调节代码与文本字体，支持主流极客字体。'}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary rounded-lg cursor-pointer">
              <X size={16} />
            </button>
          </div>

          {/* 切换栏：主题配色 vs 字体调节 */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-bg-base/60 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setActiveTab('theme')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'theme'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <Palette size={13} />
              <span>主题配色</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('font')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'font'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <Type size={13} />
              <span>字体调节</span>
            </button>
          </div>
        </div>

        {/* 选项卡内容区 */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'theme' ? (
            /* 主题配色选项卡 */
            <div className="space-y-2.5">
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
          ) : (
            /* 字体调节选项卡 */
            <div className="space-y-4 text-xs">
              {/* 1. 代码字体 (Code Font) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-text-primary">
                    <Code size={13} className="text-accent" />
                    <span>代码等宽字体 (Code Font)</span>
                  </div>
                  <span className="text-[11px] text-text-muted font-mono">{fontConfig.codeFontId}</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {CODE_FONTS.map(f => {
                    const isSelected = fontConfig.codeFontId === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => updateFont({ codeFont: f.value, codeFontId: f.id })}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-accent bg-accent/10 shadow-xs'
                            : 'border-border hover:border-accent/40 bg-bg-sidebar/40 hover:bg-bg-hover'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span style={{ fontFamily: f.value }} className="text-xs font-bold text-text-primary">
                              {f.name}
                            </span>
                            <span style={{ fontFamily: f.value }} className="text-[10px] text-accent/80 font-mono">
                              const x = 42;
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted truncate mt-0.5">{f.desc}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${isSelected ? 'border-accent bg-accent text-white' : 'border-border'}`}>
                          {isSelected && <Check size={12} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. 界面文本字体 (UI Font) */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-text-primary">
                    <Type size={13} className="text-accent" />
                    <span>界面文本字体 (Text Font)</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {TEXT_FONTS.map(f => {
                    const isSelected = fontConfig.textFontId === f.id;
                    return (
                      <div
                        key={f.id}
                        onClick={() => updateFont({ textFont: f.value, textFontId: f.id })}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-accent bg-accent/10 shadow-xs'
                            : 'border-border hover:border-accent/40 bg-bg-sidebar/40 hover:bg-bg-hover'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <span style={{ fontFamily: f.value }} className="text-xs font-bold text-text-primary block">
                            {f.name}
                          </span>
                          <p className="text-[11px] text-text-muted truncate mt-0.5">{f.desc}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${isSelected ? 'border-accent bg-accent text-white' : 'border-border'}`}>
                          {isSelected && <Check size={12} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. 代码字号微调 */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 font-semibold text-text-primary">
                  <Sliders size={13} className="text-accent" />
                  <span>代码块字号大小</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {FONT_SIZES.map(s => {
                    const isSelected = fontConfig.codeSize === s.value;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => updateFont({ codeSize: s.value })}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all cursor-pointer text-center ${
                          isSelected
                            ? 'border-accent bg-accent/15 text-accent font-bold'
                            : 'border-border bg-bg-sidebar/40 text-text-muted hover:text-text-primary hover:bg-bg-hover'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="p-3 border-t border-border bg-bg-sidebar text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-accent hover:bg-accent-secondary text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs active:scale-95 transition-all"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

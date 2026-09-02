import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, ArrowUp, Sparkles, ChevronUp, X, Clock, Terminal, Zap, Shield, HelpCircle, Layers, Wrench } from 'lucide-react';
import { AttachedImage, QueuedInstruction } from '@/types/session';
import { ModelOption } from '@/types/provider';
import { SkillItem } from '@/types/electron';

interface ComposerProps {
  onSend: (text: string, images: AttachedImage[]) => void;
  isGenerating: boolean;
  queue: QueuedInstruction[];
  onRemoveQueueItem: (id: string) => void;
  allModels: ModelOption[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
  inputPrompt: string;
  setInputPrompt: (text: string) => void;
  skills: SkillItem[];
}

const SLASH_COMMANDS = [
  { cmd: '/status', desc: '检查 Codex 内核与大模型连通性', icon: Zap },
  { cmd: '/diff', desc: '查看当前工作区变更摘要与文件统计', icon: Layers },
  { cmd: '/skills', desc: '展开 43 项全流程工业级技能库', icon: Shield },
  { cmd: '/clear', desc: '清空当前会话历史消息', icon: Terminal },
  { cmd: '/help', desc: '查看所有支持的快捷指令与操作说明', icon: HelpCircle },
];

export const Composer: React.FC<ComposerProps> = ({
  onSend,
  isGenerating,
  queue,
  onRemoveQueueItem,
  allModels,
  selectedModel,
  onSelectModel,
  inputPrompt,
  setInputPrompt,
  skills,
}) => {
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // 全局点击空白区域与按 ESC 键自动收起模型选择和快捷指令卡片
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node) && textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        setShowSlashMenu(false);
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModelPicker(false);
        setShowSlashMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // 动态自适应输入框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 140)}px`;
    }
  }, [inputPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputPrompt(val);
    if (val.startsWith('/') && !val.includes(' ')) {
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }
  };

  const handleSend = () => {
    if (!inputPrompt.trim() && images.length === 0) return;
    onSend(inputPrompt, images);
    setInputPrompt('');
    setImages([]);
    setShowSlashMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSelectSlash = (cmd: string) => {
    setInputPrompt(cmd + ' ');
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          const base64 = evt.target?.result as string;
          let localPath = '';
          if (window.codexDesktop && window.codexDesktop.saveTempImage) {
            const res = await window.codexDesktop.saveTempImage(base64);
            if (res && res.success) localPath = res.path;
          }
          setImages(prev => [...prev, { base64, path: localPath }]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') === 0) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const base64 = evt.target?.result as string;
            let localPath = '';
            if (window.codexDesktop && window.codexDesktop.saveTempImage) {
              const res = await window.codexDesktop.saveTempImage(base64);
              if (res && res.success) localPath = res.path;
            }
            setImages(prev => [...prev, { base64, path: localPath }]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const query = inputPrompt.startsWith('/') ? inputPrompt.slice(1).toLowerCase().trim() : '';

  const matchedCommands = SLASH_COMMANDS.filter(c => 
    !query || c.cmd.slice(1).includes(query) || c.desc.toLowerCase().includes(query)
  );

  const matchedSkills = (skills || []).filter(s =>
    !query || s.id.toLowerCase().includes(query) || s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query)
  );

  return (
    <footer className="w-full max-w-5xl 2xl:max-w-6xl mx-auto px-2 sm:px-4 md:px-6 pb-4 select-none relative">
      {/* 待执行指令排队条 (Tab Queueing) */}
      {queue.length > 0 && (
        <div className="mb-2 p-2.5 bg-accent/10 border border-accent/30 rounded-xl flex flex-col gap-1.5 animate-fadeIn">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-accent flex items-center gap-1.5">
              <Clock size={13} className="animate-spin text-accent" />
              指令排队中 ({queue.length})
            </span>
            <span className="text-[11px] text-text-muted">任务完成后自动流水线执行</span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {queue.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-1.5 px-2 py-0.5 bg-bg-card border border-border rounded-md text-xs text-text-secondary"
              >
                <span className="truncate max-w-[180px]">{item.prompt}</span>
                <button
                  onClick={() => onRemoveQueueItem(item.id)}
                  className="hover:text-red-400 text-text-muted"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 附件缩略图条 */}
      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 p-2 bg-bg-card border border-border rounded-xl">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.base64}
                alt="附件预览"
                className="h-14 w-14 object-cover rounded-lg border border-border"
              />
              <button
                onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm opacity-90 hover:opacity-100"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Slash 指令与 43 项技能快捷融合菜单 */}
      {showSlashMenu && (
        <div ref={slashMenuRef} className="absolute bottom-full mb-2 left-2 sm:left-4 md:left-6 right-2 sm:right-4 md:right-6 bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-40 animate-fadeIn max-w-5xl 2xl:max-w-6xl mx-auto flex flex-col max-h-80">
          <div className="p-3 bg-bg-sidebar border-b border-border flex items-center justify-between text-xs font-semibold text-text-primary">
            <span className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-accent" />
              <span>快捷指令与 43 项工程技能库</span>
            </span>
            <span className="text-[10px] text-text-muted font-mono">输入 /{query || '...'} 实时搜索</span>
          </div>

          <div className="p-2 overflow-y-auto space-y-3">
            {/* 系统指令 */}
            {matchedCommands.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-text-muted px-2 uppercase tracking-wider">
                  系统指令 ({matchedCommands.length})
                </div>
                {matchedCommands.map(sc => {
                  const Icon = sc.icon;
                  return (
                    <div
                      key={sc.cmd}
                      onClick={() => handleSelectSlash(sc.cmd)}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-bg-hover cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={14} className="text-accent" />
                        <span className="font-mono text-xs font-bold text-accent">{sc.cmd}</span>
                        <span className="text-xs text-text-secondary">{sc.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 43 项技能库 */}
            {matchedSkills.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-text-muted px-2 uppercase tracking-wider flex items-center justify-between">
                  <span>工业与 Loop 技能库 ({matchedSkills.length})</span>
                  <span className="text-accent-warm font-normal">点击即刻装载指令</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {matchedSkills.map(sk => (
                    <div
                      key={sk.id}
                      onClick={() => handleSelectSlash(`/${sk.id}`)}
                      className="p-2 rounded-lg bg-bg-sidebar/50 hover:bg-bg-hover border border-border/80 hover:border-accent/40 cursor-pointer transition-all space-y-0.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 truncate">
                          <Wrench size={12} className="text-accent" />
                          <span className="truncate">{sk.name}</span>
                        </span>
                        <span className="text-[10px] font-mono text-accent-warm px-1 py-0.2 rounded bg-accent/10">
                          /{sk.id}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted line-clamp-1">{sk.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {matchedCommands.length === 0 && matchedSkills.length === 0 && (
              <div className="p-6 text-center text-xs text-text-muted">
                未搜索到与 <span className="font-mono text-accent">/{query}</span> 匹配的指令或技能
              </div>
            )}
          </div>
        </div>
      )}

      {/* Composer 主卡片 (移除 overflow-hidden 避免裁剪上浮菜单) */}
      <div className="bg-bg-card border border-border hover:border-accent/40 focus-within:border-accent rounded-xl shadow-sm transition-all relative">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1 text-xs text-text-muted">
          <div className="flex items-center gap-1 text-[11px] font-medium text-accent">
            <Sparkles size={12} />
            <span>43 Skills Armed</span>
          </div>
          <label className="flex items-center gap-1 hover:text-text-primary cursor-pointer px-1.5 py-0.5 rounded hover:bg-bg-hover transition-colors">
            <Paperclip size={13} />
            <span>附加图片/文件</span>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept="image/*,.txt,.js,.ts,.py,.json,.md"
              className="hidden"
            />
          </label>
        </div>

        {/* Textarea 输入框 */}
        <div className="px-3 py-1">
          <textarea
            ref={textareaRef}
            value={inputPrompt}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="描述需求、架构或输入 /status /diff /skills /help (Agent 运行时支持排队)"
            rows={1}
            className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-muted resize-none focus:outline-none min-h-[28px] max-h-[140px] leading-relaxed select-text"
          />
        </div>

        {/* 底部功能条与发送按钮 */}
        <div className="flex items-center justify-between px-3 pb-2 pt-1 border-t border-border-light text-[11px] text-text-muted">
          <div className="flex items-center gap-2">
            <span>Enter 发送 · Shift+Enter 换行</span>
          </div>

          <div className="flex items-center gap-2">
            {/* 模型胶囊选择器 */}
            <div ref={modelPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setShowModelPicker(!showModelPicker)}
                className="flex items-center gap-1.5 px-3 py-1 bg-bg-sidebar hover:bg-bg-hover border border-border rounded-full text-xs font-mono text-text-primary transition-colors cursor-pointer shadow-xs"
                title="选择模型"
              >
                <span className="font-medium">{selectedModel}</span>
                <ChevronUp size={12} className={`transition-transform duration-200 ${showModelPicker ? 'rotate-180' : ''}`} />
              </button>

              {/* 模型浮层 (加宽至 w-80 ~ w-96，防止文字压缩折行) */}
              {showModelPicker && (
                <div className="absolute bottom-full right-0 mb-3 w-80 sm:w-96 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
                  <div className="p-3 bg-bg-sidebar border-b border-border flex items-center justify-between text-xs font-semibold text-text-primary">
                    <span>模型选择与提供方</span>
                    <span className="text-[10px] text-accent font-mono px-2 py-0.5 bg-accent/10 rounded-full font-bold">2026 旗舰矩阵</span>
                  </div>
                  <div className="p-1.5 max-h-64 overflow-y-auto space-y-1">
                    {allModels.map(m => (
                      <div
                        key={m.value}
                        onClick={() => {
                          onSelectModel(m.value);
                          setShowModelPicker(false);
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                          selectedModel === m.value
                            ? 'bg-accent/15 text-accent font-semibold border border-accent/30'
                            : 'hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-transparent'
                        }`}
                      >
                        <span className="font-mono font-medium truncate max-w-[200px] whitespace-nowrap">{m.text}</span>
                        <span className="text-[10px] text-text-muted shrink-0 ml-2 px-1.5 py-0.5 bg-bg-base/70 rounded border border-border/60 max-w-[130px] truncate whitespace-nowrap">
                          {m.providerName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 圆形微动效发送按钮 */}
            <button
              onClick={handleSend}
              disabled={!inputPrompt.trim() && images.length === 0}
              className="w-7 h-7 rounded-full bg-gradient-to-r from-accent to-accent-secondary hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shadow-xs active:scale-95"
              title="发送 (Enter)"
            >
              <ArrowUp size={14} />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

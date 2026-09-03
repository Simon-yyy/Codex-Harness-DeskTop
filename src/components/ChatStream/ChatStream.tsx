import React, { useEffect, useRef, useState } from 'react';
import { Bot, User, ChevronDown, ChevronRight, Copy, Check, Sparkles, ArrowDown, Loader2 } from 'lucide-react';
import { ChatMessage } from '@/types/session';

interface ChatStreamProps {
  messages: ChatMessage[];
  isGenerating?: boolean;
  currentModel?: string;
  onOpenLightbox: (src: string) => void;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  isGenerating = false,
  currentModel = 'gpt-5.6-sol',
  onOpenLightbox
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    streamEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom(isGenerating ? 'smooth' : 'auto');
  }, [messages, isGenerating]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 120;
    setShowScrollBottom(isFarFromBottom);
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const toggleThinking = (idx: number) => {
    setExpandedThinking(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const formatImageSrc = (src: string) => {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file://')) {
      return src;
    }
    return `file:///${src.replace(/\\/g, '/')}`;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto px-2 sm:px-4 md:px-6 py-6 space-y-6 scroll-smooth"
    >
      <div className="w-full max-w-5xl 2xl:max-w-6xl mx-auto space-y-6">
        {messages.length === 0 && (
          <div className="text-center py-20 text-text-muted space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto text-xl">
              <Sparkles size={24} />
            </div>
            <h3 className="text-sm font-semibold text-text-primary">准备就绪</h3>
            <p className="text-xs max-w-sm mx-auto leading-relaxed">
              输入您的代码任务、重构需求，或输入 <span className="font-mono text-accent">/</span> 查看快捷指令。
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';

          if (isUser) {
            return (
              <div key={idx} className="flex flex-col items-end space-y-1.5 animate-fadeIn">
                <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium pr-1">
                  <span>您</span>
                  <div className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold">
                    <User size={11} />
                  </div>
                </div>

                {/* 用户气泡卡片：采用与主题完全同构的高级无边突兀微光质感 */}
                <div className="max-w-[88%] sm:max-w-3xl bg-bg-card border border-border rounded-2xl rounded-tr-xs p-4 text-xs text-text-primary shadow-xs space-y-2.5 transition-all">
                  {msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.images.map((rawSrc, imgIdx) => {
                        const imgSrc = formatImageSrc(rawSrc);
                        return (
                          <img
                            key={imgIdx}
                            src={imgSrc}
                            alt="用户附件"
                            onClick={() => onOpenLightbox(imgSrc)}
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                            className="max-h-[160px] max-w-[240px] object-cover rounded-xl border border-border cursor-zoom-in hover:brightness-105 transition-all shadow-2xs"
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* 用户正文内容 */}
                  {msg.content && (
                    <div className="whitespace-pre-wrap leading-relaxed break-words text-text-primary font-normal select-text">
                      {msg.content}
                    </div>
                  )}

                  {/* 用户卡片底部操作栏 (时间戳 + 复制指令按钮) */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[11px] text-text-muted">
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    <button
                      onClick={() => copyToClipboard(msg.content, idx)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-[11px] font-medium"
                      title="复制我的指令"
                    >
                      {copiedIdx === idx ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      <span className={copiedIdx === idx ? 'text-emerald-500 font-semibold' : ''}>
                        {copiedIdx === idx ? '已复制' : '复制指令'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          // Assistant 响应卡片
          return (
            <div key={idx} className="flex flex-col items-start space-y-1.5 animate-fadeIn w-full">
              <div className="flex items-center gap-2 text-xs pl-1">
                <div className="w-5 h-5 rounded-md bg-accent/20 text-accent flex items-center justify-center text-xs shadow-2xs">
                  <Bot size={13} />
                </div>
                <span className="font-bold text-text-primary">Codex Agent</span>
                {msg.model && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-bg-card border border-border/80 text-text-muted">
                    {msg.model}
                  </span>
                )}
              </div>

              <div className="w-full bg-bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3 transition-all">
                {/* 思考过程 Accordion */}
                {msg.thinking && (
                  <div className="border border-border/80 rounded-xl overflow-hidden bg-bg-sidebar/40">
                    <button
                      onClick={() => toggleThinking(idx)}
                      className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={13} className="text-accent" />
                        <span>思考过程分析</span>
                      </span>
                      {expandedThinking[idx] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {expandedThinking[idx] && (
                      <div className="px-3.5 py-2.5 text-xs text-text-muted border-t border-border/60 bg-bg-base/40 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto select-text">
                        {msg.thinking}
                      </div>
                    )}
                  </div>
                )}

                {/* 正文内容 */}
                <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap break-words select-text">
                  {msg.content}
                </div>

                {/* 卡片底部操作栏 */}
                <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[11px] text-text-muted">
                  <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  <button
                    onClick={() => copyToClipboard(msg.content, idx)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-[11px] font-medium"
                    title="复制回答"
                  >
                    {copiedIdx === idx ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                    <span className={copiedIdx === idx ? 'text-emerald-500 font-semibold' : ''}>
                      {copiedIdx === idx ? '已复制' : '复制回答'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex flex-col items-start space-y-1.5 animate-fadeIn">
            <div className="flex items-center gap-2 text-xs text-text-muted font-medium">
              <div className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] animate-pulse">
                <Bot size={12} />
              </div>
              <span className="font-semibold text-text-primary">Codex Agent</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                {currentModel}
              </span>
            </div>
            <div className="w-full bg-bg-card border border-accent/40 rounded-xl p-4 shadow-sm space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs text-text-secondary">
                <div className="flex gap-1 items-center">
                  <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                  <span className="w-2 h-2 rounded-full bg-accent/70 animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-accent/40 animate-pulse" />
                </div>
                <span className="font-medium text-text-primary">
                  正在深度思考并实时组织回复中...
                </span>
              </div>
              <div className="h-1.5 w-full bg-bg-base rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-accent to-accent-secondary w-2/3 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        )}

        <div ref={streamEndRef} />
      </div>

      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="fixed bottom-24 right-8 z-30 p-2.5 bg-bg-card-elevated hover:bg-accent hover:text-white border border-border shadow-lg rounded-full text-text-secondary transition-all transform hover:scale-110 flex items-center gap-1.5 text-xs group"
          title="回到底部最新消息"
        >
          <ArrowDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
          <span className="font-medium pr-1">回到底部</span>
        </button>
      )}
    </div>
  );
};

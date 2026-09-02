import React, { useEffect, useRef, useState } from 'react';
import { Bot, User, ChevronDown, ChevronRight, Copy, Check, Sparkles } from 'lucide-react';
import { ChatMessage } from '@/types/session';

interface ChatStreamProps {
  messages: ChatMessage[];
  onOpenLightbox: (src: string) => void;
}

export const ChatStream: React.FC<ChatStreamProps> = ({ messages, onOpenLightbox }) => {
  const streamEndRef = useRef<HTMLDivElement>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    <div className="flex-1 overflow-y-auto px-2 sm:px-4 md:px-6 py-6 space-y-6">
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
                <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
                  <span>您</span>
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">
                    <User size={12} />
                  </div>
                </div>

                {/* 用户气泡 */}
                <div className="max-w-[85%] bg-blue-600/10 dark:bg-blue-950/40 border border-blue-500/30 rounded-2xl rounded-tr-xs p-3.5 text-xs text-text-primary shadow-xs leading-relaxed break-words space-y-2">
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
                            className="max-h-[160px] max-w-[240px] object-cover rounded-lg border border-border cursor-zoom-in hover:brightness-105 transition-all"
                          />
                        );
                      })}
                    </div>
                  )}
                  {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
                </div>
              </div>
            );
          }

          // AI 消息卡片 (占满 820px 居中容器)
          return (
            <div key={idx} className="flex flex-col items-start space-y-2 animate-fadeIn w-full">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center text-xs">
                  <Bot size={14} />
                </div>
                <span className="font-bold text-text-primary">Codex Agent</span>
                {msg.model && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-bg-card border border-border text-text-muted">
                    {msg.model}
                  </span>
                )}
              </div>

              <div className="w-full bg-bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
                {/* 思考过程 Accordion */}
                {msg.thinking && (
                  <div className="border border-border/80 rounded-lg overflow-hidden bg-bg-sidebar/50">
                    <button
                      onClick={() => toggleThinking(idx)}
                      className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={13} className="text-amber-400" />
                        思考过程分析
                      </span>
                      {expandedThinking[idx] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {expandedThinking[idx] && (
                      <div className="px-3.5 py-2.5 text-xs text-text-muted border-t border-border bg-bg-base/40 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                        {msg.thinking}
                      </div>
                    )}
                  </div>
                )}

                {/* 正文内容 */}
                <div className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap break-words">
                  {msg.content}
                </div>

                {/* 卡片底部操作栏 */}
                <div className="flex items-center justify-between pt-2 border-t border-border-light text-[11px] text-text-muted">
                  <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  <button
                    onClick={() => copyToClipboard(msg.content, idx)}
                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
                    title="复制回答"
                  >
                    {copiedIdx === idx ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    <span>{copiedIdx === idx ? '已复制' : '复制'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={streamEndRef} />
      </div>
    </div>
  );
};

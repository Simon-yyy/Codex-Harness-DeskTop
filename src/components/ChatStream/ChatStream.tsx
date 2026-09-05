import React, { useEffect, useRef, useState } from 'react';
import { Bot, User, ChevronDown, ChevronRight, Copy, Check, Sparkles, ArrowDown, Loader2, Undo2 } from 'lucide-react';
import { ChatMessage } from '@/types/session';
import { PermissionMode } from '@/types/electron';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatStreamProps {
  messages: ChatMessage[];
  isGenerating?: boolean;
  currentModel?: string;
  onOpenLightbox: (src: string) => void;
  permissionMode?: PermissionMode;
  onFileWritten?: (filePath: string) => void;
  onRevokeMessage?: (messageIndex: number) => void;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  isGenerating = false,
  currentModel = 'gpt-5.6-sol',
  onOpenLightbox,
  permissionMode,
  onFileWritten,
  onRevokeMessage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const prevMessagesLengthRef = useRef(messages.length);

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    streamEndRef.current?.scrollIntoView({ behavior });
  };

  // 监听用户滚动位置：当向上滚动超过 80px 时锁定自动置底，避免强拉视口
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isFarFromBottom = scrollHeight - scrollTop - clientHeight > 80;
    userScrolledUpRef.current = isFarFromBottom;
    setShowScrollBottom(isFarFromBottom);
  };

  // 消息更新或生成状态切换时的自适应滚动逻辑
  useEffect(() => {
    // 若新增了消息（例如用户刚发送或新一轮对话开启），重置用户意图锁并强制平滑置底
    if (messages.length > prevMessagesLengthRef.current) {
      userScrolledUpRef.current = false;
      setShowScrollBottom(false);
      scrollToBottom('smooth');
    } else if (!userScrolledUpRef.current) {
      // 流式 Token 涌入时：只要用户没有手动往上翻，就平滑跟随滚动
      scrollToBottom(isGenerating ? 'smooth' : 'auto');
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, isGenerating]);

  const handleManualScrollToBottom = () => {
    userScrolledUpRef.current = false;
    setShowScrollBottom(false);
    scrollToBottom('smooth');
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
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 sm:px-6 md:px-8 py-6 space-y-6 scroll-smooth"
      >
        <div className="w-full max-w-4xl 2xl:max-w-5xl mx-auto space-y-7">
        {messages.length === 0 && (
          <div className="text-center py-20 text-text-muted space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto text-xl shadow-xs">
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

                {/* 用户气泡卡片：自然柔和微阴影，杜绝生硬线框 */}
                <div className="max-w-[88%] sm:max-w-2xl bg-bg-card border border-border/70 rounded-2xl rounded-tr-xs p-4 text-xs text-text-primary shadow-xs space-y-2.5 transition-all">
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

                  {/* 用户卡片底部操作栏 (时间戳 + 撤回修改 + 复制指令) */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px] text-text-muted">
                    <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    <div className="flex items-center gap-1.5">
                      {onRevokeMessage && (
                        <button
                          type="button"
                          onClick={() => onRevokeMessage(idx)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-accent transition-colors text-[11px] font-medium cursor-pointer"
                          title="撤回该提问并回填到输入框重新编辑"
                        >
                          <Undo2 size={11} />
                          <span>撤回修改</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(msg.content, idx)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-[11px] font-medium cursor-pointer"
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
              </div>
            );
          }

          // Assistant 回复：彻底去盒子化，如同 Claude/Cursor 的纯净无缝画布 (Borderless Fluid Layout)
          return (
            <div key={idx} className="flex flex-col items-start space-y-2.5 animate-fadeIn w-full">
              {/* Agent 头像与模型标签 */}
              <div className="flex items-center gap-2 text-xs">
                <div className="w-5 h-5 rounded-md bg-accent/20 text-accent flex items-center justify-center text-xs shadow-2xs">
                  <Bot size={13} />
                </div>
                <span className="font-semibold text-text-primary">Codex Agent</span>
                {msg.model && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-bg-card border border-border/70 text-text-muted">
                    {msg.model}
                  </span>
                )}
              </div>

              {/* 沉浸式内容主体 (无外部大边框，自然流动) */}
              <div className="w-full pl-7 pr-1 space-y-3.5">
                {/* 极简思维链流光折叠栏 (左侧强调线 + 浅微光) */}
                {msg.thinking && (
                  <div className="border-l-2 border-accent/60 pl-3 py-1 bg-accent/5 rounded-r-lg transition-all">
                    <button
                      onClick={() => toggleThinking(idx)}
                      className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer py-0.5 font-medium"
                    >
                      <Sparkles size={12} className="text-accent animate-pulse" />
                      <span>思考过程分析</span>
                      {expandedThinking[idx] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    {expandedThinking[idx] && (
                      <div className="mt-2 text-xs text-text-muted/90 font-mono leading-relaxed max-h-72 overflow-y-auto select-text whitespace-pre-wrap border-t border-accent/15 pt-2">
                        {msg.thinking}
                      </div>
                    )}
                  </div>
                )}

                {/* 正文内容：采用对齐主流 Agent 的专业 Markdown 与代码块渲染器 */}
                <div className="text-xs text-text-primary leading-relaxed break-words select-text">
                  <MarkdownRenderer
                    content={msg.content}
                    permissionMode={permissionMode}
                    onFileWritten={onFileWritten}
                    isStreaming={isGenerating && idx === messages.length - 1}
                  />
                </div>

                {/* 底部轻量操作栏 (时间戳与复制按钮) */}
                <div className="flex items-center gap-3 pt-1 text-[11px] text-text-muted">
                  <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  <button
                    onClick={() => copyToClipboard(msg.content, idx)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-[11px] font-medium"
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

        {/* 流式思考中动画卡片 */}
        {isGenerating && (
          <div className="flex flex-col items-start space-y-2 animate-fadeIn pl-7">
            <div className="flex items-center gap-2 text-xs text-text-muted font-medium">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                <span>思考与组织中: {currentModel}</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-text-secondary py-1">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                <span className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-accent/40 animate-pulse" />
              </div>
              <span className="text-text-muted text-[11px]">
                正在流式生成实时回复...
              </span>
            </div>
          </div>
        )}

        <div ref={streamEndRef} />
        </div>
      </div>

      {/* 居中悬浮【回到底部】按钮：位于消息流正下方居中，永不遮挡输入框及右侧附件按钮 */}
      {showScrollBottom && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fadeIn">
          <button
            type="button"
            onClick={handleManualScrollToBottom}
            className="pointer-events-auto px-3.5 py-1.5 bg-bg-card/95 backdrop-blur-md hover:bg-accent hover:text-white border border-border shadow-lg rounded-full text-text-secondary transition-all transform hover:scale-105 flex items-center gap-1.5 text-xs font-medium cursor-pointer active:scale-95 group"
            title="回到底部最新消息"
          >
            <ArrowDown size={13} className="text-accent group-hover:text-white transition-colors" />
            <span>回到底部</span>
          </button>
        </div>
      )}
    </div>
  );
};

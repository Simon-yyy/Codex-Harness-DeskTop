import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, Copy, Check, ArrowDown, Loader2, Undo2,
  ArrowLeftRight, ThumbsUp, ThumbsDown, RotateCcw, Sparkles
} from 'lucide-react';
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
  onPermissionChange?: (mode: PermissionMode) => void;
  onRevokeMessage?: (messageIndex: number) => void;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  isGenerating = false,
  currentModel = 'gpt-5.6-sol',
  onOpenLightbox,
  permissionMode,
  onFileWritten,
  onPermissionChange,
  onRevokeMessage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const prevMessagesLengthRef = useRef(messages.length);

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [feedbackState, setFeedbackState] = useState<Record<number, 'up' | 'down' | null>>({});

  // 动态计时器：流式生成时实时累加秒数
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(1);
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isGenerating) {
      setLiveElapsedSeconds(1);
      timer = setInterval(() => {
        setLiveElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timer) clearInterval(timer);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isGenerating]);

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
    if (messages.length > prevMessagesLengthRef.current) {
      userScrolledUpRef.current = false;
      setShowScrollBottom(false);
      scrollToBottom('smooth');
    } else if (!userScrolledUpRef.current) {
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
        className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-14 lg:px-20 py-8 space-y-7 scroll-smooth"
      >
        <div className="w-full max-w-3xl 2xl:max-w-4xl mx-auto space-y-8">
          {/* 空会话欢迎屏 */}
          {messages.length === 0 && (
            <div className="text-center py-24 text-text-muted space-y-3.5">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto text-xl shadow-xs">
                <Sparkles size={22} />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">系统已准备就绪</h3>
              <p className="text-xs max-w-sm mx-auto leading-relaxed text-text-muted/80">
                输入您的编程需求，或使用 <span className="font-mono text-accent">/</span> 快捷指令与工程技能开启高效协作。
              </p>
            </div>
          )}

          {/* 遍历渲染对话流 */}
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isLastMessage = idx === messages.length - 1;

            // 检测模型跨轮变动：当本轮助手消息的模型与上一次记录不同时，渲染居中精致切换指示线
            let modelSwitchBanner: React.ReactNode = null;
            if (!isUser && msg.model) {
              // 寻找更早一条助手消息的模型
              let prevModel: string | null = null;
              for (let i = idx - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant' && messages[i].model) {
                  prevModel = messages[i].model!;
                  break;
                }
              }
              if (prevModel && prevModel !== msg.model) {
                modelSwitchBanner = (
                  <div key={`model_switch_${idx}`} className="flex items-center justify-center my-6 gap-3 select-none text-text-muted/60">
                    <div className="h-[1px] bg-border/40 flex-1 max-w-[120px] sm:max-w-[180px]" />
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      <ArrowLeftRight size={11} className="text-text-muted/70" />
                      <span>模型已切换 {prevModel} → {msg.model}</span>
                    </div>
                    <div className="h-[1px] bg-border/40 flex-1 max-w-[120px] sm:max-w-[180px]" />
                  </div>
                );
              }
            }

            // 用户提问消息气泡（右对齐、精巧圆角药丸、去冗余边框与头像，悬停微现操作）
            if (isUser) {
              return (
                <div key={idx} className="group flex flex-col items-end animate-fadeIn w-full">
                  {/* 气泡主体 */}
                  <div className="min-w-[68px] max-w-[85%] sm:max-w-xl bg-bg-card border border-border/80 hover:border-accent/40 rounded-2xl rounded-tr-xs px-4 py-2 text-[13px] text-text-primary shadow-2xs transition-all select-text">
                    {/* 图片附件预览 */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.images.map((rawSrc, imgIdx) => {
                          const imgSrc = formatImageSrc(rawSrc);
                          return (
                            <img
                              key={imgIdx}
                              src={imgSrc}
                              alt="提问附件"
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

                    {/* 用户提问文本内容 */}
                    {msg.content && (
                      <div className="whitespace-pre-wrap leading-relaxed break-words font-normal">
                        {msg.content}
                      </div>
                    )}
                  </div>

                  {/* 悬停微操作栏 (正常文档流，杜绝 absolute 重叠与文字换行竖排) */}
                  <div className="h-5 flex items-center justify-end gap-2 text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity select-none pt-0.5 pr-1 whitespace-nowrap">
                    {onRevokeMessage && (
                      <button
                        type="button"
                        onClick={() => onRevokeMessage(idx)}
                        className="flex items-center gap-1 hover:text-accent transition-colors cursor-pointer"
                        title="撤回修改该提问并回填到输入框重新编辑"
                      >
                        <Undo2 size={10} />
                        <span>撤回修改</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(msg.content, idx)}
                      className="flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer"
                      title="复制我的提问"
                    >
                      {copiedIdx === idx ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                      <span>{copiedIdx === idx ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                </div>
              );
            }

            // 助手回复（通栏纯净排版、思考/工作时间折叠栏、细分隔线、底部微图标操作区）
            const workSeconds = (isGenerating && isLastMessage)
              ? liveElapsedSeconds
              : Math.max(1, Math.round((msg.thinking?.length || 120) / 45));

            return (
              <React.Fragment key={idx}>
                {modelSwitchBanner}

                <div className="flex flex-col items-start w-full animate-fadeIn space-y-2">
                  {/* 1. 顶部思考与工作状态指示条 (对齐 "已工作 10 秒 〉" 质感) */}
                  {(msg.thinking || (isGenerating && isLastMessage)) && (
                    <div className="w-full pb-2 border-b border-border/40 mb-1">
                      <button
                        type="button"
                        onClick={() => toggleThinking(idx)}
                        className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary transition-colors cursor-pointer py-0.5 select-none font-medium"
                      >
                        {isGenerating && isLastMessage ? (
                          <span className="flex items-center gap-1.5 text-accent">
                            <Loader2 size={12} className="animate-spin" />
                            <span>正在工作 {liveElapsedSeconds} 秒</span>
                          </span>
                        ) : (
                          <span>已工作 {workSeconds} 秒</span>
                        )}
                        {expandedThinking[idx] ? (
                          <ChevronDown size={13} className="text-text-muted" />
                        ) : (
                          <ChevronRight size={13} className="text-text-muted" />
                        )}
                      </button>

                      {/* 展开的深度思维链内容 */}
                      {expandedThinking[idx] && msg.thinking && (
                        <div className="mt-2 text-xs text-text-muted/80 font-mono leading-relaxed max-h-72 overflow-y-auto select-text whitespace-pre-wrap bg-bg-card/40 border border-border/30 rounded-lg p-3">
                          {msg.thinking}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. 助手正文排版（通栏无边框、行高舒展、大模型专业渲染器） */}
                  <div className="w-full text-[13px] text-text-primary leading-[1.75] break-words select-text">
                    <MarkdownRenderer
                      content={msg.content}
                      permissionMode={permissionMode}
                      onFileWritten={onFileWritten}
                      onPermissionChange={onPermissionChange as any}
                      isStreaming={isGenerating && isLastMessage}
                    />
                  </div>

                  {/* 3. 底部轻量微图标动作栏 (复制、点赞、点踩、重新生成、时间戳) */}
                  <div className="flex items-center gap-2 pt-1 text-text-muted select-none">
                    {/* 复制 */}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(msg.content, idx)}
                      className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                      title="复制完整回答"
                    >
                      {copiedIdx === idx ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>

                    {/* 点赞 */}
                    <button
                      type="button"
                      onClick={() => setFeedbackState(prev => ({ ...prev, [idx]: prev[idx] === 'up' ? null : 'up' }))}
                      className={`p-1 rounded hover:bg-bg-hover transition-colors cursor-pointer ${
                        feedbackState[idx] === 'up' ? 'text-emerald-400' : 'text-text-muted hover:text-text-primary'
                      }`}
                      title="赞同回答"
                    >
                      <ThumbsUp size={13} />
                    </button>

                    {/* 点踩 */}
                    <button
                      type="button"
                      onClick={() => setFeedbackState(prev => ({ ...prev, [idx]: prev[idx] === 'down' ? null : 'down' }))}
                      className={`p-1 rounded hover:bg-bg-hover transition-colors cursor-pointer ${
                        feedbackState[idx] === 'down' ? 'text-rose-400' : 'text-text-muted hover:text-text-primary'
                      }`}
                      title="对回答不满意"
                    >
                      <ThumbsDown size={13} />
                    </button>

                    {/* 重新生成 / 撤回上一轮重试 */}
                    {onRevokeMessage && idx > 0 && (
                      <button
                        type="button"
                        onClick={() => onRevokeMessage(idx - 1)}
                        className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                        title="重新编辑上一轮提问"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}

                    {/* 时间戳 */}
                    <span className="text-[10px] text-text-muted/60 ml-1 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          <div ref={streamEndRef} className="h-2" />
        </div>
      </div>

      {/* 浮动置底按钮 */}
      {showScrollBottom && (
        <button
          onClick={handleManualScrollToBottom}
          className="absolute bottom-4 right-8 p-2.5 rounded-full bg-bg-card border border-border shadow-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all animate-bounce z-10 cursor-pointer"
          title="滚动到底部"
        >
          <ArrowDown size={15} />
        </button>
      )}
    </div>
  );
};

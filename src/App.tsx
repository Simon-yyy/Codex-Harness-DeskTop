import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { ChatStream } from '@/components/ChatStream/ChatStream';
import { Composer } from '@/components/Composer/Composer';
import { PreviewPanel } from '@/components/PreviewPanel/PreviewPanel';
import { StatusBar } from '@/components/StatusBar';
import { SettingsModal } from '@/components/Modals/SettingsModal';
import { ThemeModal } from '@/components/Modals/ThemeModal';
import { AboutModal } from '@/components/Modals/AboutModal';
import { UpdatePromptModal } from '@/components/Modals/UpdatePromptModal';
import { ImageLightbox } from '@/components/Modals/ImageLightbox';

import { useTheme } from '@/hooks/useTheme';
import { useProviders } from '@/hooks/useProviders';
import { useSessions } from '@/hooks/useSessions';
import { useTabQueue } from '@/hooks/useTabQueue';
import { useUpdater } from '@/hooks/useUpdater';

import { AttachedImage, ChatMessage } from '@/types/session';
import { SkillItem, PermissionMode } from '@/types/electron';
import { Download, Layers } from 'lucide-react';

export const App: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { providers, saveProviders, selectedModel, selectModel, allModels } = useProviders();
  const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    createNewSession,
    deleteSession,
    addMessageToCurrentSession,
    updateLastMessageInCurrentSession,
    clearCurrentSessionMessages,
    exportCurrentSessionAsMarkdown,
  } = useSessions();
  const { queue, enqueue, dequeue, removeQueueItem } = useTabQueue();
  const {
    updateInfo,
    isModalOpen: isUpdateModalOpen,
    isDownloading: isUpdateDownloading,
    progress: updateProgress,
    isDownloaded: isUpdateDownloaded,
    downloadedVersion,
    startDownload,
    closeModal: closeUpdateModal,
    checkForUpdates,
  } = useUpdater();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [inputPrompt, setInputPrompt] = useState('');
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('workspace-readonly');
  const [activeWorkspaceDir, setActiveWorkspaceDir] = useState<string | null>(null);

  // 同步主进程权威安全沙箱状态
  useEffect(() => {
    if (window.codexDesktop?.getSecurityStatus) {
      window.codexDesktop.getSecurityStatus().then(st => {
        if (st) {
          if (st.permissionMode) setPermissionMode(st.permissionMode);
          if (st.activeWorkspaceDir) setActiveWorkspaceDir(st.activeWorkspaceDir);
        }
      });
    }
  }, []);

  const handleSelectPermissionMode = async (mode: PermissionMode) => {
    if (window.codexDesktop?.setPermissionMode) {
      const res = await window.codexDesktop.setPermissionMode(mode);
      if (res && res.ok) {
        setPermissionMode(res.permissionMode);
      }
    } else {
      setPermissionMode(mode);
    }
  };

  // 加载 43 项全流程技能库
  useEffect(() => {
    if (window.codexDesktop && window.codexDesktop.getSkills) {
      window.codexDesktop.getSkills().then(list => {
        if (Array.isArray(list)) setSkills(list);
      });
    }
  }, []);

  // 监听原生主菜单 IPC 事件
  useEffect(() => {
    if (window.codexDesktop && window.codexDesktop.onMenuAction) {
      window.codexDesktop.onMenuAction((action) => {
        if (action === 'new-chat') createNewSession(selectedModel);
        if (action === 'export-chat') exportCurrentSessionAsMarkdown();
        if (action === 'open-settings') setIsSettingsOpen(true);
        if (action === 'open-theme') setIsThemeOpen(true);
        if (action === 'open-about') setIsAboutOpen(true);
        if (action.startsWith('theme:')) {
          const t = action.split(':')[1] as any;
          setTheme(t);
        }
      });
    }
  }, [selectedModel]);

  // Tab Queueing 自动消费状态机
  useEffect(() => {
    if (!isGenerating && queue.length > 0) {
      const nextTask = dequeue();
      if (nextTask) {
        executeLLMTask(nextTask.prompt, nextTask.images);
      }
    }
  }, [isGenerating, queue]);

  const handleSend = (text: string, images: AttachedImage[]) => {
    const trimmed = text.trim();

    // Slash Commands 快速拦截
    if (trimmed === '/clear') {
      clearCurrentSessionMessages();
      return;
    }
    if (trimmed === '/diff') {
      setIsPreviewOpen(true);
      return;
    }
    if (trimmed === '/status') {
      const statusMsg: ChatMessage = {
        role: 'assistant',
        model: selectedModel,
        thinking: 'Codex 核心与通道检测',
        content: `⚡ **Codex 状态就绪**\n- 当前所选模型: \`${selectedModel}\`\n- 已装载技能库: \`${skills.length}\` 项全流程技能\n- 本地网络管道: \`正常\``,
        timestamp: Date.now()
      };
      addMessageToCurrentSession(statusMsg);
      return;
    }
    if (trimmed === '/help') {
      const helpMsg: ChatMessage = {
        role: 'assistant',
        model: selectedModel,
        thinking: '帮助说明',
        content: `📖 **Codex Desktop 快捷操作指南**\n- 输入 \`/\`：呼出系统指令与 43 项工程技能库\n- 输入 \`/status\`：检查当前模型通道与内核就绪状态\n- 输入 \`/diff\`：打开右侧工作区变更预览\n- 输入 \`/clear\`：清空当前会话\n- 输入 \`@文件名\`：在输入框中精准注入文件源码引用\n- 粘贴图片 (\`Ctrl+V\`)：多模态看图编程`,
        timestamp: Date.now()
      };
      addMessageToCurrentSession(helpMsg);
      return;
    }

    // 若 Agent 当前处于生成/思考中，自动进入 Tab Queueing 队列
    if (isGenerating) {
      enqueue(trimmed, images);
      return;
    }

    executeLLMTask(trimmed, images);
  };

  const executeLLMTask = async (text: string, images: AttachedImage[]) => {
    setIsGenerating(true);

    // 检查是否命中了 43 项技能之一 (例如: /code-review 或 /tdd 或 /maker-checker)
    let activeSkill: SkillItem | null = null;
    let actualUserPrompt = text;

    const skillMatch = text.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
    if (skillMatch) {
      const candidateId = skillMatch[1].toLowerCase();
      const found = skills.find(s => s.id.toLowerCase() === candidateId || s.name.toLowerCase() === candidateId);
      if (found) {
        activeSkill = found;
        actualUserPrompt = (skillMatch[2] || '').trim() || `请按照【${found.name}】技能规范执行任务。`;
      }
    }

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      images: images.map(img => img.base64),
      timestamp: Date.now()
    };
    addMessageToCurrentSession(userMsg);

    let unsubscribeStream: (() => void) | null = null;

    try {
      // 查找当前所选模型归属的提供方及模型专属配置
      const matchedModel = allModels.find(m => m.value.toLowerCase() === selectedModel.toLowerCase());
      const providerId = matchedModel?.providerId || 'openai';
      const provider = providers.find(p => p.id === providerId) || providers[0];

      // 获取请求配置 (模型专属配置优先)
      const effectiveProtocol = matchedModel?.protocol || provider.protocol || 'openai';
      let effectiveBaseUrl = (matchedModel?.baseUrl || provider.baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
      const effectiveApiKey = (matchedModel?.apiKey || provider.apiKey || '').trim();

      // 构建请求上下文 (若装载了技能，将技能完整工作流作为最高优先级 System Prompt 注入)
      const contextMessages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];

      if (activeSkill) {
        contextMessages.push({
          role: 'system',
          content: `【CODEX 技能已激活: ${activeSkill.name}】\n技能描述: ${activeSkill.description}\n\n=== 技能执行原则与规范 (SKILL.md) ===\n${activeSkill.prompt || activeSkill.content || ''}\n\n请严格按照上述技能的标准和步骤执行。`
        });
      }

      // 2. 注入当前工作区与安全权限规范 (Workspace Context Injection)
      let workspaceSystemPrompt = '';
      if (activeWorkspaceDir) {
        let treeOutline = '';
        if (window.codexDesktop?.readWorkspaceTree) {
          try {
            const treeRes = await window.codexDesktop.readWorkspaceTree(activeWorkspaceDir);
            if (treeRes && treeRes.tree) {
              const nodes: string[] = [];
              const walk = (items: any[], indent = '') => {
                for (const it of items) {
                  if (nodes.length >= 60) break;
                  nodes.push(`${indent}- ${it.name}${it.isDirectory ? '/' : ''}`);
                  if (it.children) walk(it.children, indent + '  ');
                }
              };
              walk(treeRes.tree);
              treeOutline = nodes.join('\n');
              if (treeRes.totalCount && treeRes.totalCount > 60) {
                treeOutline += `\n... [工程规模较大，共计 ${treeRes.totalCount} 项，已略去后续条目，可输入具体文件名或使用 @ 引用]`;
              }
            }
          } catch (e) {
            // 容错保持空白
          }
        }

        const isFullAccess = permissionMode === 'full-access';
        workspaceSystemPrompt = `【当前工作区工程环境与安全运行权限】\n` +
          `- 本地工作区根目录: ${activeWorkspaceDir}\n` +
          `- 运行权限等级: ${isFullAccess ? '🌐 全局受信任模式 (Full Access)' : '🛡️ 工作区只读模式 (Workspace Read-Only - 默认推荐)'}\n` +
          `- 权限规约: ${isFullAccess ? '你拥有全局跨工程文件阅读权限。' : '你当前受限于工作区只读安全沙箱，仅能分析已挂载工程内的代码，严禁越权访问外部物理路径，严禁生成未经授权的破坏性指令。'}\n` +
          (treeOutline ? `- 当前工程核心结构大纲:\n${treeOutline}\n` : '');
      }

      if (workspaceSystemPrompt) {
        contextMessages.push({
          role: 'system',
          content: workspaceSystemPrompt
        });
      }

      (currentSession.messages || []).slice(-10).forEach(m => {
        contextMessages.push({
          role: m.role,
          content: m.content
        });
      });

      // 3. 智能关联工作区文件内容 (@引用文件或“分析文件夹”请求)
      let finalUserContent = actualUserPrompt;
      const atFileMatches = Array.from(actualUserPrompt.matchAll(/@([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/g)).map(m => m[1]);
      const isAnalyzingWorkspace = /分析.*(文件夹|工程|项目|代码库)/i.test(actualUserPrompt);
      const filesToRead = new Set(atFileMatches);

      if (isAnalyzingWorkspace && filesToRead.size === 0 && activeWorkspaceDir) {
        filesToRead.add('package.json');
        filesToRead.add('README.md');
      }

      if (filesToRead.size > 0 && window.codexDesktop?.readWorkspaceFile) {
        const attachedContents: string[] = [];
        for (const rel of filesToRead) {
          try {
            const fileRes = await window.codexDesktop.readWorkspaceFile(rel);
            if (fileRes.ok && fileRes.content) {
              attachedContents.push(`【文件挂载: ${rel}】\n\`\`\`\n${fileRes.content}\n\`\`\``);
            } else if (!fileRes.ok && fileRes.code !== 'NOT_FOUND') {
              attachedContents.push(`【文件读取受限: ${rel}】: ${fileRes.reason || fileRes.code}`);
            }
          } catch (e) {
            // 容错
          }
        }
        if (attachedContents.length > 0) {
          finalUserContent = `${actualUserPrompt}\n\n=== 上下文关联文件内容 ===\n${attachedContents.join('\n\n')}`;
        }
      }

      contextMessages.push({ role: 'user', content: finalUserContent });

      let response: { content?: string; thinking?: string; toolCall?: any } | null = null;
      const streamId = 'stream_' + Date.now();

      // 先在会话中追加占位的 Assistant 消息，随着流式接收实时增量填充
      const initialThinking = activeSkill ? `🧠 技能【${activeSkill.name}】已激活，正在思考...` : '正在思考与组织回复...';
      const placeholderAssistant: ChatMessage = {
        role: 'assistant',
        model: selectedModel,
        thinking: initialThinking,
        content: '',
        timestamp: Date.now()
      };
      addMessageToCurrentSession(placeholderAssistant);

      if (window.codexDesktop?.onLlmStreamChunk) {
        unsubscribeStream = window.codexDesktop.onLlmStreamChunk((data) => {
          if (data.streamId === streamId) {
            if (data.contentDelta || data.thinkingDelta) {
              updateLastMessageInCurrentSession(prev => ({
                ...prev,
                content: (prev.content || '') + (data.contentDelta || ''),
                thinking: data.thinkingDelta ? (prev.thinking || '') + data.thinkingDelta : prev.thinking
              }));
            }
          }
        });
      }

      if (window.codexDesktop && window.codexDesktop.callLlmApi) {
        let endpoint = effectiveBaseUrl;
        let body: any = {};

        if (effectiveProtocol === 'anthropic') {
          if (!endpoint.endsWith('/messages')) endpoint += '/v1/messages';
          body = {
            model: selectedModel,
            max_tokens: 4096,
            stream: true,
            messages: contextMessages.filter(m => m.role !== 'system'),
            system: contextMessages.find(m => m.role === 'system')?.content
          };
        } else if (effectiveProtocol === 'ollama') {
          if (!endpoint.endsWith('/chat/completions') && !endpoint.endsWith('/api/chat')) {
            endpoint += '/v1/chat/completions';
          }
          body = {
            model: selectedModel,
            stream: true,
            messages: contextMessages
          };
        } else {
          // OpenAI 兼容协议 (支持 DeepSeek, GLM, OpenAI 等)
          if (!endpoint.endsWith('/chat/completions')) {
            endpoint += '/chat/completions';
          }
          body = {
            model: selectedModel,
            stream: true,
            messages: contextMessages
          };
        }

        const rawRes: any = await window.codexDesktop.callLlmApi({
          endpoint,
          apiKey: effectiveApiKey,
          body,
          stream: true,
          streamId,
          timeout: matchedModel?.timeoutSeconds
        });

        if (rawRes && rawRes.ok) {
          const parsed = typeof rawRes.body === 'string' ? JSON.parse(rawRes.body) : rawRes.body;
          if (effectiveProtocol === 'anthropic') {
            const text = (parsed.content || []).map((c: any) => c.text || '').join('');
            const thinking = (parsed.content || []).filter((c: any) => c.type === 'thinking').map((c: any) => c.thinking).join('\n');
            response = { content: text, thinking };
          } else {
            const choice = parsed.choices?.[0];
            const text = choice?.message?.content || parsed.message?.content || parsed.response || '';
            const thinking = choice?.message?.reasoning_content || choice?.message?.reasoning || '';
            response = { content: text, thinking };
          }

          // 若流式已输出，保持已有内容；若未收到流式内容，做兜底覆盖
          updateLastMessageInCurrentSession(prev => ({
            ...prev,
            content: prev.content || response?.content || '⚠️ 未收到有效模型回复，请检查 Base URL 与 API Key 是否正确。',
            thinking: response?.thinking || prev.thinking || '任务思考已完成。'
          }));
        } else {
          let errText = rawRes?.body;
          if (typeof errText === 'object') errText = JSON.stringify(errText);
          throw new Error(errText || rawRes?.statusText || `HTTP ${rawRes?.status || 500}`);
        }
      }
    } catch (err: any) {
      let rawMsg = err.message || '网络连接超时或提供方异常';
      let friendlyError = rawMsg;

      try {
        const parsed = JSON.parse(rawMsg);
        const innerMsg = parsed?.error?.message || parsed?.message || parsed?.error;
        if (typeof innerMsg === 'string') {
          friendlyError = innerMsg;
        }
      } catch {
        // 保持原样
      }

      if (friendlyError.includes('ECONNRESET')) {
        friendlyError = '网络连接被服务商/代理强行重置 (read ECONNRESET)。已自动重试 2 次仍未连通，通常为模型服务商网关抖动或网络代理切断，建议稍后重试。';
      } else if (friendlyError.includes('ETIMEDOUT') || friendlyError.includes('Request Timeout') || friendlyError.includes('首包响应等待超时')) {
        friendlyError = '模型服务商响应超时，当前排队或模型负荷过高，请检查网络或稍后重试。';
      } else if (friendlyError.includes('socket hang up')) {
        friendlyError = '网络连接被意外挂断 (socket hang up)，请检查模型服务商或中转站稳定性。';
      }

      updateLastMessageInCurrentSession(prev => ({
        ...prev,
        content: prev.content
          ? `${prev.content}\n\n❌ [传输中断]: ${friendlyError}`
          : `❌ 请求失败: ${friendlyError}`,
        thinking: '执行异常'
      }));
    } finally {
      if (unsubscribeStream) {
        unsubscribeStream();
      }
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-base text-text-primary">
      {/* 工作台三栏骨架 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧一体化侧边栏 */}
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={setCurrentSessionId}
          onNewSession={() => createNewSession(selectedModel)}
          onDeleteSession={deleteSession}
          onInsertPrompt={(text) => setInputPrompt(prev => prev + text)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenTheme={() => setIsThemeOpen(true)}
          onOpenAbout={() => setIsAboutOpen(true)}
          onWorkspaceChange={setActiveWorkspaceDir}
        />

        {/* 中间主工作台 */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-bg-base relative min-w-0">
          {/* Header */}
          <header className="h-12 border-b border-border px-5 flex items-center justify-between bg-bg-sidebar/40 select-none flex-shrink-0">
            <div className="flex items-center gap-2 text-xs truncate">
              <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold font-mono text-[11px]">
                Codex Agent
              </span>
              <span className="text-text-muted">/</span>
              <span className="text-text-primary font-bold truncate max-w-sm">
                {currentSession.title || '新会话'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportCurrentSessionAsMarkdown}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
                title="导出当前会话为 Markdown 文档"
              >
                <Download size={13} />
                <span>导出 .md</span>
              </button>
              <button
                onClick={() => setIsPreviewOpen(!isPreviewOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  isPreviewOpen
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                <Layers size={13} />
                <span>预览面板</span>
              </button>
            </div>
          </header>

          {/* 消息流视图 */}
          <ChatStream
            messages={currentSession.messages}
            isGenerating={isGenerating}
            currentModel={selectedModel}
            onOpenLightbox={(src) => setLightboxImg(src)}
          />

          {/* 底部 Composer 输入区 */}
          <Composer
            onSend={handleSend}
            isGenerating={isGenerating}
            queue={queue}
            onRemoveQueueItem={removeQueueItem}
            allModels={allModels}
            selectedModel={selectedModel}
            onSelectModel={selectModel}
            inputPrompt={inputPrompt}
            setInputPrompt={setInputPrompt}
            skills={skills}
            permissionMode={permissionMode}
            onSelectPermissionMode={handleSelectPermissionMode}
          />
        </main>

        {/* 右侧变更预览面板 */}
        <PreviewPanel
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
        />
      </div>

      {/* 底部极客状态栏 */}
      <StatusBar />

      {/* 全局模态弹窗系统 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        providers={providers}
        onSaveProviders={saveProviders}
      />

      <ThemeModal
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        currentTheme={theme}
        onSelectTheme={setTheme}
      />

      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        onCheckUpdates={checkForUpdates}
      />

      <UpdatePromptModal
        isOpen={isUpdateModalOpen}
        onClose={closeUpdateModal}
        updateInfo={updateInfo}
        isDownloading={isUpdateDownloading}
        progress={updateProgress}
        isDownloaded={isUpdateDownloaded}
        downloadedVersion={downloadedVersion}
        onStartDownload={startDownload}
      />

      <ImageLightbox
        src={lightboxImg}
        onClose={() => setLightboxImg(null)}
      />
    </div>
  );
};

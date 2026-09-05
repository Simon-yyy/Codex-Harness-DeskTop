import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { ChatStream } from '@/components/ChatStream/ChatStream';
import { Composer } from '@/components/Composer/Composer';
import { PreviewPanel } from '@/components/PreviewPanel/PreviewPanel';
import { StatusBar, GenerationMetrics } from '@/components/StatusBar';
import { SettingsModal } from '@/components/Modals/SettingsModal';
import { ThemeModal } from '@/components/Modals/ThemeModal';
import { AboutModal } from '@/components/Modals/AboutModal';
import { FeedbackModal } from '@/components/Modals/FeedbackModal';
import { UpdatePromptModal } from '@/components/Modals/UpdatePromptModal';
import { ImageLightbox } from '@/components/Modals/ImageLightbox';

import { useTheme } from '@/hooks/useTheme';
import { useProviders } from '@/hooks/useProviders';
import { useSessions } from '@/hooks/useSessions';
import { useTabQueue } from '@/hooks/useTabQueue';
import { useUpdater } from '@/hooks/useUpdater';

import { AttachedImage, ChatMessage } from '@/types/session';
import { SkillItem, PermissionMode, WorkspaceFileItem } from '@/types/electron';
import { Download, Layers } from 'lucide-react';

function normalizeFsPath(p?: string | null): string {
  if (!p) return '';
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export const App: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { providers, saveProviders, selectedModel, selectModel, allModels } = useProviders();
  const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    createNewSession,
    renameSession,
    updateCurrentSessionWorkspace,
    forkSession,
    toggleArchiveSession,
    moveSessionToWorkspace,
    deleteSession,
    addMessageToCurrentSession,
    updateLastMessageInCurrentSession,
    clearCurrentSessionMessages,
    exportCurrentSessionAsMarkdown,
    rollbackMessage,
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
  const [generationMetrics, setGenerationMetrics] = useState<GenerationMetrics>({
    isGenerating: false,
    firstTokenLatencyMs: null,
    speedTokPerSec: null,
    cacheHitPercent: null,
    inputTokens: null,
    outputTokens: null,
  });
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    title: string;
    filePath?: string;
    codeContent: string;
  } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [inputPrompt, setInputPrompt] = useState('');
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('workspace-readonly');
  const [activeWorkspaceDir, setActiveWorkspaceDir] = useState<string | null>(null);
  const activeStreamIdRef = useRef<string | null>(null);

  // 同步主进程权威安全沙箱状态与当前活跃会话工作区
  useEffect(() => {
    if (window.codexDesktop?.getSecurityStatus) {
      window.codexDesktop.getSecurityStatus().then(st => {
        if (st) {
          if (st.permissionMode) setPermissionMode(st.permissionMode);
          // 权威原则：以当前会话保存的工作区为最高优先级准则
          if (currentSession?.workspaceDir) {
            setActiveWorkspaceDir(currentSession.workspaceDir);
            window.codexDesktop?.setWorkspaceDir?.(currentSession.workspaceDir);
          } else {
            // 当前会话为通用独立会话，主动清理全局残留，杜绝旧项目污染
            setActiveWorkspaceDir(null);
            window.codexDesktop?.setWorkspaceDir?.(null as any);
          }
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

  // 切换会话：自动且无缝联动将工作区切实切换到该会话所属的项目目录
  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    const target = sessions.find(s => s.id === sessionId);
    const targetDir = target?.workspaceDir || null;
    setActiveWorkspaceDir(targetDir);
    if (window.codexDesktop?.setWorkspaceDir) {
      window.codexDesktop.setWorkspaceDir(targetDir);
    }
    if (targetDir) {
      localStorage.setItem('codex_workspace_dir', targetDir);
    } else {
      localStorage.removeItem('codex_workspace_dir');
    }
  };

  // 切换或挂载新工作区：激活该工作区，并自动选中属于该工作区的会话；若尚无会话，则为其新建一个专属新会话
  const handleWorkspaceChange = (path: string) => {
    setActiveWorkspaceDir(path);
    if (window.codexDesktop?.setWorkspaceDir) {
      window.codexDesktop.setWorkspaceDir(path);
    }
    if (path) {
      localStorage.setItem('codex_workspace_dir', path);
    } else {
      localStorage.removeItem('codex_workspace_dir');
    }
    const folderName = path.replace(/[\\/]$/, '').split(/[\\/]/).pop() || '工程';

    // 绝对禁止篡改当前已有会话的所属工程！
    // 检查目标工作区下是否已有属于它的会话（使用路径标准化对比，杜绝大小写与正反斜杠失配）：
    const existingInWorkspace = sessions.filter(s => normalizeFsPath(s.workspaceDir) === normalizeFsPath(path));
    if (existingInWorkspace.length > 0) {
      // 切换到目标工程下的首个会话
      setCurrentSessionId(existingInWorkspace[0].id);
    } else {
      // 若该工程下暂无任何会话，自动生成一个专属的新会话
      createNewSession(selectedModel, path, folderName);
    }
  };

  // 点击左侧文件树中任一文件：安全沙箱内读取源码并展开右侧预览抽屉
  const handleSelectFile = async (item: WorkspaceFileItem) => {
    if (item.isDirectory) return;
    try {
      if (window.codexDesktop?.readWorkspaceFile) {
        const res = await window.codexDesktop.readWorkspaceFile(item.path);
        if (res && res.content !== undefined) {
          setPreviewFile({
            title: item.name,
            filePath: item.path,
            codeContent: res.content,
          });
          setIsPreviewOpen(true);
          return;
        }
      }
    } catch (err) {
      console.error('读取预览文件异常:', err);
    }
    setPreviewFile({
      title: item.name,
      filePath: item.path,
      codeContent: `// 无法读取或内容为空: ${item.path}`,
    });
  };

  // 当代码块中的内容被安全写回磁盘时，自动拉取最新物理文件并展开右侧代码预览面板
  const handleFileWritten = async (filePath: string) => {
    if (window.codexDesktop?.readWorkspaceFile) {
      try {
        const res = await window.codexDesktop.readWorkspaceFile(filePath);
        if (res && res.ok && typeof res.content === 'string') {
          const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
          setPreviewFile({
            title: fileName,
            filePath,
            codeContent: res.content,
          });
          setIsPreviewOpen(true);
        }
      } catch (err) {
        console.error('刷新已写入文件预览失败:', err);
      }
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
        if (action === 'new-chat') {
          const folderName = activeWorkspaceDir ? activeWorkspaceDir.replace(/[\\/]$/, '').split(/[\\/]/).pop() : undefined;
          createNewSession(selectedModel, activeWorkspaceDir || undefined, folderName);
        }
        if (action === 'export-chat') exportCurrentSessionAsMarkdown();
        if (action === 'open-settings') setIsSettingsOpen(true);
        if (action === 'open-theme') setIsThemeOpen(true);
        if (action === 'open-about') setIsAboutOpen(true);
        if (action === 'open-feedback') setIsFeedbackOpen(true);
        if (action.startsWith('theme:')) {
          const t = action.split(':')[1] as any;
          setTheme(t);
        }
      });
    }
  }, [selectedModel, activeWorkspaceDir]);

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

      // 2. 注入当前会话工作区与安全权限规范 (以当前会话 currentSession.workspaceDir 为绝对准则)
      const sessionWorkspaceDir = currentSession.workspaceDir;
      let workspaceSystemPrompt = '';

      if (permissionMode === 'chat-only' || !sessionWorkspaceDir) {
        // 未绑定工作区或纯对话咨询模式：绝不注入任何工作区物理代码大纲，确保纯净独立
        workspaceSystemPrompt = `【当前运行环境: 🛡️ 通用独立对话模式】\n` +
          `- 隔离原则: 当前会话为独立通用对话，未绑定任何本地工程，已完全隔离本地物理代码大纲。\n` +
          `- 行为规约: 请专注于解答通用技术构想、架构设计或代码实现方案，无需假定或读取特定工程目录。`;
      } else {
        // 绑定了明确工作区的会话：严格针对 sessionWorkspaceDir 扫描大纲与注入根目录
        let treeOutline = '';
        if (window.codexDesktop?.readWorkspaceTree) {
          try {
            const treeRes = await window.codexDesktop.readWorkspaceTree(sessionWorkspaceDir);
            if (treeRes && treeRes.tree) {
              const nodes: string[] = [];
              const walk = (items: any[], indent = '') => {
                for (const it of items) {
                  if (nodes.length >= 120) break;
                  nodes.push(`${indent}- ${it.name}${it.isDirectory ? '/' : ''}`);
                  if (it.children) walk(it.children, indent + '  ');
                }
              };
              walk(treeRes.tree);
              treeOutline = nodes.join('\n');
              if (treeRes.totalCount && treeRes.totalCount > 120) {
                treeOutline += `\n... [工程规模较大，共计 ${treeRes.totalCount} 项，已略去后续条目，可输入具体文件名或使用 @ 引用]`;
              }
            }
          } catch (e) {
            // 容错保持空白
          }
        }

        let modeTitle = '📖 工作区只读模式 (Workspace Read-Only)';
        let modeRule = '你当前处于工作区只读安全沙箱。当前环境采用【即时上下文全量注入架构】，请基于下方已提供的工作区大纲和上下文挂载文件，立即直接给出完整分析、代码诊断或推演方案。绝对严禁输出“让我读取核心文件...”等等待二次交互的中断性语句，严禁尝试发起工具调用。';
        if (permissionMode === 'workspace-readwrite') {
          modeTitle = '✍️ 工作区读写模式 (Workspace Read/Write - 自动修改工程落盘)';
          modeRule = '【核心直写架构认知】你正运行在 Codex Desktop 工业级桌面端中，当前环境已直接授权你修改本地工程文件！客户端内置代码自动落盘引擎，只要你在代码块第一行清晰标注 `// filepath: <相对路径>`（如 `// filepath: src/App.tsx` 或 `# filepath: config.py`），客户端在生成结束时将全自动、静默直接修改并写入本地物理磁盘，并自动生成 .bak 备份副本。\n' +
            '【绝对红线规约】绝对严禁向用户声称“我无法直接写文件”、“没有直接往磁盘写文件的通道”或“落盘必须你手动操作”，绝对严禁要求用户手动点击按钮或手动执行脚本保存文件！直接输出带 filepath 的完整代码即可，输出即代表直接落地！';
        } else if (permissionMode === 'full-access') {
          modeTitle = '🌐 全局受信任模式 (Full Access)';
          modeRule = '你拥有全局代码直接修改与落地权限。客户端已打通本地磁盘自动写盘通道，所有带 `// filepath: ...` 的代码块将全自动直接写入磁盘。绝对严禁声称无法写文件，直接输出完整代码方案即可。';
        }

        workspaceSystemPrompt = `【当前工作区工程环境与安全运行权限】\n` +
          `- 本地工作区工程名称: ${currentSession.workspaceName || '当前工程'}\n` +
          `- 本地工作区绝对根目录: ${sessionWorkspaceDir}\n` +
          `- 运行权限等级: ${modeTitle}\n` +
          `- 核心准则: ${modeRule}\n` +
          (treeOutline ? `- 当前工程核心结构大纲:\n${treeOutline}\n` : '');
      }

      if (workspaceSystemPrompt) {
        contextMessages.push({
          role: 'system',
          content: workspaceSystemPrompt
        });
      }

      // 清洗并加载历史消息 (过滤空 content、截断占位符与历史推诿狡辩话术，阻断大模型多轮推理自洽抬杠链)
      (currentSession.messages || [])
        .slice(-10)
        .filter(m => m.content && typeof m.content === 'string' && m.content.trim().length > 0)
        .forEach(m => {
          let cleanedContent = m.content.trim();
          if (m.role === 'assistant') {
            // 清洗阶段 1: 过滤等待交互的截断词
            cleanedContent = cleanedContent.replace(/(?:让我读取.*?[：:]|先从.*?开始[：:])\s*$/g, '').trim();
            // 清洗阶段 2: 过滤大模型历史中“无法写文件/需用户手动操作”的推诿话术，彻底阻断抬杠自洽链
            cleanedContent = cleanedContent
              .replace(/(?:直说[：:]\s*不能[^\n]*\n?)/gi, '')
              .replace(/(?:我没有直接往你磁盘写文件的通道[^\n]*\n?)/gi, '')
              .replace(/(?:落盘那一下[，,]?\s*永远需要你动手[^\n]*\n?)/gi, '')
              .replace(/(?:这是环境的安全设计[，,]?\s*不是代码没写好[^\n]*\n?)/gi, '')
              .replace(/(?:你在我消息里的代码块上[，,]?\s*看得到[“"']?写入.*?这类按钮吗[^\n]*\n?)/gi, '')
              .trim();
          }
          if (cleanedContent) {
            contextMessages.push({
              role: m.role,
              content: cleanedContent
            });
          }
        });

      // 3. 智能关联工作区文件内容 (@引用文件或工程分析/进度评估请求)
      let finalUserContent = actualUserPrompt;
      const atFileMatches = Array.from(actualUserPrompt.matchAll(/@([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/g)).map(m => m[1]);
      const isAnalyzingWorkspace = /(分析|评估|看|梳理|走读|做到|进度|现状|架构).*(文件夹|工程|项目|代码|哪一步|模块|系统)/i.test(actualUserPrompt) ||
        /(项目|工程|代码).*(怎么样|到哪|进展)/i.test(actualUserPrompt);
      const filesToRead = new Set(atFileMatches);

      if (isAnalyzingWorkspace && filesToRead.size === 0 && activeWorkspaceDir) {
        // 自动探测工程关键配置与入口文件（前几个有效文件自动切片挂载）
        const candidateEntries = [
          'package.json', 'README.md', 'main.js', 'src/App.tsx', 'src/main.tsx',
          'src/index.ts', 'src/index.tsx', 'src/App.vue', 'Cargo.toml', 'go.mod'
        ];
        for (const candidate of candidateEntries) {
          filesToRead.add(candidate);
        }
      }

      if (filesToRead.size > 0 && window.codexDesktop?.readWorkspaceFile) {
        const attachedContents: string[] = [];
        let attachedCount = 0;
        for (const rel of filesToRead) {
          if (attachedCount >= 5) break; // 最多挂载 5 个关键入口文件，防止超长
          try {
            const fileRes = await window.codexDesktop.readWorkspaceFile(rel);
            if (fileRes.ok && fileRes.content) {
              attachedContents.push(`【文件挂载: ${rel}】\n\`\`\`\n${fileRes.content}\n\`\`\``);
              attachedCount++;
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

      // 统计输入字符与估算输入 Token 规模
      const totalInputChars = contextMessages.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0);
      const estimatedInputTokens = Math.max(1, Math.round(totalInputChars / 2.5));
      const sendStartTime = Date.now();
      let firstTokenTime: number | null = null;
      let accumulatedChars = 0;

      // 状态栏立即进入流式就绪计时
      setGenerationMetrics({
        isGenerating: true,
        firstTokenLatencyMs: null,
        speedTokPerSec: null,
        cacheHitPercent: null,
        inputTokens: estimatedInputTokens,
        outputTokens: 0,
      });

      let response: { content?: string; thinking?: string; toolCall?: any } | null = null;
      const streamId = 'stream_' + Date.now();
      activeStreamIdRef.current = streamId;

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
            const delta = (data.contentDelta || '') + (data.thinkingDelta || '');
            if (delta.length > 0) {
              if (!firstTokenTime) {
                firstTokenTime = Date.now();
                const ttft = firstTokenTime - sendStartTime;
                setGenerationMetrics(prev => ({
                  ...prev,
                  isGenerating: true,
                  firstTokenLatencyMs: ttft,
                }));
              }
              accumulatedChars += delta.length;
              const estOutputTokens = Math.max(1, Math.round(accumulatedChars / 2.2));
              const durationSec = Math.max(0.1, (Date.now() - (firstTokenTime || sendStartTime)) / 1000);
              const tps = Math.round(estOutputTokens / durationSec);

              setGenerationMetrics(prev => ({
                ...prev,
                isGenerating: true,
                outputTokens: estOutputTokens,
                speedTokPerSec: tps,
              }));
            }

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
          const systemPrompts = contextMessages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
          body = {
            model: selectedModel,
            max_tokens: 4096,
            stream: true,
            messages: contextMessages.filter(m => m.role !== 'system'),
            system: systemPrompts || undefined
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

          // 提取真实 usage 指标并计算最终结算速率
          const usage = parsed?.usage;
          const realInputTokens = usage?.prompt_tokens ?? estimatedInputTokens;
          const realOutputTokens = usage?.completion_tokens ?? Math.max(1, Math.round(accumulatedChars / 2.2));
          const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? usage?.cached_tokens ?? null;
          const cacheHit = cachedTokens && realInputTokens > 0 ? Math.round((cachedTokens / realInputTokens) * 100) : null;
          const finalDurationSec = Math.max(0.1, (Date.now() - (firstTokenTime || sendStartTime)) / 1000);
          const finalTps = Math.round(realOutputTokens / finalDurationSec);

          setGenerationMetrics({
            isGenerating: false,
            firstTokenLatencyMs: firstTokenTime ? firstTokenTime - sendStartTime : null,
            speedTokPerSec: finalTps,
            cacheHitPercent: cacheHit,
            inputTokens: realInputTokens,
            outputTokens: realOutputTokens,
          });

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
      } else if (
        friendlyError.includes('unexpected EOF') ||
        friendlyError.includes('stream reading error') ||
        friendlyError.includes('STREAM_EOF') ||
        friendlyError.includes('Stream EOF')
      ) {
        friendlyError = '流式传输中途被对端关闭 (unexpected EOF)，通常由中转站/Nginx 的连接超时或反向代理过早断流所致。若已有部分内容输出则已截断保留，可重新发送请求。';
      } else if (friendlyError.includes('aborted')) {
        friendlyError = '请求被中断 (aborted)，可能是网络环境不稳定或服务端主动中止，请检查代理设置后重试。';
      }

      updateLastMessageInCurrentSession(prev => ({
        ...prev,
        content: prev.content
          ? `${prev.content}\n\n❌ [传输中断]: ${friendlyError}`
          : `❌ 请求失败: ${friendlyError}`,
        thinking: '执行异常'
      }));
    } finally {
      activeStreamIdRef.current = null;
      if (unsubscribeStream) {
        unsubscribeStream();
      }
      setIsGenerating(false);
      setGenerationMetrics(prev => ({
        ...prev,
        isGenerating: false
      }));
    }
  };

  // 主动停止当前正在流式生成的任务并切断网络连接
  const handleStopGeneration = async () => {
    const currentStreamId = activeStreamIdRef.current;
    if (currentStreamId && window.codexDesktop?.abortLlmStream) {
      try {
        await window.codexDesktop.abortLlmStream(currentStreamId);
      } catch (err) {
        console.warn('中断 LLM 连接请求异常:', err);
      }
    }
    activeStreamIdRef.current = null;
    setIsGenerating(false);
    setGenerationMetrics(prev => ({
      ...prev,
      isGenerating: false,
    }));
    updateLastMessageInCurrentSession(prev => ({
      ...prev,
      content: prev.content
        ? `${prev.content}\n\n⏹️ *[用户已主动停止生成]*`
        : '⏹️ *[用户已主动停止生成]*',
      thinking: '已主动停止'
    }));
  };

  // 撤回指定消息并回填到输入框供用户修改重发
  const handleRevokeMessage = (messageIndex: number) => {
    if (isGenerating) {
      handleStopGeneration();
    }
    const revoked = rollbackMessage(messageIndex);
    if (revoked && revoked.content) {
      setInputPrompt(revoked.content);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-base text-text-primary">
      {/* 工作台三栏骨架 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧一体化侧边栏 (DSH 风格工作区树 + 会话分叉归档) */}
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={() => {
            const wsDir = currentSession?.workspaceDir || activeWorkspaceDir || undefined;
            const wsName = currentSession?.workspaceName || (wsDir ? wsDir.replace(/[\\/]$/, '').split(/[\\/]/).pop() : undefined);
            createNewSession(selectedModel, wsDir, wsName);
          }}
          onNewSessionInWorkspace={(wsDir, wsName) => createNewSession(selectedModel, wsDir, wsName)}
          onForkSession={forkSession}
          onArchiveSession={toggleArchiveSession}
          onMoveSessionToWorkspace={moveSessionToWorkspace}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onInsertPrompt={(text) => setInputPrompt(prev => prev ? `${prev} ${text}` : text)}
          onSelectFile={handleSelectFile}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenTheme={() => setIsThemeOpen(true)}
          onOpenAbout={() => setIsAboutOpen(true)}
          onOpenFeedback={() => setIsFeedbackOpen(true)}
          activeWorkspaceDir={activeWorkspaceDir}
          onWorkspaceChange={handleWorkspaceChange}
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
              {currentSession.workspaceName ? (
                <button
                  type="button"
                  onClick={() => updateCurrentSessionWorkspace('', '')}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent font-mono text-[10px] truncate max-w-[130px] hover:bg-accent/20 transition-colors cursor-pointer"
                  title={`当前会话已归属于工程: ${currentSession.workspaceDir}\n点击可移出工程（转为通用独立会话）`}
                >
                  <span>📁 {currentSession.workspaceName}</span>
                  <span className="text-[9px] text-accent/60 hover:text-accent font-bold">×</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (activeWorkspaceDir) {
                      const name = activeWorkspaceDir.replace(/[\\/]$/, '').split(/[\\/]/).pop() || '工程';
                      updateCurrentSessionWorkspace(activeWorkspaceDir, name);
                    }
                  }}
                  className="px-2 py-0.5 rounded-md bg-slate-500/10 border border-border text-text-muted font-mono text-[10px] hover:text-text-primary hover:border-accent/40 transition-colors cursor-pointer"
                  title={activeWorkspaceDir ? `点击将当前会话归入活跃工程: ${activeWorkspaceDir}` : '当前为纯净通用独立对话，未绑定任何工程'}
                >
                  💬 通用独立会话 {activeWorkspaceDir ? '+ 归入当前工程' : ''}
                </button>
              )}
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
            permissionMode={permissionMode}
            onFileWritten={handleFileWritten}
            onRevokeMessage={handleRevokeMessage}
          />

          {/* 底部 Composer 输入区 */}
          <Composer
            onSend={handleSend}
            onStopGeneration={handleStopGeneration}
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
          title={previewFile?.title}
          filePath={previewFile?.filePath}
          codeContent={previewFile?.codeContent}
          onInsertToPrompt={(text) => setInputPrompt(prev => prev ? `${prev} ${text}` : text)}
        />
      </div>

      {/* 底部极客状态栏 (100% 真实流式遥测指标) */}
      <StatusBar metrics={generationMetrics} />

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
        onOpenFeedback={() => setIsFeedbackOpen(true)}
      />

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        selectedModel={selectedModel}
        permissionMode={permissionMode}
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

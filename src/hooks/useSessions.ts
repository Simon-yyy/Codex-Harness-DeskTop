import { useState, useEffect } from 'react';
import { ChatSession, ChatMessage } from '@/types/session';

const DEFAULT_SESSION: ChatSession = {
  id: 'session_default',
  title: '新会话',
  updatedAt: Date.now(),
  messages: [
    {
      role: 'assistant',
      model: 'gpt-5.6-sol',
      thinking: 'Codex 核心与 43 项工业级技能库就绪。',
      content: '👋 你好！我是 **Codex Desktop** 旗舰 AI 编程助理。\n\n我已装配 43 项全流程工业级与 Loop 循环工程技能库。你可以随时通过 `/` 呼出快捷指令，或在输入框输入代码与需求！',
      timestamp: Date.now()
    }
  ]
};

export function useSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('codex_sessions_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return [DEFAULT_SESSION];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return sessions[0]?.id || DEFAULT_SESSION.id;
  });

  useEffect(() => {
    localStorage.setItem('codex_sessions_v1', JSON.stringify(sessions));
  }, [sessions]);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0] || DEFAULT_SESSION;

  const createNewSession = (initialModel = 'gpt-5.6-sol', workspaceDir?: string, workspaceName?: string) => {
    const newSession: ChatSession = {
      id: 'session_' + Date.now(),
      title: '新会话',
      updatedAt: Date.now(),
      workspaceDir: workspaceDir || undefined,
      workspaceName: workspaceName || undefined,
      messages: [
        {
          role: 'assistant',
          model: initialModel,
          thinking: '新会话初始化完成。',
          content: '新会话已开启，请输入您的需求或代码任务！',
          timestamp: Date.now()
        }
      ]
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    return newSession;
  };

  const renameSession = (sessionId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        return { ...s, title: trimmed, updatedAt: Date.now() };
      }
      return s;
    }));
  };

  const updateCurrentSessionWorkspace = (workspaceDir: string, workspaceName: string) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return {
          ...s,
          workspaceDir,
          workspaceName,
          updatedAt: Date.now()
        };
      }
      return s;
    }));
  };

  const forkSession = (sessionId: string) => {
    const target = sessions.find(s => s.id === sessionId);
    if (!target) return;
    const forked: ChatSession = {
      id: 'session_' + Date.now(),
      title: `${target.title || '会话'} (分支)`,
      updatedAt: Date.now(),
      workspaceDir: target.workspaceDir,
      workspaceName: target.workspaceName,
      forkedFrom: sessionId,
      messages: JSON.parse(JSON.stringify(target.messages))
    };
    setSessions(prev => [forked, ...prev]);
    setCurrentSessionId(forked.id);
    return forked;
  };

  const toggleArchiveSession = (sessionId: string) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        return {
          ...s,
          isArchived: !s.isArchived,
          updatedAt: Date.now()
        };
      }
      return s;
    }));
  };

  const deleteSession = (sessionId: string) => {
    setSessions(prev => {
      if (prev.length <= 1) {
        const reset: ChatSession = {
          id: 'session_' + Date.now(),
          title: '新会话',
          updatedAt: Date.now(),
          messages: []
        };
        setCurrentSessionId(reset.id);
        return [reset];
      }
      const filtered = prev.filter(s => s.id !== sessionId);
      if (currentSessionId === sessionId) {
        setCurrentSessionId(filtered[0]?.id || '');
      }
      return filtered;
    });
  };

  const addMessageToCurrentSession = (msg: ChatMessage) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        const updatedMessages = [...s.messages, msg];
        let newTitle = s.title;
        if (s.title === '新会话' && msg.role === 'user') {
          newTitle = msg.content.trim().slice(0, 20) || '新会话';
        }
        return {
          ...s,
          title: newTitle,
          updatedAt: Date.now(),
          messages: updatedMessages
        };
      }
      return s;
    }));
  };

  const clearCurrentSessionMessages = () => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return {
          ...s,
          messages: []
        };
      }
      return s;
    }));
  };

  const exportCurrentSessionAsMarkdown = () => {
    if (!currentSession || currentSession.messages.length === 0) return;
    let md = `# ${currentSession.title}\n\n*导出时间: ${new Date().toLocaleString()}*\n\n---\n\n`;
    currentSession.messages.forEach(m => {
      const roleName = m.role === 'user' ? '👤 用户' : `🤖 Codex Agent (${m.model || 'LLM'})`;
      md += `### ${roleName}\n\n`;
      if (m.thinking) {
        md += `> 💡 **思考过程**:\n> ${m.thinking.replace(/\n/g, '\n> ')}\n\n`;
      }
      md += `${m.content}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSession.title.replace(/[\\/:*?"<>|]/g, '_')}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateLastMessageInCurrentSession = (updater: (lastMsg: ChatMessage) => ChatMessage) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId && s.messages.length > 0) {
        const lastIdx = s.messages.length - 1;
        const updated = [...s.messages];
        updated[lastIdx] = updater(updated[lastIdx]);
        return {
          ...s,
          updatedAt: Date.now(),
          messages: updated
        };
      }
      return s;
    }));
  };

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    createNewSession,
    renameSession,
    updateCurrentSessionWorkspace,
    forkSession,
    toggleArchiveSession,
    deleteSession,
    addMessageToCurrentSession,
    updateLastMessageInCurrentSession,
    clearCurrentSessionMessages,
    exportCurrentSessionAsMarkdown
  };
}

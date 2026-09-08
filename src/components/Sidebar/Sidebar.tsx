import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Folder,
  FolderOpen,
  Sparkles,
  Plus,
  Trash2,
  Settings,
  Palette,
  Info,
  ChevronRight,
  ChevronDown,
  FileText,
  FileCode,
  Image,
  RefreshCw,
  Loader2,
  Edit2,
  Check,
  FolderPlus,
  MoreHorizontal,
  GitFork,
  Search,
  X,
  Bug
} from 'lucide-react';
import { ChatSession, WorkspaceFolder } from '@/types/session';
import { SkillItem, WorkspaceFileItem } from '@/types/electron';
import { SKILL_CATEGORIES, SkillCategory, getSkillDisplayInfo, SKILLS_DICTIONARY } from '@/data/skillsDictionary';
import { SkillDetailModal } from '@/components/Modals/SkillDetailModal';
import { ArchiveModal } from '@/components/Modals/ArchiveModal';

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return '刚刚';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}分钟`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天`;
  return `${Math.floor(days / 30)}月前`;
}

function normalizeFsPath(p?: string | null): string {
  if (!p) return '';
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onNewSessionInWorkspace?: (workspaceDir?: string, workspaceName?: string) => void;
  onForkSession?: (sessionId: string) => void;
  onArchiveSession?: (sessionId: string) => void;
  onMoveSessionToWorkspace?: (
    sessionId: string,
    targetWorkspaceDir?: string,
    targetWorkspaceName?: string,
    archive?: boolean
  ) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession?: (id: string, newTitle: string) => void;
  onInsertPrompt: (text: string) => void;
  onSelectFile?: (file: WorkspaceFileItem) => void;
  onOpenSettings: () => void;
  onOpenTheme: () => void;
  onOpenAbout: () => void;
  onOpenFeedback?: () => void;
  activeWorkspaceDir?: string | null;
  onWorkspaceChange?: (path: string) => void;
  refreshTrigger?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onNewSessionInWorkspace,
  onForkSession,
  onArchiveSession,
  onMoveSessionToWorkspace,
  onDeleteSession,
  onRenameSession,
  onInsertPrompt,
  onSelectFile,
  onOpenSettings,
  onOpenTheme,
  onOpenAbout,
  onOpenFeedback,
  activeWorkspaceDir,
  onWorkspaceChange,
  refreshTrigger,
}) => {
  const [activeTab, setActiveTab] = useState<'sessions' | 'files' | 'skills'>('sessions');
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [skillSearch, setSkillSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory>('all');
  const [selectedSkillForModal, setSelectedSkillForModal] = useState<SkillItem | null>(null);

  // 会话重命名与操作菜单浮层状态
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [archiveModalSession, setArchiveModalSession] = useState<ChatSession | null>(null);

  // 搜索与过滤状态
  const [isSearchingSession, setIsSearchingSession] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');

  // DSH 风格多工作区常驻列表 (保存在 localStorage)
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>(() => {
    try {
      const saved = localStorage.getItem('codex_workspace_folders_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter(f => !/^[yY]:/i.test(f.path) && !f.name.includes('已解析'));
          localStorage.setItem('codex_workspace_folders_v1', JSON.stringify(valid));
          return valid;
        }
      }
    } catch (e) {}
    if (activeWorkspaceDir && !/^[yY]:/i.test(activeWorkspaceDir) && !activeWorkspaceDir.includes('已解析')) {
      const name = activeWorkspaceDir.replace(/[\\/]$/, '').split(/[\\/]/).pop() || '当前工程';
      return [{ id: activeWorkspaceDir, path: activeWorkspaceDir, name }];
    }
    return [];
  });

  // 工作区文件夹折叠状态 (默认展开)
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Record<string, boolean>>({});

  // 工作区状态
  const [workspacePath, setWorkspacePath] = useState<string>(() => {
    const raw = activeWorkspaceDir || localStorage.getItem('codex_workspace_dir') || '';
    if (/^[yY]:/i.test(raw) || raw.includes('已解析')) {
      localStorage.removeItem('codex_workspace_dir');
      return '';
    }
    return raw;
  });
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceFileItem[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderChildrenMap, setFolderChildrenMap] = useState<Record<string, WorkspaceFileItem[]>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});

  // ↔️ 侧边栏自由拖拽拉伸宽度 (范围 220px ~ 600px，持久化保存)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('codex_sidebar_width');
      if (saved) return Math.max(220, Math.min(600, parseInt(saved, 10)));
    } catch (e) {}
    return 260;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(220, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        localStorage.setItem('codex_sidebar_width', sidebarWidth.toString());
      }
    };
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, sidebarWidth]);

  // 监听全局点击关闭 ... 菜单
  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveMenuSessionId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // 确保当前 activeWorkspaceDir 在工作区列表中
  useEffect(() => {
    if (activeWorkspaceDir) {
      setWorkspaceFolders(prev => {
        if (prev.some(f => f.path === activeWorkspaceDir)) return prev;
        const name = activeWorkspaceDir.replace(/[\\/]$/, '').split(/[\\/]/).pop() || '工程';
        const updated = [...prev, { id: activeWorkspaceDir, path: activeWorkspaceDir, name }];
        localStorage.setItem('codex_workspace_folders_v1', JSON.stringify(updated));
        return updated;
      });
    }
  }, [activeWorkspaceDir]);

  // 添加新工作区目录
  const handleAddWorkspaceFolder = async () => {
    if (window.codexDesktop?.selectWorkspaceDir) {
      const selected = await window.codexDesktop.selectWorkspaceDir();
      if (selected) {
        const name = selected.replace(/[\\/]$/, '').split(/[\\/]/).pop() || '工程';
        setWorkspaceFolders(prev => {
          if (prev.some(f => f.path === selected)) return prev;
          const updated = [...prev, { id: selected, path: selected, name }];
          localStorage.setItem('codex_workspace_folders_v1', JSON.stringify(updated));
          return updated;
        });
        setWorkspacePath(selected);
        if (onWorkspaceChange) onWorkspaceChange(selected);
      }
    }
  };

  // 归档弹窗专用的选择新工作区回调
  const handleSelectNewFolderForArchive = async (): Promise<WorkspaceFolder | null> => {
    if (window.codexDesktop?.selectWorkspaceDir) {
      const selected = await window.codexDesktop.selectWorkspaceDir();
      if (selected) {
        const name = selected.replace(/[\\/]$/, '').split(/[\\/]/).pop() || '工程';
        const newFolder: WorkspaceFolder = { id: selected, path: selected, name };
        setWorkspaceFolders(prev => {
          if (prev.some(f => f.path === selected)) return prev;
          const updated = [...prev, newFolder];
          localStorage.setItem('codex_workspace_folders_v1', JSON.stringify(updated));
          return updated;
        });
        return newFolder;
      }
    }
    return null;
  };

  // 确认将某个会话归档/移动到指定工作区
  const handleConfirmArchive = (
    sessionId: string,
    targetWorkspaceDir?: string,
    targetWorkspaceName?: string,
    archive?: boolean
  ) => {
    if (onMoveSessionToWorkspace) {
      onMoveSessionToWorkspace(sessionId, targetWorkspaceDir, targetWorkspaceName, archive);
    } else if (onArchiveSession) {
      onArchiveSession(sessionId);
    }
    // 自动展开目标工作区树
    if (targetWorkspaceDir) {
      setCollapsedWorkspaces(prev => ({ ...prev, [targetWorkspaceDir]: false }));
    }
  };

  // 彻底从左侧移除指定工作区
  const handleRemoveWorkspaceFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setWorkspaceFolders(prev => {
      const updated = prev.filter(f => f.path !== folderPath);
      localStorage.setItem('codex_workspace_folders_v1', JSON.stringify(updated));
      return updated;
    });
    if (workspacePath === folderPath) {
      setWorkspacePath('');
      setWorkspaceTree([]);
      setWorkspaceName('');
      localStorage.removeItem('codex_workspace_dir');
    }
  };

  const toggleWorkspaceCollapse = (key: string) => {
    setCollapsedWorkspaces(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (window.codexDesktop && window.codexDesktop.getSkills) {
      window.codexDesktop.getSkills().then(list => {
        if (Array.isArray(list)) setSkills(list);
      });
    }
  }, []);

  // 挂载或工作区路径变化时加载真实工程文件树
  const loadWorkspaceTree = async (dirPath: string) => {
    if (!dirPath || /^[yY]:/i.test(dirPath) || dirPath.includes('已解析') || !window.codexDesktop?.readWorkspaceTree) {
      setWorkspaceTree([]);
      setWorkspaceName('');
      setWorkspaceError(null);
      return;
    }
    setIsLoadingWorkspace(true);
    setWorkspaceError(null);
    setFolderChildrenMap({});
    try {
      const res = await window.codexDesktop.readWorkspaceTree(dirPath, { maxDepth: 1 });
      if (res && (res as any).isTimeout) {
        setWorkspaceError('读取工作区响应超时（外部网络驱动器可能脱机），可点击上方刷新重试');
      } else if (res && res.tree) {
        setWorkspaceTree(res.tree);
        setWorkspaceName(res.rootName || '工作区');
      } else if (res && res.error) {
        setWorkspaceError(`加载工作区失败: ${res.error}`);
      }
    } catch (err: any) {
      setWorkspaceError(`读取异常: ${err?.message || '未知错误'}`);
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  // 仅在外部 activeWorkspaceDir 变动（会话切换/工作区切换）时，单向同步 Sidebar 内部状态
  useEffect(() => {
    const nextPath = activeWorkspaceDir || '';
    if (nextPath !== workspacePath) {
      setWorkspacePath(nextPath);
      if (nextPath) {
        localStorage.setItem('codex_workspace_dir', nextPath);
        loadWorkspaceTree(nextPath);
      } else {
        setWorkspaceTree([]);
        setWorkspaceName('');
      }
    }
  }, [activeWorkspaceDir]);

  // ⚡ 外部文件写盘事件联动：当触发写盘时，立即全自动重新扫描刷新文件树
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      const currentPath = activeWorkspaceDir || workspacePath;
      if (currentPath) {
        loadWorkspaceTree(currentPath);
      }
    }
  }, [refreshTrigger]);

  // 选择本地任意文件夹作为工作区
  const handleSelectWorkspace = async () => {
    if (window.codexDesktop?.selectWorkspaceDir) {
      const selected = await window.codexDesktop.selectWorkspaceDir();
      if (selected) {
        setWorkspacePath(selected);
        localStorage.setItem('codex_workspace_dir', selected);
        loadWorkspaceTree(selected);
        if (onWorkspaceChange) onWorkspaceChange(selected);
      }
    }
  };

  // 点击切换文件夹展开/折叠，并支持异步按需加载（对齐 VS Code / Cursor 懒加载机制）
  const toggleFolder = async (folderFullPath: string) => {
    const nextState = !expandedFolders[folderFullPath];
    setExpandedFolders(prev => ({ ...prev, [folderFullPath]: nextState }));

    if (nextState) {
      const cached = folderChildrenMap[folderFullPath];
      // 如果尚未缓存且无预填子项，立即按需异步加载单层直接子项
      if (!cached && window.codexDesktop?.readDirectoryChildren) {
        setLoadingFolders(prev => ({ ...prev, [folderFullPath]: true }));
        try {
          const children = await window.codexDesktop.readDirectoryChildren(folderFullPath);
          setFolderChildrenMap(prev => ({ ...prev, [folderFullPath]: children || [] }));
        } catch (err) {
          console.error('动态拉取子目录失败:', folderFullPath, err);
        } finally {
          setLoadingFolders(prev => ({ ...prev, [folderFullPath]: false }));
        }
      }
    }
  };

  const filteredSkills = skills.filter(s => {
    const info = getSkillDisplayInfo(s.id, s.name, s.description);
    if (selectedCategory !== 'all' && info.category !== selectedCategory) {
      return false;
    }
    if (!skillSearch.trim()) return true;
    const q = skillSearch.toLowerCase();
    const dict = SKILLS_DICTIONARY[s.id] || SKILLS_DICTIONARY[s.name];
    const matchKeywords = dict?.keywords?.some(k => k.toLowerCase().includes(q)) || false;
    return (
      s.id.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      info.displayName.toLowerCase().includes(q) ||
      info.chineseSummary.toLowerCase().includes(q) ||
      matchKeywords
    );
  });

  // 文件图标映射
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext || '')) {
      return <FileCode size={13} className="text-blue-400 shrink-0" />;
    }
    if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'ico'].includes(ext || '')) {
      return <Image size={13} className="text-emerald-400 shrink-0" />;
    }
    if (['json', 'yml', 'yaml', 'toml', 'md'].includes(ext || '')) {
      return <FileText size={13} className="text-amber-400 shrink-0" />;
    }
    if (['css', 'scss', 'less'].includes(ext || '')) {
      return <FileText size={13} className="text-sky-400 shrink-0" />;
    }
    if (['bat', 'cmd', 'sh', 'ps1'].includes(ext || '')) {
      return <FileCode size={13} className="text-amber-500 shrink-0" />;
    }
    return <FileText size={13} className="text-text-muted shrink-0" />;
  };

  // 递归渲染目录树节点（融合懒加载缓存，保证同级与根级普通文件 100% 完整展示）
  const renderTreeItems = (items: WorkspaceFileItem[], depth = 0) => {
    return items.map(item => {
      if (item.isDirectory) {
        const isExpanded = !!expandedFolders[item.fullPath];
        const children = folderChildrenMap[item.fullPath] || item.children || [];
        const isLoadingChildren = !!loadingFolders[item.fullPath];

        return (
          <div key={item.fullPath} className="space-y-0.5">
            <div
              onClick={() => toggleFolder(item.fullPath)}
              style={{ paddingLeft: `${depth * 10 + 6}px` }}
              className="flex items-center gap-1.5 py-1 pr-2 rounded-md hover:bg-bg-hover cursor-pointer text-text-secondary hover:text-text-primary text-xs font-medium transition-colors group"
              title={item.fullPath}
            >
              {isExpanded ? (
                <ChevronDown size={13} className="text-text-muted shrink-0" />
              ) : (
                <ChevronRight size={13} className="text-text-muted shrink-0" />
              )}
              <Folder size={13} className="text-amber-400 shrink-0" />
              <span className="truncate">{item.name}</span>
              {isLoadingChildren && (
                <Loader2 size={11} className="animate-spin text-accent ml-auto shrink-0" />
              )}
            </div>
            {isExpanded && (
              <div>
                {children.length > 0 ? (
                  renderTreeItems(children, depth + 1)
                ) : !isLoadingChildren ? (
                  <div
                    style={{ paddingLeft: `${(depth + 1) * 10 + 20}px` }}
                    className="py-0.5 text-[11px] text-text-muted/60 italic select-none"
                  >
                    (空目录)
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div
            key={item.fullPath}
            onClick={() => {
              if (onSelectFile) onSelectFile(item);
              onInsertPrompt(`@${item.path}`);
            }}
            style={{ paddingLeft: `${depth * 10 + 20}px` }}
            className="flex items-center gap-1.5 py-1 pr-2 rounded-md hover:bg-bg-hover cursor-pointer text-text-muted hover:text-text-primary text-xs transition-colors group"
            title={`点击在输入框引用 @${item.path} 并在右侧预览源码\n${item.fullPath}`}
          >
            {getFileIcon(item.name)}
            <span className="truncate group-hover:text-text-primary">{item.name}</span>
          </div>
        );
      }
    });
  };

  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className={`relative h-full bg-bg-sidebar border-r border-border flex flex-col flex-shrink-0 select-none ${
        isResizing ? 'cursor-col-resize select-none' : ''
      }`}
    >
      {/* ↔️ 右边缘微光拖拽手柄条 */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-accent/40 active:bg-accent transition-colors z-30 group"
        title="按住左右拖拽调节侧边栏宽度"
      >
        <div className="w-0.5 h-full mx-auto bg-transparent group-hover:bg-accent group-active:bg-accent transition-colors" />
      </div>

      {/* 品牌 Header */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center font-bold text-white shadow-sm">
          CX
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary tracking-wide">Codex Desktop</h2>
          <span className="text-[10px] text-accent-warm font-mono tracking-wider font-semibold">HARNESS v1.1</span>
        </div>
      </div>

      {/* 新建会话按钮 */}
      <div className="p-3">
        <button
          onClick={onNewSession}
          className="w-full py-2 px-3 bg-gradient-to-r from-accent to-accent-secondary hover:brightness-110 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
        >
          <Plus size={15} />
          <span>新建会话</span>
        </button>
      </div>

      {/* 三大 Tab 切换胶囊 */}
      <div className="px-3 pb-2">
        <div className="grid grid-cols-3 gap-1 p-1 bg-bg-card rounded-lg border border-border">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-1 transition-colors ${
              activeTab === 'sessions'
                ? 'bg-accent text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            <MessageSquare size={13} />
            <span>会话</span>
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-1 transition-colors ${
              activeTab === 'files'
                ? 'bg-accent text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            <Folder size={13} />
            <span>文件</span>
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-1 transition-colors ${
              activeTab === 'skills'
                ? 'bg-accent text-white font-semibold shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            <Sparkles size={13} />
            <span>技能</span>
          </button>
        </div>
      </div>

      {/* 滚动内容区 */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
        {/* Tab 1: DSH 风格多工作区树与会话归档管理 */}
        {activeTab === 'sessions' && (
          <div className="space-y-2">
            {/* 工作区标题工具条 (1:1 复刻 DSH 风格) */}
            <div className="flex items-center justify-between px-1 pt-1 text-xs font-semibold text-text-primary select-none">
              <span className="tracking-wide">工作区项目</span>
              <div className="flex items-center gap-0.5 text-text-muted">
                <button
                  type="button"
                  onClick={() => setIsSearchingSession(!isSearchingSession)}
                  className={`p-1 rounded hover:text-text-primary hover:bg-bg-hover transition-colors ${
                    isSearchingSession || sessionSearchQuery ? 'text-accent bg-accent/10' : ''
                  }`}
                  title="搜索项目或会话"
                >
                  <Search size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleAddWorkspaceFolder}
                  className="p-1 rounded hover:text-accent hover:bg-bg-hover transition-colors text-accent"
                  title="添加本地项目文件夹"
                >
                  <FolderPlus size={14} />
                </button>
              </div>
            </div>

            {/* 实时搜索栏 */}
            {isSearchingSession && (
              <div className="relative">
                <input
                  type="text"
                  value={sessionSearchQuery}
                  onChange={(e) => setSessionSearchQuery(e.target.value)}
                  placeholder="过滤项目或会话..."
                  autoFocus
                  className="w-full text-xs px-2 py-1 pr-6 bg-bg-card border border-border rounded-md text-text-primary outline-none focus:border-accent"
                />
                {sessionSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setSessionSearchQuery('')}
                    className="absolute right-1.5 top-1.5 text-text-muted hover:text-text-primary"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {/* 工作区列表渲染 */}
            <div className="space-y-1.5">
              {/* 1. 各个已挂载工作区文件夹 */}
              {workspaceFolders.map((wf) => {
                const matchedSessions = sessions.filter((s) => {
                  const matchWs = normalizeFsPath(s.workspaceDir) === normalizeFsPath(wf.path);
                  const matchQuery = !sessionSearchQuery.trim() ||
                    (s.title && s.title.toLowerCase().includes(sessionSearchQuery.toLowerCase())) ||
                    wf.name.toLowerCase().includes(sessionSearchQuery.toLowerCase());
                  return matchWs && matchQuery;
                });

                // 即使没有会话，文件夹也展示供添加
                if (sessionSearchQuery && matchedSessions.length === 0 && !wf.name.toLowerCase().includes(sessionSearchQuery.toLowerCase())) {
                  return null;
                }

                // 包含当前激活会话时强制展开；否则遵循折叠状态（默认未折叠）
                const hasActiveSession = matchedSessions.some(s => s.id === currentSessionId);
                const isCollapsed = !hasActiveSession && !!collapsedWorkspaces[wf.path];
                const isWsActive = normalizeFsPath(activeWorkspaceDir) === normalizeFsPath(wf.path);

                return (
                  <div key={wf.path} className="space-y-0.5">
                    {/* 工作区目录头部 (可折叠、可激活切换工作区、可添加新会话) */}
                    <div
                      onClick={() => {
                        if (isCollapsed) {
                          toggleWorkspaceCollapse(wf.path);
                        }
                        if (onWorkspaceChange && normalizeFsPath(activeWorkspaceDir) !== normalizeFsPath(wf.path)) {
                          onWorkspaceChange(wf.path);
                        }
                        const firstSession = matchedSessions[0];
                        if (firstSession && firstSession.id !== currentSessionId) {
                          onSelectSession(firstSession.id);
                        }
                      }}
                      className={`group flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-bg-hover cursor-pointer text-xs transition-colors ${
                        isWsActive
                          ? 'bg-accent/15 text-accent font-semibold shadow-xs'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                      title={`工程目录: ${wf.name}\n物理路径: ${wf.path}\n点击激活并切换至该工程`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWorkspaceCollapse(wf.path);
                          }}
                          className="p-0.5 hover:bg-bg-card rounded text-text-muted hover:text-text-primary transition-colors"
                          title={isCollapsed ? '展开目录' : '折叠目录'}
                        >
                          {isCollapsed ? (
                            <ChevronRight size={12} className="shrink-0" />
                          ) : (
                            <ChevronDown size={12} className="shrink-0" />
                          )}
                        </button>
                        <Folder size={13} className={isWsActive ? 'text-accent shrink-0' : 'text-amber-400 shrink-0'} />
                        <span className="truncate font-medium text-[12px]">{wf.name}</span>
                        {matchedSessions.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-border/40 text-text-muted font-mono shrink-0 ml-1">
                            {matchedSessions.length}
                          </span>
                        )}
                        {isWsActive && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-accent/20 text-accent font-mono shrink-0 ml-1">
                            活跃
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNewSessionInWorkspace) {
                              onNewSessionInWorkspace(wf.path, wf.name);
                            } else {
                              onNewSession();
                            }
                          }}
                          className="p-1 hover:bg-bg-card hover:text-accent rounded text-text-muted transition-colors"
                          title={`在【${wf.name}】下新建会话`}
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveWorkspaceFolder(wf.path, e)}
                          className="p-1 hover:bg-bg-card hover:text-rose-400 rounded text-text-muted transition-colors"
                          title={`从侧边栏移除工程【${wf.name}】`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* 下属会话列表 (展开时呈现) */}
                    {!isCollapsed && (
                      <div className="pl-3.5 space-y-0.5 border-l border-border/40 ml-2">
                        {matchedSessions.map((s) => {
                          const isActive = s.id === currentSessionId;
                          const isEditing = editingSessionId === s.id;
                          const isMenuOpen = activeMenuSessionId === s.id;
                          const relTime = formatRelativeTime(s.updatedAt);

                          return (
                            <div
                              key={s.id}
                              onClick={() => {
                                if (!isEditing) {
                                  onSelectSession(s.id);
                                  if (s.workspaceDir && onWorkspaceChange && normalizeFsPath(activeWorkspaceDir) !== normalizeFsPath(s.workspaceDir)) {
                                    onWorkspaceChange(s.workspaceDir);
                                  }
                                }
                              }}
                              className={`group relative flex items-center justify-between py-1 px-2 rounded-md cursor-pointer text-xs transition-all ${
                                isActive
                                  ? 'bg-accent/15 text-accent font-medium'
                                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                              }`}
                              title={s.title || '新会话'}
                            >
                              {/* 会话标题与行内重命名 */}
                              <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1">
                                {isEditing ? (
                                  <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          if (onRenameSession && editingTitle.trim()) {
                                            onRenameSession(s.id, editingTitle.trim());
                                          }
                                          setEditingSessionId(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingSessionId(null);
                                        }
                                      }}
                                      autoFocus
                                      className="w-full text-xs px-1.5 py-0.5 bg-bg-card border border-accent rounded text-text-primary outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onRenameSession && editingTitle.trim()) {
                                          onRenameSession(s.id, editingTitle.trim());
                                        }
                                        setEditingSessionId(null);
                                      }}
                                      className="p-0.5 text-accent"
                                    >
                                      <Check size={11} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="truncate text-xs">{s.title || '新会话'}</span>
                                )}
                              </div>

                              {/* 右侧：相对时间 / 悬停出现 ... 更多菜单 */}
                              {!isEditing && (
                                <div className="flex items-center gap-1 shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-[10px] text-text-muted font-mono group-hover:hidden">
                                    {relTime}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveMenuSessionId(isMenuOpen ? null : s.id)}
                                    className={`hidden group-hover:flex p-1 hover:bg-bg-card hover:text-text-primary rounded text-text-muted transition-colors ${
                                      isMenuOpen ? '!flex text-text-primary bg-bg-card shadow-xs' : ''
                                    }`}
                                    title="会话选项"
                                  >
                                    <MoreHorizontal size={12} />
                                  </button>

                                  {/* DSH 1:1 菜单气泡浮层 (截图 2) */}
                                  {isMenuOpen && (
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-bg-card border border-border rounded-lg shadow-2xl z-50 py-1 text-xs select-none animate-fadeIn">
                                      <div
                                        onClick={() => {
                                          setEditingSessionId(s.id);
                                          setEditingTitle(s.title || '');
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                                      >
                                        <Edit2 size={12} className="text-text-muted" />
                                        <span>重命名</span>
                                      </div>
                                      <div
                                        onClick={() => {
                                          if (onForkSession) onForkSession(s.id);
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                                      >
                                        <GitFork size={12} className="text-text-muted" />
                                        <span>分叉会话</span>
                                      </div>
                                      <div
                                        onClick={() => {
                                          setArchiveModalSession(s);
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                                      >
                                        <Folder size={12} className="text-text-muted" />
                                        <span>归入项目目录...</span>
                                      </div>
                                      <div className="border-t border-border my-1"></div>
                                      <div
                                        onClick={() => {
                                          onDeleteSession(s.id);
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/15 text-red-400 cursor-pointer transition-colors"
                                      >
                                        <Trash2 size={12} />
                                        <span>删除会话</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 2. 独立/通用会话分组 (未绑定特定工作区) */}
              {(() => {
                const unattached = sessions.filter((s) => {
                  const matchUnattached = !s.workspaceDir || !workspaceFolders.some((f) => normalizeFsPath(f.path) === normalizeFsPath(s.workspaceDir));
                  const matchQuery = !sessionSearchQuery.trim() || (s.title && s.title.toLowerCase().includes(sessionSearchQuery.toLowerCase()));
                  return matchUnattached && matchQuery;
                });
                if (unattached.length === 0) return null;
                const hasActiveInUnattached = unattached.some(s => s.id === currentSessionId);
                const isCollapsed = !hasActiveInUnattached && !!collapsedWorkspaces['__unattached__'];

                return (
                  <div className="space-y-0.5 pt-1">
                    <div
                      onClick={() => toggleWorkspaceCollapse('__unattached__')}
                      className="group flex items-center justify-between py-1 px-1.5 rounded-md hover:bg-bg-hover cursor-pointer text-text-secondary hover:text-text-primary text-xs transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {isCollapsed ? (
                          <ChevronRight size={12} className="text-text-muted shrink-0" />
                        ) : (
                          <ChevronDown size={12} className="text-text-muted shrink-0" />
                        )}
                        <MessageSquare size={13} className="text-slate-400 shrink-0" />
                        <span className="truncate font-medium text-[12px]">通用独立对话</span>
                        {unattached.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-border/40 text-text-muted font-mono shrink-0 ml-1">
                            {unattached.length}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNewSession();
                        }}
                        className="p-1 hover:bg-bg-card hover:text-accent rounded text-text-muted transition-colors opacity-0 group-hover:opacity-100"
                        title="新建独立对话"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {!isCollapsed && (
                      <div className="pl-3.5 space-y-0.5 border-l border-border/40 ml-2">
                        {unattached.map((s) => {
                          const isActive = s.id === currentSessionId;
                          const isEditing = editingSessionId === s.id;
                          const isMenuOpen = activeMenuSessionId === s.id;
                          const relTime = formatRelativeTime(s.updatedAt);

                          return (
                            <div
                              key={s.id}
                              onClick={() => {
                                if (!isEditing) {
                                  onSelectSession(s.id);
                                  if (onWorkspaceChange && activeWorkspaceDir) {
                                    onWorkspaceChange('');
                                  }
                                }
                              }}
                              className={`group relative flex items-center justify-between py-1 px-2 rounded-md cursor-pointer text-xs transition-all ${
                                isActive
                                  ? 'bg-accent/15 text-accent font-medium'
                                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1">
                                {isEditing ? (
                                  <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          if (onRenameSession && editingTitle.trim()) {
                                            onRenameSession(s.id, editingTitle.trim());
                                          }
                                          setEditingSessionId(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingSessionId(null);
                                        }
                                      }}
                                      autoFocus
                                      className="w-full text-xs px-1.5 py-0.5 bg-bg-card border border-accent rounded text-text-primary outline-none"
                                    />
                                  </div>
                                ) : (
                                  <span className="truncate text-xs">{s.title || '新会话'}</span>
                                )}
                              </div>

                              {!isEditing && (
                                <div className="flex items-center gap-1 shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-[10px] text-text-muted font-mono group-hover:hidden">{relTime}</span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveMenuSessionId(isMenuOpen ? null : s.id)}
                                    className={`hidden group-hover:flex p-1 hover:bg-bg-card hover:text-text-primary rounded text-text-muted transition-colors ${
                                      isMenuOpen ? '!flex text-text-primary bg-bg-card shadow-xs' : ''
                                    }`}
                                  >
                                    <MoreHorizontal size={12} />
                                  </button>

                                  {isMenuOpen && (
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-bg-card border border-border rounded-lg shadow-2xl z-50 py-1 text-xs select-none animate-fadeIn">
                                      <div
                                        onClick={() => {
                                          setEditingSessionId(s.id);
                                          setEditingTitle(s.title || '');
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                                      >
                                        <Edit2 size={12} className="text-text-muted" />
                                        <span>重命名</span>
                                      </div>
                                      <div
                                        onClick={() => {
                                          if (onForkSession) onForkSession(s.id);
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                                      >
                                        <GitFork size={12} className="text-text-muted" />
                                        <span>分叉会话</span>
                                      </div>
                                      <div
                                        onClick={() => {
                                          setArchiveModalSession(s);
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-hover text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                                      >
                                        <Folder size={12} className="text-text-muted" />
                                        <span>归入项目目录...</span>
                                      </div>
                                      <div className="border-t border-border my-1"></div>
                                      <div
                                        onClick={() => {
                                          onDeleteSession(s.id);
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/15 text-red-400 cursor-pointer"
                                      >
                                        <Trash2 size={12} />
                                        <span>删除会话</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Tab 2: 真实工作区工程文件树 */}
        {activeTab === 'files' && (
          <div className="space-y-2 text-xs">
            {/* 工作区标题与切换入口 */}
            <div className="p-2 bg-bg-card border border-border/80 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1">
                  <FolderOpen size={13} className="text-accent shrink-0" />
                  <span
                    className="text-xs font-semibold text-text-primary truncate"
                    title={workspacePath || '未打开工作区'}
                  >
                    {workspaceName || '未打开工作区'}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {workspacePath && (
                    <button
                      onClick={() => loadWorkspaceTree(workspacePath)}
                      disabled={isLoadingWorkspace}
                      className="p-1 hover:bg-bg-hover text-text-muted hover:text-text-primary rounded transition-colors"
                      title="刷新文件树"
                    >
                      <RefreshCw size={11} className={isLoadingWorkspace ? 'animate-spin' : ''} />
                    </button>
                  )}
                  <button
                    onClick={handleSelectWorkspace}
                    className="px-2 py-0.5 bg-accent/15 hover:bg-accent hover:text-white text-accent rounded text-[11px] font-medium transition-colors"
                    title="选择本地任意文件夹作为新工作区"
                  >
                    {workspacePath ? '切换' : '选择目录'}
                  </button>
                </div>
              </div>
              {workspacePath && (
                <div
                  className="text-[10px] font-mono text-text-muted truncate select-text"
                  title={workspacePath}
                >
                  {workspacePath}
                </div>
              )}
            </div>

            {/* 错误或超时优雅降级卡片 */}
            {workspaceError && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-500 text-xs space-y-2">
                <div className="flex items-start gap-1.5 font-medium">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{workspaceError}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadWorkspaceTree(workspacePath)}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 rounded text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    重试扫描
                  </button>
                  <button
                    onClick={() => {
                      setWorkspaceError(null);
                      setWorkspacePath('');
                      setWorkspaceTree([]);
                      localStorage.removeItem('codex_workspace_dir');
                    }}
                    className="px-2.5 py-1 bg-bg-card hover:bg-bg-hover text-text-secondary border border-border rounded text-[11px] transition-colors cursor-pointer"
                  >
                    清除此工作区
                  </button>
                </div>
              </div>
            )}

            {/* 文件树内容 */}
            {isLoadingWorkspace ? (
              <div className="py-8 text-center text-text-muted space-y-2">
                <Loader2 size={18} className="animate-spin text-accent mx-auto" />
                <div className="text-xs">正在扫描工程文件...</div>
              </div>
            ) : workspaceTree.length > 0 ? (
              <div className="space-y-0.5 pr-1 max-h-[calc(100vh-280px)] overflow-y-auto">
                {renderTreeItems(workspaceTree)}
              </div>
            ) : (
              <div className="py-8 px-2 text-center text-text-muted space-y-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mx-auto">
                  <FolderOpen size={18} />
                </div>
                <div className="text-xs text-text-secondary font-medium">尚未选择工作区文件夹</div>
                <p className="text-[11px] leading-relaxed text-text-muted max-w-[180px] mx-auto">
                  点击下方按钮，选择您本地的代码工程目录。
                </p>
                <button
                  onClick={handleSelectWorkspace}
                  className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium shadow-xs hover:brightness-110 transition-all active:scale-95"
                >
                  选择本地文件夹
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: 技能库 */}
        {activeTab === 'skills' && (
          <div className="space-y-2.5">
            {/* 搜索框 */}
            <div className="px-1">
              <input
                type="text"
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                placeholder="搜索技能名称、拼音或关键词..."
                className="w-full px-2.5 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* 分类胶囊过滤条 */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 px-1 no-scrollbar text-[11px]">
              {SKILL_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`px-2 py-0.5 rounded-full whitespace-nowrap transition-colors cursor-pointer text-[10px] font-medium ${
                    selectedCategory === cat.key
                      ? 'bg-accent text-white font-semibold shadow-xs'
                      : 'bg-bg-card hover:bg-bg-hover text-text-secondary border border-border'
                  }`}
                >
                  <span className="mr-0.5">{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* 技能微型卡片列表 (紧凑精致，单项高度约 48px，点击直接弹出详情卡片与实战示例) */}
            <div className="space-y-1 px-0.5">
              {filteredSkills.length > 0 ? (
                filteredSkills.map(sk => {
                  const info = getSkillDisplayInfo(sk.id, sk.name, sk.description);
                  return (
                    <div
                      key={sk.id}
                      onClick={() => setSelectedSkillForModal(sk)}
                      className="p-2 bg-bg-card hover:bg-bg-hover border border-border hover:border-accent/40 rounded-xl transition-all flex items-center justify-between gap-2 group cursor-pointer"
                      title={`点击查看“${info.displayName}”实战用法与示例`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={12} className="text-accent shrink-0 group-hover:scale-110 transition-transform" />
                          <span className="font-semibold text-xs text-text-primary truncate">
                            {info.displayName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-accent font-medium px-1 rounded bg-accent/5 border border-accent/15 shrink-0">
                            /{sk.id}
                          </span>
                          <span className="text-[10px] text-text-muted truncate">
                            {info.chineseSummary}
                          </span>
                        </div>
                      </div>

                      {/* 右侧轻量动作栏 */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedSkillForModal(sk)}
                          className="px-1.5 py-0.5 text-text-muted hover:text-text-primary hover:bg-bg-card border border-transparent hover:border-border rounded text-[10px] transition-colors cursor-pointer"
                          title="查看用法示例与详细说明"
                        >
                          详情
                        </button>
                        <button
                          onClick={() => onInsertPrompt(`/${sk.id} `)}
                          className="px-2 py-0.5 bg-accent/10 hover:bg-accent text-accent hover:text-white rounded text-[10px] font-medium transition-colors cursor-pointer shadow-2xs"
                          title="直接填入输入框"
                        >
                          使用
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-xs text-text-muted space-y-2">
                  <div>未搜索到匹配的技能</div>
                  <button
                    onClick={() => {
                      setSkillSearch('');
                      setSelectedCategory('all');
                    }}
                    className="text-accent underline text-[11px]"
                  >
                    重置筛选条件
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部系统配置入口 */}
      <div className="p-3 border-t border-border bg-bg-sidebar/50 flex items-center justify-between">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
          title="模型服务商配置"
        >
          <Settings size={14} />
          <span>模型配置</span>
        </button>
        <div className="flex items-center gap-1">
          {onOpenFeedback && (
            <button
              type="button"
              onClick={onOpenFeedback}
              className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-bg-hover rounded-lg transition-colors cursor-pointer"
              title="问题反馈与 Bug 报告"
            >
              <Bug size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenTheme}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors cursor-pointer"
            title="主题切换"
          >
            <Palette size={14} />
          </button>
          <button
            type="button"
            onClick={onOpenAbout}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors cursor-pointer"
            title="关于与版本"
          >
            <Info size={14} />
          </button>
        </div>
      </div>

      {/* 技能卡片大浮窗 (含用法示例与实战 Prompt) */}
      <SkillDetailModal
        isOpen={!!selectedSkillForModal}
        onClose={() => setSelectedSkillForModal(null)}
        skill={selectedSkillForModal}
        onInsertPrompt={onInsertPrompt}
      />

      {/* 归档到工作区弹窗 (让用户明确选择归档到哪个工作区) */}
      <ArchiveModal
        isOpen={!!archiveModalSession}
        onClose={() => setArchiveModalSession(null)}
        session={archiveModalSession}
        workspaceFolders={workspaceFolders}
        onConfirm={handleConfirmArchive}
        onSelectNewFolder={handleSelectNewFolderForArchive}
      />
    </aside>
  );
};

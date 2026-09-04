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
  Loader2
} from 'lucide-react';
import { ChatSession } from '@/types/session';
import { SkillItem, WorkspaceFileItem } from '@/types/electron';
import { SKILL_CATEGORIES, SkillCategory, getSkillDisplayInfo, SKILLS_DICTIONARY } from '@/data/skillsDictionary';
import { SkillDetailModal } from '@/components/Modals/SkillDetailModal';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onInsertPrompt: (text: string) => void;
  onOpenSettings: () => void;
  onOpenTheme: () => void;
  onOpenAbout: () => void;
  onWorkspaceChange?: (path: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onInsertPrompt,
  onOpenSettings,
  onOpenTheme,
  onOpenAbout,
  onWorkspaceChange,
}) => {
  const [activeTab, setActiveTab] = useState<'sessions' | 'files' | 'skills'>('sessions');
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [skillSearch, setSkillSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory>('all');
  const [selectedSkillForModal, setSelectedSkillForModal] = useState<SkillItem | null>(null);

  // 工作区状态
  const [workspacePath, setWorkspacePath] = useState<string>(() => {
    return localStorage.getItem('codex_workspace_dir') || '';
  });
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceFileItem[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (window.codexDesktop && window.codexDesktop.getSkills) {
      window.codexDesktop.getSkills().then(list => {
        if (Array.isArray(list)) setSkills(list);
      });
    }
  }, []);

  // 挂载或工作区路径变化时加载真实工程文件树
  const loadWorkspaceTree = async (dirPath: string) => {
    if (!dirPath || !window.codexDesktop?.readWorkspaceTree) return;
    setIsLoadingWorkspace(true);
    try {
      const res = await window.codexDesktop.readWorkspaceTree(dirPath);
      if (res && res.tree) {
        setWorkspaceTree(res.tree);
        setWorkspaceName(res.rootName || '工作区');
      } else if (res && res.error) {
        console.error('加载工作区失败:', res.error);
      }
    } catch (err) {
      console.error('读取工作区异常:', err);
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  useEffect(() => {
    if (workspacePath) {
      loadWorkspaceTree(workspacePath);
      if (onWorkspaceChange) onWorkspaceChange(workspacePath);
    }
  }, [workspacePath]);

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

  const toggleFolder = (folderKey: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderKey]: !prev[folderKey] }));
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
    return <FileText size={13} className="text-text-muted shrink-0" />;
  };

  // 递归渲染目录树节点
  const renderTreeItems = (items: WorkspaceFileItem[], depth = 0) => {
    return items.map(item => {
      if (item.isDirectory) {
        const isExpanded = !!expandedFolders[item.fullPath];
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
            </div>
            {isExpanded && item.children && item.children.length > 0 && (
              <div>{renderTreeItems(item.children, depth + 1)}</div>
            )}
          </div>
        );
      } else {
        return (
          <div
            key={item.fullPath}
            onClick={() => onInsertPrompt(`@${item.path}`)}
            style={{ paddingLeft: `${depth * 10 + 20}px` }}
            className="flex items-center gap-1.5 py-1 pr-2 rounded-md hover:bg-bg-hover cursor-pointer text-text-muted hover:text-text-primary text-xs transition-colors group"
            title={`点击在输入框引用 @${item.path}\n${item.fullPath}`}
          >
            {getFileIcon(item.name)}
            <span className="truncate group-hover:text-text-primary">{item.name}</span>
          </div>
        );
      }
    });
  };

  return (
    <aside className="w-64 h-full bg-bg-sidebar border-r border-border flex flex-col flex-shrink-0 select-none">
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
        {/* Tab 1: 会话列表 */}
        {activeTab === 'sessions' && (
          <div className="space-y-1">
            {sessions.map((s) => {
              const isActive = s.id === currentSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className={`group relative flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                    isActive
                      ? 'bg-accent/15 border border-accent/30 text-accent font-medium'
                      : 'hover:bg-bg-hover text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageSquare size={14} className={isActive ? 'text-accent' : 'text-text-muted'} />
                    <span className="text-xs truncate">{s.title || '新会话'}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-text-muted transition-all"
                    title="删除会话"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
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
          <button
            onClick={onOpenTheme}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
            title="主题切换"
          >
            <Palette size={14} />
          </button>
          <button
            onClick={onOpenAbout}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
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
    </aside>
  );
};

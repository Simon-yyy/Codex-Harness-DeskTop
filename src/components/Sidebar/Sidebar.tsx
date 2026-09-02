import React, { useState, useEffect } from 'react';
import { MessageSquare, Folder, Sparkles, Plus, Trash2, Settings, Palette, Info, ChevronRight, ChevronDown, FileText, Image } from 'lucide-react';
import { ChatSession } from '@/types/session';
import { SkillItem } from '@/types/electron';

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
}) => {
  const [activeTab, setActiveTab] = useState<'sessions' | 'files' | 'skills'>('sessions');
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [skillSearch, setSkillSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'ui/': true,
    'assets/': false,
    '.agents/': false
  });

  useEffect(() => {
    if (window.codexDesktop && window.codexDesktop.getSkills) {
      window.codexDesktop.getSkills().then(list => {
        if (Array.isArray(list)) setSkills(list);
      });
    }
  }, []);

  const toggleFolder = (folder: string) => {
    setExpandedFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
  };

  const filteredSkills = skills.filter(s => 
    s.name.toLowerCase().includes(skillSearch.toLowerCase()) || 
    s.description.toLowerCase().includes(skillSearch.toLowerCase())
  );

  return (
    <aside className="w-64 h-full bg-bg-sidebar border-r border-border flex flex-col flex-shrink-0 select-none">
      {/* 品牌 Header */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center font-bold text-white shadow-sm">
          CX
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary tracking-wide">Codex Desktop</h2>
          <span className="text-[10px] text-accent-warm font-mono tracking-wider font-semibold">HARNESS v1.0</span>
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
            <div className="text-[11px] font-semibold text-text-muted px-2 py-1 uppercase tracking-wider">
              近期会话 ({sessions.length})
            </div>
            {sessions.map(s => {
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

        {/* Tab 2: 文件树 */}
        {activeTab === 'files' && (
          <div className="space-y-1 text-xs">
            <div className="text-[11px] font-semibold text-text-muted px-2 py-1 uppercase tracking-wider">
              项目工作区
            </div>
            
            {/* Folder: ui/ */}
            <div>
              <div 
                onClick={() => toggleFolder('ui/')}
                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-text-secondary hover:text-text-primary font-medium"
              >
                {expandedFolders['ui/'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Folder size={14} className="text-amber-400" />
                <span>ui/</span>
              </div>
              {expandedFolders['ui/'] && (
                <div className="pl-6 space-y-0.5 mt-0.5">
                  <div onClick={() => onInsertPrompt('@ui/index.html')} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-text-muted hover:text-text-primary">
                    <FileText size={13} className="text-blue-400" />
                    <span>index.html</span>
                  </div>
                  <div onClick={() => onInsertPrompt('@ui/style.css')} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-text-muted hover:text-text-primary">
                    <FileText size={13} className="text-sky-400" />
                    <span>style.css</span>
                  </div>
                  <div onClick={() => onInsertPrompt('@ui/app.js')} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-text-muted hover:text-text-primary">
                    <FileText size={13} className="text-yellow-400" />
                    <span>app.js</span>
                  </div>
                </div>
              )}
            </div>

            {/* Folder: assets/ */}
            <div>
              <div 
                onClick={() => toggleFolder('assets/')}
                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-text-secondary hover:text-text-primary font-medium"
              >
                {expandedFolders['assets/'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Folder size={14} className="text-amber-400" />
                <span>assets/</span>
              </div>
              {expandedFolders['assets/'] && (
                <div className="pl-6 space-y-0.5 mt-0.5">
                  <div onClick={() => onInsertPrompt('@assets/icon.png')} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-text-muted hover:text-text-primary">
                    <Image size={13} className="text-emerald-400" />
                    <span>icon.png</span>
                  </div>
                </div>
              )}
            </div>

            {/* Root files */}
            <div onClick={() => onInsertPrompt('@main.js')} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-text-secondary hover:text-text-primary">
              <FileText size={13} className="text-yellow-400" />
              <span>main.js</span>
            </div>
            <div onClick={() => onInsertPrompt('@preload.js')} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-text-secondary hover:text-text-primary">
              <FileText size={13} className="text-yellow-400" />
              <span>preload.js</span>
            </div>
            <div onClick={() => onInsertPrompt('@package.json')} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover cursor-pointer text-text-secondary hover:text-text-primary">
              <FileText size={13} className="text-red-400" />
              <span>package.json</span>
            </div>
          </div>
        )}

        {/* Tab 3: 技能库 */}
        {activeTab === 'skills' && (
          <div className="space-y-2">
            <div className="px-1">
              <input
                type="text"
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                placeholder="搜索 43 项技能..."
                className="w-full px-2.5 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <div className="space-y-1">
              {filteredSkills.map(sk => (
                <div
                  key={sk.id}
                  onClick={() => onInsertPrompt(`/${sk.id} `)}
                  className="p-2 bg-bg-card hover:bg-bg-hover border border-border hover:border-accent/40 rounded-lg cursor-pointer transition-all"
                  title="点击将技能指令注入输入框"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-text-primary mb-0.5">
                    <span className="flex items-center gap-1">
                      <Sparkles size={12} className="text-accent" />
                      {sk.name}
                    </span>
                    <span className="text-[10px] font-mono text-accent-warm px-1.5 py-0.5 bg-accent/10 rounded">/{sk.id}</span>
                  </div>
                  <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed">{sk.description}</p>
                </div>
              ))}
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
    </aside>
  );
};

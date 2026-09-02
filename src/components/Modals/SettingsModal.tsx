import React, { useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, Shield, Globe, Key, List, Server } from 'lucide-react';
import { ProviderPreset } from '@/types/provider';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderPreset[];
  onSaveProviders: (providers: ProviderPreset[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  providers,
  onSaveProviders,
}) => {
  const [localProviders, setLocalProviders] = useState<ProviderPreset[]>(providers);
  const [activeProviderId, setActiveProviderId] = useState<string>(providers[0]?.id || 'openai');
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const currentProvider = localProviders.find(p => p.id === activeProviderId) || localProviders[0];

  const updateProviderField = (field: keyof ProviderPreset, value: any) => {
    setLocalProviders(prev => prev.map(p => {
      if (p.id === activeProviderId) {
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const handleAddNewProvider = () => {
    const newId = 'custom_' + Date.now();
    const newProv: ProviderPreset = {
      id: newId,
      name: '自定义提供方',
      type: 'custom',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      models: 'gpt-5.6-sol, custom-model',
      isCustom: true
    };
    setLocalProviders(prev => [...prev, newProv]);
    setActiveProviderId(newId);
  };

  const handleDeleteProvider = (id: string) => {
    setLocalProviders(prev => prev.filter(p => p.id !== id));
    if (activeProviderId === id) {
      setActiveProviderId(localProviders[0]?.id || '');
    }
  };

  const handleSave = () => {
    onSaveProviders(localProviders);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-bg-sidebar">
          <div>
            <h3 className="text-sm font-bold text-text-primary">模型配置中心</h3>
            <p className="text-xs text-text-muted">填入各提供方的 API 密钥与模型列表即可使用。</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary rounded-lg">
            <X size={16} />
          </button>
        </div>

        {/* 主体两栏布局 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧提供方列表 (紧凑收容) */}
          <div className="w-56 border-r border-border p-2.5 space-y-1.5 overflow-y-auto bg-bg-sidebar/40">
            <div className="text-[10px] font-bold text-text-muted px-2 uppercase tracking-wider mb-1">
              服务商列表 ({localProviders.length})
            </div>
            {localProviders.map(p => {
              const modelCount = (p.models || '').split(/[\n,，]+/).filter(Boolean).length;
              return (
                <div
                  key={p.id}
                  onClick={() => setActiveProviderId(p.id)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                    activeProviderId === p.id
                      ? 'bg-accent/15 text-accent font-semibold border border-accent/30 shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Server size={14} className={activeProviderId === p.id ? 'text-accent' : 'text-text-muted'} />
                    <span className="truncate font-medium">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono text-text-muted px-1.5 py-0.5 bg-bg-base/80 rounded border border-border/60">
                      {modelCount} 款
                    </span>
                    {p.isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProvider(p.id);
                        }}
                        className="text-text-muted hover:text-red-400 p-0.5 transition-colors"
                        title="删除该自定义提供方"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              onClick={handleAddNewProvider}
              className="w-full mt-3 py-2 px-2 border border-dashed border-border hover:border-accent/60 text-text-muted hover:text-accent rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors font-medium"
            >
              <Plus size={13} />
              <span>添加自定义提供方</span>
            </button>
          </div>

          {/* 右侧表单区 */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {currentProvider && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                    <Server size={13} className="text-accent" />
                    提供方名称
                  </label>
                  <input
                    type="text"
                    value={currentProvider.name}
                    onChange={(e) => updateProviderField('name', e.target.value)}
                    className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                    <Globe size={13} className="text-accent" />
                    API Base URL
                  </label>
                  <input
                    type="text"
                    value={currentProvider.baseUrl}
                    onChange={(e) => updateProviderField('baseUrl', e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                    <Key size={13} className="text-accent" />
                    API Key
                  </label>
                  <input
                    type="password"
                    value={currentProvider.apiKey}
                    onChange={(e) => updateProviderField('apiKey', e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                  />
                  <p className="text-[11px] text-text-muted">密钥仅保存在本地客户端隔离环境中，严禁明文外泄。</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <List size={13} className="text-accent" />
                      收容管理的模型列表
                    </label>
                    <span className="text-[11px] text-text-muted">英文逗号或换行分隔</span>
                  </div>

                  {/* 收容模型胶囊预览 */}
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-bg-base/50 rounded-lg border border-border/80">
                    {(currentProvider.models || '').split(/[\n,，]+/).filter(Boolean).map((m, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-bg-card border border-border rounded text-[11px] font-mono text-text-secondary">
                        {m.trim()}
                      </span>
                    ))}
                  </div>

                  <textarea
                    rows={3}
                    value={currentProvider.models}
                    onChange={(e) => updateProviderField('models', e.target.value)}
                    placeholder="gpt-5.6-sol, gpt-5.4-mini, claude-3-7-sonnet"
                    className="w-full px-3 py-2 bg-bg-base border border-border rounded-lg text-xs font-mono text-text-primary focus:outline-none focus:border-accent leading-relaxed"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-bg-sidebar flex items-center justify-between">
          <div className="text-xs text-green-500 font-medium flex items-center gap-1">
            {savedSuccess && (
              <>
                <CheckCircle2 size={14} />
                <span>配置保存成功！</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border hover:bg-bg-hover rounded-lg text-xs text-text-secondary transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-gradient-to-r from-accent to-accent-secondary hover:brightness-110 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
            >
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

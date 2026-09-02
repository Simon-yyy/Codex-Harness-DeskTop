import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  Globe,
  Key,
  List,
  Server,
  Eye,
  EyeOff,
  Activity,
  RotateCcw,
  Cpu,
  Sparkles,
  AlertCircle,
  Loader2,
  Sliders,
  ChevronRight
} from 'lucide-react';
import { ProviderPreset, ProviderProtocol, ModelDetailConfig } from '@/types/provider';
import { DEFAULT_PROVIDER_PRESETS, parseModelList } from '@/hooks/useProviders';

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
  const [localProviders, setLocalProviders] = useState<ProviderPreset[]>(() => {
    return providers.length > 0 ? providers : DEFAULT_PROVIDER_PRESETS;
  });
  const [activeProviderId, setActiveProviderId] = useState<string>(providers[0]?.id || 'openai');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showModelApiKey, setShowModelApiKey] = useState(false);
  const [newModelInput, setNewModelInput] = useState('');

  // 当前选中的模型胶囊名称 (用于展开其专属独立配置)
  const [selectedModelName, setSelectedModelName] = useState<string>('');

  // 连通性测试状态 (支持针对特定模型或服务商全局)
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    modelName?: string;
    latency?: number;
  } | null>(null);

  if (!isOpen) return null;

  const currentProvider = localProviders.find(p => p.id === activeProviderId) || localProviders[0];

  // 确保当前选中的模型胶囊有效
  const currentModelList = parseModelList(currentProvider?.models || '');
  const activeModelName = (selectedModelName && currentModelList.includes(selectedModelName))
    ? selectedModelName
    : (currentModelList[0] || '');

  // 获取当前选中模型的独立配置对象
  const activeModelConfig: ModelDetailConfig = (currentProvider?.modelConfigs || []).find(
    c => c.name.toLowerCase() === activeModelName.toLowerCase()
  ) || {
    id: activeModelName,
    name: activeModelName
  };

  const updateProviderField = (field: keyof ProviderPreset, value: any) => {
    setLocalProviders(prev => prev.map(p => {
      if (p.id === activeProviderId) {
        return { ...p, [field]: value };
      }
      return p;
    }));
    setTestResult(null);
  };

  // 更新当前选中模型的专属独立配置
  const updateActiveModelConfig = (field: keyof ModelDetailConfig, value: any) => {
    if (!currentProvider || !activeModelName) return;

    const existingConfigs = [...(currentProvider.modelConfigs || [])];
    const idx = existingConfigs.findIndex(c => c.name.toLowerCase() === activeModelName.toLowerCase());

    if (idx !== -1) {
      existingConfigs[idx] = { ...existingConfigs[idx], [field]: value };
    } else {
      existingConfigs.push({
        id: activeModelName,
        name: activeModelName,
        [field]: value
      });
    }

    setLocalProviders(prev => prev.map(p => {
      if (p.id === activeProviderId) {
        return { ...p, modelConfigs: existingConfigs };
      }
      return p;
    }));
    setTestResult(null);
  };

  const handleAddNewProvider = () => {
    const newId = 'custom_' + Date.now();
    const newProv: ProviderPreset = {
      id: newId,
      name: '自定义提供方',
      protocol: 'openai',
      type: 'custom',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      models: 'gpt-5.6-sol',
      modelConfigs: [{ id: 'gpt-5.6-sol', name: 'gpt-5.6-sol' }],
      isCustom: true
    };
    setLocalProviders(prev => [...prev, newProv]);
    setActiveProviderId(newId);
    setSelectedModelName('gpt-5.6-sol');
    setTestResult(null);
  };

  const handleDeleteProvider = (id: string) => {
    const remaining = localProviders.filter(p => p.id !== id);
    setLocalProviders(remaining);
    if (activeProviderId === id) {
      setActiveProviderId(remaining[0]?.id || '');
    }
    setSelectedModelName('');
    setTestResult(null);
  };

  const handleResetDefaults = () => {
    if (window.confirm('确定要恢复默认官方模型服务商配置吗？当前未保存的修改将被重置。')) {
      setLocalProviders(DEFAULT_PROVIDER_PRESETS);
      setActiveProviderId('openai');
      setSelectedModelName('');
      setTestResult(null);
    }
  };

  // 添加新模型胶囊并立即选中它进入专属配置
  const handleAddModelTag = () => {
    const trimmed = newModelInput.trim();
    if (!trimmed) return;
    if (currentModelList.includes(trimmed)) {
      setSelectedModelName(trimmed);
      setNewModelInput('');
      return;
    }
    const updatedModels = [...currentModelList, trimmed].join(', ');
    const existingConfigs = [...(currentProvider?.modelConfigs || [])];
    if (!existingConfigs.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      existingConfigs.push({ id: trimmed, name: trimmed });
    }

    setLocalProviders(prev => prev.map(p => {
      if (p.id === activeProviderId) {
        return { ...p, models: updatedModels, modelConfigs: existingConfigs };
      }
      return p;
    }));

    setSelectedModelName(trimmed);
    setNewModelInput('');
    setTestResult(null);
  };

  // 移除指定模型胶囊
  const handleRemoveModelTag = (tagToRemove: string) => {
    const updatedModels = currentModelList.filter(m => m !== tagToRemove).join(', ');
    const updatedConfigs = (currentProvider?.modelConfigs || []).filter(
      c => c.name.toLowerCase() !== tagToRemove.toLowerCase()
    );

    setLocalProviders(prev => prev.map(p => {
      if (p.id === activeProviderId) {
        return { ...p, models: updatedModels, modelConfigs: updatedConfigs };
      }
      return p;
    }));

    if (activeModelName.toLowerCase() === tagToRemove.toLowerCase()) {
      const remainingList = currentModelList.filter(m => m !== tagToRemove);
      setSelectedModelName(remainingList[0] || '');
    }
    setTestResult(null);
  };

  // 专门测试选中模型或服务商的连通性
  const handleTestConnection = async (targetModelName?: string) => {
    if (!currentProvider) return;
    if (!window.codexDesktop || !window.codexDesktop.callLlmApi) {
      setTestResult({
        success: false,
        message: '当前运行环境未检测到底层 callLlmApi 管道'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    const startTime = Date.now();

    const modelToTest = targetModelName || activeModelName || currentModelList[0] || 'gpt-5.6-sol';
    const modelCfg = (currentProvider.modelConfigs || []).find(
      c => c.name.toLowerCase() === modelToTest.toLowerCase()
    );

    // 专属独立配置优先于服务商默认配置
    const effectiveProtocol = modelCfg?.protocol || currentProvider.protocol || 'openai';
    let effectiveBaseUrl = (modelCfg?.baseUrl?.trim() || currentProvider.baseUrl.trim()).replace(/\/+$/, '');
    const effectiveApiKey = (modelCfg?.apiKey?.trim() || currentProvider.apiKey || '').trim();

    try {
      let body: any = {};
      if (effectiveProtocol === 'anthropic') {
        if (!effectiveBaseUrl.endsWith('/messages')) effectiveBaseUrl += '/v1/messages';
        body = {
          model: modelToTest,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }]
        };
      } else if (effectiveProtocol === 'ollama') {
        if (!effectiveBaseUrl.endsWith('/chat/completions') && !effectiveBaseUrl.endsWith('/api/chat')) {
          effectiveBaseUrl += '/v1/chat/completions';
        }
        body = {
          model: modelToTest,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        };
      } else {
        // OpenAI 兼容协议
        if (!effectiveBaseUrl.endsWith('/chat/completions')) {
          effectiveBaseUrl += '/chat/completions';
        }
        body = {
          model: modelToTest,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        };
      }

      const res: any = await window.codexDesktop.callLlmApi({
        endpoint: effectiveBaseUrl,
        apiKey: effectiveApiKey,
        body
      });

      const latency = Date.now() - startTime;

      if (res && res.ok) {
        setTestResult({
          success: true,
          modelName: modelToTest,
          message: `模型 [${modelToTest}] 连通成功！HTTP ${res.status || 200} (耗时 ${latency}ms)`,
          latency
        });
      } else {
        let errSnippet = '';
        if (res && res.body) {
          errSnippet = typeof res.body === 'string' ? res.body.slice(0, 80) : JSON.stringify(res.body).slice(0, 80);
        } else if (res && res.statusText) {
          errSnippet = res.statusText;
        } else {
          errSnippet = '网络响应超时或拒绝连接';
        }
        setTestResult({
          success: false,
          modelName: modelToTest,
          message: `[${modelToTest}] 连通失败 [HTTP ${res?.status || 500}]: ${errSnippet}`
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        modelName: modelToTest,
        message: `通信异常: ${err?.message || '网络连接失败'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    onSaveProviders(localProviders);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 500);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-bg-sidebar shrink-0">
          <div>
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Server size={16} className="text-accent" />
              <span>模型服务商与模型胶囊独立配置中心</span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              每个模型均以小胶囊呈现；点击任意模型胶囊可展开其专属独立配置，彼此互不干扰，支持按模型单独测试连通性。
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 主体两栏布局 */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* 左侧提供方导航列表 */}
          <div className="w-56 border-r border-border p-2.5 flex flex-col justify-between bg-bg-sidebar/40 shrink-0">
            <div className="space-y-1 overflow-y-auto max-h-[500px] pr-1">
              <div className="text-[10px] font-bold text-text-muted px-2 uppercase tracking-wider mb-1">
                服务商列表 ({localProviders.length})
              </div>
              {localProviders.map(p => {
                const modelCount = parseModelList(p.models || '').length;
                const isSelected = activeProviderId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setActiveProviderId(p.id);
                      setSelectedModelName('');
                      setTestResult(null);
                    }}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer text-xs transition-all ${
                      isSelected
                        ? 'bg-accent/15 text-accent font-semibold border border-accent/30 shadow-xs'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          p.apiKey || p.id === 'ollama' ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-zinc-500'
                        }`}
                        title={p.apiKey || p.id === 'ollama' ? '已配置密钥' : '未配置密钥'}
                      />
                      <span className="truncate font-medium">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] font-mono text-text-muted px-1.5 py-0.5 bg-bg-base/80 rounded border border-border/60">
                        {modelCount} 胶囊
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProvider(p.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 p-0.5 hover:bg-red-500/10 rounded transition-all"
                        title="删除该服务商"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {localProviders.length === 0 && (
                <div className="p-4 text-center text-xs text-text-muted">
                  暂无服务商，请点击下方添加
                </div>
              )}
            </div>

            {/* 左侧底部快捷操作 */}
            <div className="pt-2 border-t border-border space-y-1 shrink-0">
              <button
                onClick={handleAddNewProvider}
                className="w-full py-1.5 px-2 border border-dashed border-border hover:border-accent/60 text-text-muted hover:text-accent rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors font-medium"
              >
                <Plus size={13} />
                <span>添加新服务商</span>
              </button>
              <button
                onClick={handleResetDefaults}
                className="w-full py-1 px-2 text-text-muted hover:text-text-secondary text-[11px] flex items-center justify-center gap-1 transition-colors"
                title="重置恢复默认 5 大官方服务商"
              >
                <RotateCcw size={11} />
                <span>恢复默认预设</span>
              </button>
            </div>
          </div>

          {/* 右侧主配置区 (分服务商全局配置 + 模型小胶囊独立配置) */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
            {currentProvider ? (
              <>
                {/* ══════════ 1. 服务商通用统一配置 (名称 + 协议) ══════════ */}
                <div className="space-y-3 p-3.5 bg-bg-sidebar/30 rounded-xl border border-border/80">
                  <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <Server size={13} className="text-accent" />
                    <span>服务商通用配置 ({currentProvider.name})</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* 提供方名称 */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                        <Server size={12} className="text-accent" />
                        提供方名称
                      </label>
                      <input
                        type="text"
                        value={currentProvider.name}
                        onChange={(e) => updateProviderField('name', e.target.value)}
                        placeholder="如: DeepSeek 官方 / Anthropic 官方"
                        className="w-full px-3 py-1.5 bg-bg-base border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent font-medium"
                      />
                    </div>

                    {/* 通信协议类型 */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                        <Cpu size={12} className="text-accent" />
                        通信协议类型 (Protocol)
                      </label>
                      <select
                        value={currentProvider.protocol || 'openai'}
                        onChange={(e) => updateProviderField('protocol', e.target.value as ProviderProtocol)}
                        className="w-full px-3 py-1.5 bg-bg-base border border-border rounded-lg text-xs font-medium text-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="openai">OpenAI 兼容协议 (Chat Completions: /v1/chat/completions)</option>
                        <option value="anthropic">Anthropic Messages 协议 (/v1/messages)</option>
                        <option value="ollama">Ollama 本地协议 (http://127.0.0.1:11434)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* ══════════ 2. 模型小胶囊列表区 (点击切换当前配置模型) ══════════ */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                      <List size={13} className="text-accent" />
                      <span>收容管理的模型列表 (每个模型独立胶囊 · 点击切换配置)</span>
                    </label>
                    <span className="text-[11px] text-text-muted font-mono">
                      {currentModelList.length} 款模型
                    </span>
                  </div>

                  {/* 独立胶囊流 */}
                  <div className="flex flex-wrap gap-1.5 min-h-11 p-2 bg-bg-base/70 rounded-xl border border-border/80 max-h-32 overflow-y-auto">
                    {currentModelList.map((modelName) => {
                      const isCapsuleActive = activeModelName.toLowerCase() === modelName.toLowerCase();
                      const cfg = (currentProvider.modelConfigs || []).find(
                        c => c.name.toLowerCase() === modelName.toLowerCase()
                      );
                      const hasCustomKey = Boolean(cfg?.apiKey || (isCapsuleActive && currentProvider.apiKey));

                      return (
                        <div
                          key={modelName}
                          onClick={() => {
                            setSelectedModelName(modelName);
                            setTestResult(null);
                          }}
                          className={`group flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
                            isCapsuleActive
                              ? 'bg-accent text-white font-bold shadow-xs ring-2 ring-accent/30'
                              : 'bg-bg-card hover:bg-bg-card-elevated border border-border text-text-primary hover:border-accent/40'
                          }`}
                        >
                          <Sparkles size={11} className={isCapsuleActive ? 'text-white' : 'text-accent'} />
                          <span>{modelName}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveModelTag(modelName);
                            }}
                            className={`p-0.5 rounded transition-colors ${
                              isCapsuleActive
                                ? 'hover:bg-white/20 text-white/80'
                                : 'text-text-muted hover:text-red-400 hover:bg-red-500/10'
                            }`}
                            title={`移除模型 ${modelName}`}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      );
                    })}

                    {currentModelList.length === 0 && (
                      <div className="text-xs text-text-muted flex items-center gap-1 p-1">
                        <AlertCircle size={13} />
                        <span>暂无模型，请在下方添加</span>
                      </div>
                    )}
                  </div>

                  {/* 快捷添加单个模型输入框 */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newModelInput}
                      onChange={(e) => setNewModelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddModelTag();
                        }
                      }}
                      placeholder="输入模型名 (如 deepseek-v4 / gpt-5.6-sol) 按 Enter 立即生成独立胶囊"
                      className="flex-1 px-3 py-1.5 bg-bg-base border border-border rounded-lg text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={handleAddModelTag}
                      className="px-3.5 py-1.5 bg-accent hover:brightness-110 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0 shadow-2xs"
                    >
                      <Plus size={13} />
                      <span>添加胶囊</span>
                    </button>
                  </div>
                </div>

                {/* ══════════ 3. 选定模型专属独立配置 (Base URL + API Key + 连通测试) ══════════ */}
                {activeModelName ? (
                  <div className="p-3.5 bg-bg-card rounded-xl border-2 border-accent/40 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-border/70 pb-2">
                      <div className="flex items-center gap-2">
                        <Sliders size={13} className="text-accent" />
                        <span className="text-xs font-bold text-text-primary">
                          【{activeModelName}】模型专属配置 (独立配置 · 互不干扰)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRemoveModelTag(activeModelName)}
                          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-0.5 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 size={11} />
                          <span>移除此模型</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {/* 1. API Base URL (接口基地址) */}
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                          <Globe size={12} className="text-accent" />
                          API Base URL (接口基地址)
                        </label>
                        <input
                          type="text"
                          value={activeModelConfig.baseUrl ?? currentProvider.baseUrl}
                          onChange={(e) => {
                            updateActiveModelConfig('baseUrl', e.target.value);
                            updateProviderField('baseUrl', e.target.value);
                          }}
                          placeholder={
                            currentProvider.protocol === 'anthropic'
                              ? 'https://api.anthropic.com/v1'
                              : currentProvider.protocol === 'ollama'
                              ? 'http://127.0.0.1:11434'
                              : 'https://api.openai.com/v1'
                          }
                          className="w-full px-3 py-1.5 bg-bg-base border border-border rounded-lg text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                        />
                      </div>

                      {/* 2. API Key (密钥凭证) */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                            <Key size={12} className="text-accent" />
                            API Key (密钥凭证)
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowModelApiKey(!showModelApiKey)}
                            className="text-[11px] text-text-muted hover:text-accent flex items-center gap-1 transition-colors"
                          >
                            {showModelApiKey ? <EyeOff size={11} /> : <Eye size={11} />}
                            <span>{showModelApiKey ? '隐藏密文' : '显示明文'}</span>
                          </button>
                        </div>
                        <input
                          type={showModelApiKey ? 'text' : 'password'}
                          value={activeModelConfig.apiKey ?? currentProvider.apiKey}
                          onChange={(e) => {
                            updateActiveModelConfig('apiKey', e.target.value);
                            updateProviderField('apiKey', e.target.value);
                          }}
                          placeholder="sk-..."
                          className="w-full px-3 py-1.5 bg-bg-base border border-border rounded-lg text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>

                    {/* 3. 在线连通性测试模块 */}
                    <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {testResult ? (
                          <div
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono truncate ${
                              testResult.success
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/15 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {testResult.success ? <CheckCircle2 size={13} className="shrink-0" /> : <AlertCircle size={13} className="shrink-0" />}
                            <span className="truncate text-[11px]">{testResult.message}</span>
                          </div>
                        ) : (
                          <span className="text-text-muted text-[11px] truncate block">
                            向当前模型【{activeModelName}】接口发送轻量探测请求以验证连通性。
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestConnection(activeModelName)}
                        disabled={isTesting}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all shrink-0 ${
                          isTesting
                            ? 'bg-bg-hover text-text-muted border-border cursor-not-allowed'
                            : 'bg-bg-base hover:bg-accent/15 text-text-primary hover:text-accent border-border hover:border-accent/40 shadow-2xs'
                        }`}
                      >
                        {isTesting ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-accent" />
                            <span>正在探测...</span>
                          </>
                        ) : (
                          <>
                            <Activity size={13} className="text-accent" />
                            <span>⚡ 测试连通性</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-text-muted">
                请在左侧选择或添加一个服务商
              </div>
            )}
          </div>
        </div>

        {/* 底部保存与状态条 */}
        <div className="px-5 py-3 border-t border-border bg-bg-sidebar flex items-center justify-between shrink-0">
          <div className="text-xs text-emerald-400 font-medium flex items-center gap-1">
            {savedSuccess && (
              <>
                <CheckCircle2 size={14} />
                <span>配置已成功保存并立即生效！</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 border border-border hover:bg-bg-hover rounded-lg text-xs text-text-secondary transition-colors font-medium"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-1.5 bg-gradient-to-r from-accent to-accent-secondary hover:brightness-110 text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
            >
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

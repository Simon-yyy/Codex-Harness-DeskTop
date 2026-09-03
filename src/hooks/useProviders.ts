import { useState, useEffect } from 'react';
import { ProviderPreset, ModelOption } from '@/types/provider';

export const DEFAULT_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI 官方',
    protocol: 'openai',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: 'gpt-5.6-sol, gpt-5.4-mini, gpt-5.4, gpt-5.5, gpt-4o, gpt-4o-mini, o3, o3-mini'
  },
  {
    id: 'anthropic',
    name: 'Anthropic 官方 (Claude)',
    protocol: 'anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    models: 'claude-3-7-sonnet, claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    protocol: 'openai',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: 'deepseek-reasoner, deepseek-chat'
  },
  {
    id: 'ollama',
    name: 'Ollama 本地内核',
    protocol: 'ollama',
    type: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    apiKey: 'ollama',
    models: 'llama3.3:latest, deepseek-r1:14b, qwen2.5-coder:14b, mistral:latest'
  },
  {
    id: 'agentrouter',
    name: 'AgentRouter 聚合管道',
    protocol: 'openai',
    type: 'openai',
    baseUrl: 'https://api.agentrouter.org/v1',
    apiKey: '',
    models: 'gpt-5.6-sol, gpt-5.4-mini, claude-3-7-sonnet, deepseek-reasoner, o3-mini'
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容接口',
    protocol: 'openai',
    type: 'custom',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: '',
    isCustom: true
  }
];

export function parseModelList(rawModels: string): string[] {
  if (!rawModels || typeof rawModels !== 'string') return [];
  return rawModels
    .split(/[\n,，]+/)
    .map(m => m.trim())
    .filter(Boolean);
}

export function normalizeAndDeduplicateProviders(rawList: any[]): ProviderPreset[] {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return DEFAULT_PROVIDER_PRESETS;
  }

  const result: ProviderPreset[] = [];
  const seenIds = new Set<string>();

  rawList.forEach((item) => {
    if (!item) return;
    const id = String(item.id || ('prov_' + Math.random().toString(36).slice(2, 7)));
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const name = String(item.name || '未命名服务商');
    const baseUrl = String(item.baseUrl || 'https://api.openai.com/v1');
    const apiKey = String(item.apiKey || '');
    const models = typeof item.models === 'string' ? item.models : '';

    let protocol = item.protocol;
    if (!protocol) {
      if (id === 'anthropic' || name.toLowerCase().includes('anthropic') || name.toLowerCase().includes('claude')) {
        protocol = 'anthropic';
      } else if (id === 'ollama' || baseUrl.includes('11434')) {
        protocol = 'ollama';
      } else {
        protocol = 'openai';
      }
    }

    const modelNameList = parseModelList(models);
    const existingConfigs: Record<string, any> = {};
    if (Array.isArray(item.modelConfigs)) {
      item.modelConfigs.forEach((cfg: any) => {
        if (cfg && cfg.name) {
          existingConfigs[cfg.name.toLowerCase()] = cfg;
        }
      });
    }

    const modelConfigs = modelNameList.map(name => {
      const exist = existingConfigs[name.toLowerCase()];
      return {
        id: exist?.id || name,
        name: name,
        displayName: exist?.displayName || name,
        protocol: exist?.protocol,
        baseUrl: exist?.baseUrl,
        apiKey: exist?.apiKey,
        timeoutSeconds: exist?.timeoutSeconds,
        temperature: exist?.temperature,
        maxTokens: exist?.maxTokens
      };
    });

    result.push({
      id,
      name,
      protocol,
      type: item.type || (item.isCustom ? 'custom' : 'openai'),
      baseUrl,
      apiKey,
      models,
      modelConfigs,
      isCustom: Boolean(item.isCustom)
    });
  });

  return result.length > 0 ? result : DEFAULT_PROVIDER_PRESETS;
}

export function useProviders() {
  const [providers, setProviders] = useState<ProviderPreset[]>(() => {
    try {
      const saved = localStorage.getItem('dsh_providers_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return normalizeAndDeduplicateProviders(parsed);
        }
      }
    } catch (e) {
      console.error('[useProviders] load failed:', e);
    }
    return DEFAULT_PROVIDER_PRESETS;
  });

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('codex_current_selected_model') || 'gpt-5.6-sol';
  });

  const saveProviders = (newProviders: ProviderPreset[]) => {
    setProviders(newProviders);
    try {
      localStorage.setItem('dsh_providers_config', JSON.stringify(newProviders));
    } catch (e) {
      console.error('[useProviders] save failed:', e);
    }
  };

  const selectModel = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem('codex_current_selected_model', model);
  };

  // 提取所有可用模型选项 (携带专属覆盖配置与所属服务商)
  const allModels: ModelOption[] = [];
  providers.forEach(p => {
    const models = parseModelList(p.models);
    models.forEach(m => {
      const modelCfg = (p.modelConfigs || []).find(c => c.name.toLowerCase() === m.toLowerCase());
      if (!allModels.some(opt => opt.value.toLowerCase() === m.toLowerCase())) {
        allModels.push({
          value: m,
          text: modelCfg?.displayName || m,
          providerId: p.id,
          providerName: p.name,
          protocol: modelCfg?.protocol || p.protocol || 'openai',
          baseUrl: modelCfg?.baseUrl || p.baseUrl,
          apiKey: modelCfg?.apiKey || p.apiKey,
          timeoutSeconds: modelCfg?.timeoutSeconds
        });
      }
    });
  });

  return {
    providers,
    saveProviders,
    selectedModel,
    selectModel,
    allModels
  };
}

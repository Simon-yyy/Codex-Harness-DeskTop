import { useState, useEffect } from 'react';
import { ProviderPreset, ModelOption } from '@/types/provider';

export const DEFAULT_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI 官方',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: 'gpt-5.6-sol, gpt-5.4-mini, gpt-5.4, gpt-5.5, gpt-4o, gpt-4o-mini, o3, o3-mini'
  },
  {
    id: 'anthropic',
    name: 'Anthropic 官方 (Claude)',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    models: 'claude-3-7-sonnet, claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: 'deepseek-reasoner, deepseek-chat'
  },
  {
    id: 'ollama',
    name: 'Ollama 本地内核',
    type: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    apiKey: 'ollama',
    models: 'llama3.3:latest, deepseek-r1:14b, qwen2.5-coder:14b, mistral:latest'
  },
  {
    id: 'agentrouter',
    name: 'AgentRouter 聚合管道',
    type: 'openai',
    baseUrl: 'https://api.agentrouter.org/v1',
    apiKey: '',
    models: 'gpt-5.6-sol, gpt-5.4-mini, claude-3-7-sonnet, deepseek-reasoner, o3-mini'
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容接口',
    type: 'custom',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: 'gpt-5.6-sol, gpt-5.4-mini, custom-model',
    isCustom: true
  }
];

export function parseModelList(rawModels: string): string[] {
  if (!rawModels || typeof rawModels !== 'string') return ['gpt-5.6-sol'];
  return rawModels
    .split(/[\n,，]+/)
    .map(m => m.trim())
    .filter(Boolean);
}

export function normalizeAndDeduplicateProviders(rawList: any[]): ProviderPreset[] {
  const canonicalMap: Record<string, ProviderPreset> = {};

  // 初始化 5 大官方核心服务商基准
  DEFAULT_PROVIDER_PRESETS.forEach(def => {
    canonicalMap[def.id] = { ...def, models: def.models };
  });

  const customList: ProviderPreset[] = [];

  if (Array.isArray(rawList)) {
    rawList.forEach(item => {
      if (!item) return;
      const name = String(item.name || '').toLowerCase();
      const id = String(item.id || '').toLowerCase();
      const baseUrl = String(item.baseUrl || '').toLowerCase();
      const itemApiKey = (item.apiKey || '').trim();
      const itemModels = parseModelList(item.models || '');

      let targetKey: string | null = null;

      if (id === 'openai' || name.includes('openai') || baseUrl.includes('openai.com')) {
        targetKey = 'openai';
      } else if (id === 'anthropic' || name.includes('anthropic') || name.includes('claude') || baseUrl.includes('anthropic.com')) {
        targetKey = 'anthropic';
      } else if (id === 'deepseek' || name.includes('deepseek') || baseUrl.includes('deepseek.com')) {
        targetKey = 'deepseek';
      } else if (id === 'ollama' || name.includes('ollama') || baseUrl.includes('11434')) {
        targetKey = 'ollama';
      } else if (id === 'agentrouter' || name.includes('agent router') || name.includes('agentrouter') || name.includes('glm') || baseUrl.includes('agentrouter')) {
        targetKey = 'agentrouter';
      }

      if (targetKey && canonicalMap[targetKey]) {
        // 智能合并 API Key (若历史记录中填了 Key，予以保留)
        if (itemApiKey && (!canonicalMap[targetKey].apiKey || canonicalMap[targetKey].apiKey === 'ollama')) {
          canonicalMap[targetKey].apiKey = itemApiKey;
        }
        if (item.baseUrl && !canonicalMap[targetKey].baseUrl) {
          canonicalMap[targetKey].baseUrl = item.baseUrl;
        }
        // 智能合并模型列表去重
        const existingModels = parseModelList(canonicalMap[targetKey].models);
        itemModels.forEach(m => {
          if (!existingModels.some(em => em.toLowerCase() === m.toLowerCase())) {
            existingModels.push(m);
          }
        });
        canonicalMap[targetKey].models = existingModels.join(', ');
      } else if (item.isCustom || (!targetKey && item.name)) {
        // 真正的独立自定义提供方
        const existIdx = customList.findIndex(c => c.id === item.id || c.name === item.name);
        if (existIdx === -1) {
          customList.push({
            id: item.id || ('custom_' + Math.random().toString(36).slice(2, 7)),
            name: item.name || '自定义提供方',
            type: item.type || 'custom',
            baseUrl: item.baseUrl || 'https://api.openai.com/v1',
            apiKey: itemApiKey,
            models: item.models || 'custom-model',
            isCustom: true
          });
        }
      }
    });
  }

  return [...Object.values(canonicalMap), ...customList];
}

export function useProviders() {
  const [providers, setProviders] = useState<ProviderPreset[]>(() => {
    try {
      const saved = localStorage.getItem('dsh_providers_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const normalized = normalizeAndDeduplicateProviders(parsed);
          localStorage.setItem('dsh_providers_config', JSON.stringify(normalized));
          return normalized;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_PROVIDER_PRESETS;
  });

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('codex_current_selected_model') || 'gpt-5.6-sol';
  });

  const saveProviders = (newProviders: ProviderPreset[]) => {
    setProviders(newProviders);
    localStorage.setItem('dsh_providers_config', JSON.stringify(newProviders));
  };

  const selectModel = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem('codex_current_selected_model', model);
  };

  // 提取所有可用模型选项
  const allModels: ModelOption[] = [];
  providers.forEach(p => {
    const models = parseModelList(p.models);
    models.forEach(m => {
      if (!allModels.some(opt => opt.value.toLowerCase() === m.toLowerCase())) {
        allModels.push({
          value: m,
          text: m,
          providerId: p.id,
          providerName: p.name
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

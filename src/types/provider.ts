export type ProviderProtocol = 'openai' | 'anthropic' | 'ollama';

export interface ModelDetailConfig {
  id: string; // 唯一标识
  name: string; // 模型标识名称，如 deepseek-v4 / claude-3-7-sonnet
  displayName?: string; // 显示别名
  protocol?: ProviderProtocol; // 该模型专属协议 (若不指定则继承服务商)
  baseUrl?: string; // 该模型专属 Base URL (若不指定则继承服务商)
  apiKey?: string; // 该模型专属 API Key (若不指定则继承服务商)
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderPreset {
  id: string;
  name: string;
  protocol?: ProviderProtocol;
  type?: 'openai' | 'anthropic' | 'ollama' | 'agentrouter' | 'custom';
  baseUrl: string;
  apiKey: string;
  models: string;
  modelConfigs?: ModelDetailConfig[]; // 每个模型的独立配置清单
  isCustom?: boolean;
}

export interface ModelOption {
  value: string;
  text: string;
  providerId: string;
  providerName: string;
  protocol?: ProviderProtocol;
  baseUrl?: string;
  apiKey?: string;
}

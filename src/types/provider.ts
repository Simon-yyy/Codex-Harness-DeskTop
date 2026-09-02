export interface ProviderPreset {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'ollama' | 'agentrouter' | 'custom';
  baseUrl: string;
  apiKey: string;
  models: string;
  isCustom?: boolean;
}

export interface ModelOption {
  value: string;
  text: string;
  providerId: string;
  providerName: string;
}

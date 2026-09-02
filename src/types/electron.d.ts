export interface AppInfo {
  version: string;
  name: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  skillsCount: number;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  models: string;
  isCustom?: boolean;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}

export interface LLMRequestPayload {
  providerId: string;
  model: string;
  messages: LLMMessage[];
  baseUrl?: string;
  apiKey?: string;
}

export interface LLMResponsePayload {
  ok: boolean;
  content: string;
  text?: string;
  thinking?: string;
  toolCall?: any;
  error?: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  body: string;
  downloadUrl: string;
}

export interface UpdateProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface CodexDesktopAPI {
  getAppInfo: () => Promise<AppInfo>;
  getSkills: () => Promise<SkillItem[]>;
  requestLLM: (payload: LLMRequestPayload) => Promise<LLMResponsePayload>;
  saveTempImage: (base64Data: string) => Promise<{ success: boolean; path: string; error?: string }>;
  showItemInFolder: (filePath: string) => void;
  openExternal: (url: string) => void;
  checkForUpdates: (isSilent?: boolean) => void;
  startDownloadUpdate: (payload: { downloadUrl: string; version: string }) => void;
  onThemeChange: (callback: (theme: string) => void) => void;
  onMenuAction: (callback: (action: string) => void) => void;
  onSkillsSynced: (callback: (skills: SkillItem[]) => void) => void;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
  onUpdateDownloading: (callback: () => void) => void;
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => void;
  onUpdateDownloaded: (callback: (res: { version: string; filePath: string }) => void) => void;
  onUpdateError: (callback: (err: { message: string }) => void) => void;
}

declare global {
  interface Window {
    codexDesktop?: CodexDesktopAPI;
  }
}

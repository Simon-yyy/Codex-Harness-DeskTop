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
  content?: string;
  displayName?: string;
  chineseSummary?: string;
  category?: string;
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

export interface WorkspaceFileItem {
  name: string;
  path: string;
  fullPath: string;
  isDirectory: boolean;
  children?: WorkspaceFileItem[];
}

export type PermissionMode = 'chat-only' | 'workspace-readonly' | 'workspace-readwrite' | 'full-access';

export interface SecurityStatus {
  activeWorkspaceDir: string | null;
  permissionMode: PermissionMode;
}

export interface ReadWorkspaceFileResult {
  ok: boolean;
  code?: string;
  reason?: string;
  hint?: string;
  relativePath?: string;
  fullPath?: string;
  content?: string;
  isTruncated?: boolean;
  totalBytes?: number;
  permissionMode?: PermissionMode;
}

export interface WriteWorkspaceFileResult {
  ok: boolean;
  code?: string;
  reason?: string;
  hint?: string;
  relativePath?: string;
  fullPath?: string;
  bytesWritten?: number;
  backupPath?: string | null;
  permissionMode?: PermissionMode;
}

export interface WorkspaceTreeResult {
  rootPath: string;
  rootName: string;
  tree: WorkspaceFileItem[];
  totalCount?: number;
  isTruncated?: boolean;
  error?: string;
}

export interface CodexDesktopAPI {
  getAppInfo: () => Promise<AppInfo>;
  getSkills: () => Promise<SkillItem[]>;
  requestLLM: (payload: LLMRequestPayload) => Promise<LLMResponsePayload>;
  callLlmApi?: (payload: { endpoint: string; apiKey?: string; body: any; customHeaders?: Record<string, string>; timeout?: number; stream?: boolean; streamId?: string }) => Promise<{ ok: boolean; status: number; statusText: string; body: string }>;
  onLlmStreamChunk?: (callback: (data: { streamId?: string; contentDelta?: string; thinkingDelta?: string; isDone?: boolean }) => void) => () => void;
  abortLlmStream?: (streamId: string) => Promise<{ success: boolean; notFound?: boolean }>;
  selectWorkspaceDir?: () => Promise<string | null>;
  setWorkspaceDir?: (dirPath: string) => Promise<{ ok: boolean; activeWorkspaceDir?: string | null; error?: string }>;
  readWorkspaceTree?: (dirPath?: string) => Promise<WorkspaceTreeResult | null>;
  getSecurityStatus?: () => Promise<SecurityStatus>;
  setPermissionMode?: (mode: PermissionMode) => Promise<{ ok: boolean; canceled?: boolean; error?: string; permissionMode: PermissionMode }>;
  readWorkspaceFile?: (relativePath: string) => Promise<ReadWorkspaceFileResult>;
  writeWorkspaceFile?: (payload: { relativePath: string; content: string; createBackup?: boolean }) => Promise<WriteWorkspaceFileResult>;
  setTheme?: (theme: string) => void;
  getThemes?: () => any;
  getCurrentTheme?: () => string;
  saveTempImage: (base64Data: string) => Promise<{ success: boolean; path: string; error?: string }>;
  showItemInFolder: (filePath: string) => void;
  openExternal: (url: string) => void;
  checkForUpdates: (isSilent?: boolean) => void;
  startDownloadUpdate: (payload: { downloadUrl: string; version: string }) => void;
  detectCoreStatus?: () => Promise<any>;
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

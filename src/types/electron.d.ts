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
  source?: 'builtin' | 'user';
  editable?: boolean;
}

/** MCP 连接器（渲染层脱敏视图） */
export interface ConnectorPublic {
  id: string;
  name: string;
  transport: string;
  url: string;
  healthUrl?: string;
  enabled: boolean;
  authHeaderName?: string;
  hasApiKey: boolean;
}

export interface ConnectorToolInfo {
  connectorId: string;
  connectorName?: string;
  name?: string;
  qualifiedName?: string;
  description?: string;
  inputSchema?: any;
  error?: string;
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

export interface DocumentChunkMeta {
  id: string;
  title: string;
  summary: string;
  charCount: number;
}

export interface IndexWorkspaceDocumentResult {
  ok: boolean;
  code?: string;
  reason?: string;
  hint?: string;
  cached?: boolean;
  docId?: string;
  relativePath?: string;
  title?: string;
  chunkCount?: number;
  totalChars?: number;
  sourceTruncated?: boolean;
  indexedAt?: number;
  chunks?: DocumentChunkMeta[];
}

export interface ReadDocumentChunkResult {
  ok: boolean;
  code?: string;
  reason?: string;
  hint?: string;
  docId?: string;
  chunkId?: string;
  title?: string;
  relativePath?: string;
  content?: string;
  isTruncated?: boolean;
  charCount?: number;
}

export interface SearchDocumentChunkHit {
  chunkId: string;
  title: string;
  score: number;
  matchedTerms: string[];
  snippet: string;
  charCount: number;
}

export interface SearchDocumentChunksResult {
  ok: boolean;
  code?: string;
  reason?: string;
  hint?: string;
  docId?: string;
  query?: string;
  relativePath?: string;
  hitCount?: number;
  hits?: SearchDocumentChunkHit[];
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

export interface ReadWorkspaceFileDiffResult {
  ok: boolean;
  code?: string;
  reason?: string;
  relativePath?: string;
  hasBackup: boolean;
  originalContent: string | null;
  currentContent: string;
}

export interface RevertWorkspaceFileResult {
  ok: boolean;
  code?: string;
  reason?: string;
  hint?: string;
  relativePath?: string;
  content?: string;
}

export interface WorkspaceTreeResult {
  rootPath: string;
  rootName: string;
  tree: WorkspaceFileItem[];
  totalCount?: number;
  isTruncated?: boolean;
  error?: string;
}

export type RichBlockType = 'heading' | 'paragraph' | 'math-block' | 'table' | 'image';

export interface RichInlineRun {
  type: 'text' | 'math' | 'bold' | 'italic';
  text: string;
}

export interface RichDocumentBlock {
  type: RichBlockType;
  level?: number;
  text?: string;
  runs?: RichInlineRun[];
  latex?: string;
  tableData?: string[][];
  image?: {
    id: string;
    name: string;
    dataUrl: string;
    alt?: string;
  };
}

export interface DocxRichDocument {
  title?: string;
  blocks: RichDocumentBlock[];
  imagesCount: number;
  mathCount: number;
}

export interface ReadRichDocumentResult {
  ok: boolean;
  type?: 'docx' | 'pdf';
  relativePath?: string;
  fullPath?: string;
  richDocument?: DocxRichDocument;
  base64?: string;
  totalBytes?: number;
  code?: string;
  reason?: string;
  hint?: string;
}

export interface CodexDesktopAPI {
  getAppInfo: () => Promise<AppInfo>;
  getSkills: () => Promise<SkillItem[]>;
  importUserSkill?: () => Promise<{ ok: boolean; canceled?: boolean; skill?: SkillItem; error?: string; code?: string }>;
  saveUserSkill?: (payload: {
    id: string;
    name: string;
    description: string;
    body: string;
    overwrite?: boolean;
  }) => Promise<{ ok: boolean; skill?: SkillItem; error?: string; code?: string }>;
  deleteUserSkill?: (id: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  openUserSkillsDir?: () => Promise<{ ok: boolean; error?: string }>;
  /** MCP 连接器（HTTP） */
  listConnectors?: () => Promise<{ ok: boolean; connectors: ConnectorPublic[] }>;
  saveConnector?: (payload: {
    id?: string;
    name?: string;
    url?: string;
    healthUrl?: string;
    enabled?: boolean;
    apiKey?: string;
    clearApiKey?: boolean;
    authHeaderName?: string;
  }) => Promise<{ ok: boolean; connector?: ConnectorPublic; error?: string; code?: string }>;
  setConnectorEnabled?: (payload: {
    id: string;
    enabled: boolean;
  }) => Promise<{ ok: boolean; connector?: ConnectorPublic; error?: string; code?: string }>;
  testConnector?: (payload?: {
    id?: string;
  }) => Promise<{
    ok: boolean;
    health?: any;
    toolCount?: number;
    tools?: { name: string; description: string }[];
    error?: string;
    code?: string;
  }>;
  listConnectorTools?: () => Promise<{
    ok: boolean;
    tools: ConnectorToolInfo[];
    error?: string;
  }>;
  callConnectorTool?: (payload: {
    connectorId: string;
    name: string;
    arguments?: any;
  }) => Promise<{ ok: boolean; result?: any; error?: string; code?: string }>;
  /** 消息级导出：md / txt / doc(Word) / pdf */
  exportChatArtifact?: (payload: {
    content: string;
    title?: string;
    format?: 'md' | 'txt' | 'doc' | 'docx' | 'pdf';
    defaultName?: string;
  }) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; format?: string; error?: string; code?: string; note?: string }>;
  requestLLM: (payload: LLMRequestPayload) => Promise<LLMResponsePayload>;
  callLlmApi?: (payload: { endpoint: string; apiKey?: string; body: any; customHeaders?: Record<string, string>; timeout?: number; stream?: boolean; streamId?: string }) => Promise<{ ok: boolean; status: number; statusText: string; body: string }>;
  onLlmStreamChunk?: (callback: (data: {
    streamId?: string;
    contentDelta?: string;
    thinkingDelta?: string;
    isDone?: boolean;
    finishReason?: string;
    toolCalls?: { id?: string; name: string; arguments: string }[];
  }) => void) => () => void;
  abortLlmStream?: (streamId: string) => Promise<{ success: boolean; notFound?: boolean }>;
  selectWorkspaceDir?: () => Promise<string | null>;
  setWorkspaceDir?: (dirPath: string) => Promise<{ ok: boolean; activeWorkspaceDir?: string | null; error?: string }>;
  readWorkspaceTree?: (dirPath?: string, options?: { maxDepth?: number }) => Promise<WorkspaceTreeResult | null>;
  readDirectoryChildren?: (folderPath: string) => Promise<WorkspaceFileItem[]>;
  getSecurityStatus?: () => Promise<SecurityStatus>;
  setPermissionMode?: (mode: PermissionMode) => Promise<{ ok: boolean; canceled?: boolean; error?: string; permissionMode: PermissionMode }>;
  readWorkspaceFile?: (relativePath: string) => Promise<ReadWorkspaceFileResult>;
  indexWorkspaceDocument?: (relativePath: string) => Promise<IndexWorkspaceDocumentResult>;
  readDocumentChunk?: (payload: { docId: string; chunkId: string }) => Promise<ReadDocumentChunkResult>;
  searchDocumentChunks?: (payload: {
    docId: string;
    query: string;
    limit?: number;
  }) => Promise<SearchDocumentChunksResult>;
  extractDocxText?: (payload: { base64: string; name?: string }) => Promise<{
    ok: boolean;
    text?: string;
    truncated?: boolean;
    error?: string;
    code?: string;
  }>;
  extractPdfText?: (payload: { base64: string; name?: string }) => Promise<{
    ok: boolean;
    text?: string;
    truncated?: boolean;
    error?: string;
    code?: string;
  }>;
  readRichDocument?: (relativePath: string) => Promise<ReadRichDocumentResult>;
  writeWorkspaceFile?: (payload: { relativePath: string; content: string; createBackup?: boolean }) => Promise<WriteWorkspaceFileResult>;
  readWorkspaceFileDiff?: (relativePath: string) => Promise<ReadWorkspaceFileDiffResult>;
  revertWorkspaceFile?: (relativePath: string) => Promise<RevertWorkspaceFileResult>;
  setTheme?: (theme: string) => void;
  getThemes?: () => any;
  getCurrentTheme?: () => string;
  saveTempImage: (base64Data: string) => Promise<{ success: boolean; path: string; error?: string }>;
  showItemInFolder?: (filePath: string) => void | Promise<{ ok: boolean }>;
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
  onUpdateDownloaded: (callback: (res: { version: string; filePath?: string; installerPath?: string }) => void) => void;
  onUpdateError: (callback: (err: { message?: string; error?: string }) => void) => void;
  applyUpdateNow?: () => Promise<{ success: boolean }>;
  applyUpdateOnQuit?: () => Promise<{ success: boolean; pending: boolean }>;
  onUpdatePendingOnQuit?: (callback: (data: { version: string }) => void) => void;
}

declare global {
  interface Window {
    codexDesktop?: CodexDesktopAPI;
  }
}

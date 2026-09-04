export interface AttachedImage {
  base64: string;
  path: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  thinking?: string;
  toolCall?: any;
  images?: string[]; // base64 or local paths
  timestamp: number;
}

export interface WorkspaceFolder {
  id: string;
  path: string;
  name: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  workspaceDir?: string;
  workspaceName?: string;
  isArchived?: boolean;
  forkedFrom?: string;
  messages: ChatMessage[];
}

export interface QueuedInstruction {
  id: string;
  prompt: string;
  images: AttachedImage[];
  timestamp: number;
}

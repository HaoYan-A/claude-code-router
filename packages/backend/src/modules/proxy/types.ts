/**
 * Proxy 模块类型定义
 * Claude API 请求/响应类型、Antigravity/Gemini 协议类型
 */

// ==================== Claude API 类型 ====================

export interface ClaudeRequest {
  model: string;
  messages: Message[];
  system?: SystemPrompt;
  tools?: Tool[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  thinking?: ThinkingConfig;
  metadata?: Metadata;
}

export interface ThinkingConfig {
  type: 'enabled' | 'disabled';
  budget_tokens?: number;
}

export type SystemPrompt = string | SystemBlock[];

export interface SystemBlock {
  type: string;
  text: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: MessageContent;
}

export type MessageContent = string | ContentBlock[];

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
  cache_control?: unknown;
}

export interface RedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: string;
    media_type: string;
    data: string;
  };
  cache_control?: unknown;
}

export interface DocumentBlock {
  type: 'document';
  source: {
    type: string;
    media_type: string;
    data: string;
  };
  cache_control?: unknown;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
  signature?: string;
  cache_control?: unknown;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

export interface ServerToolUseBlock {
  type: 'server_tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface WebSearchToolResultBlock {
  type: 'web_search_tool_result';
  tool_use_id: string;
  content: unknown;
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | RedactedThinkingBlock
  | ImageBlock
  | DocumentBlock
  | ToolUseBlock
  | ToolResultBlock
  | ServerToolUseBlock
  | WebSearchToolResultBlock;

export interface Tool {
  type?: string;
  name?: string;
  description?: string;
  input_schema?: unknown;
}

export interface Metadata {
  user_id?: string;
}

// ==================== Claude 响应类型 ====================

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ContentBlock[];
  stop_reason: string;
  stop_sequence?: string | null;
  usage: Usage;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  server_tool_use?: unknown;
}

// ==================== Claude SSE 事件类型 ====================

export interface MessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage?: Usage;
  };
}

export interface ContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: ContentBlock;
}

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: Delta;
}

export type Delta =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'signature_delta'; signature: string }
  | { type: 'input_json_delta'; partial_json: string };

export interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface MessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason: string;
    stop_sequence?: string | null;
  };
  usage: Usage;
}

export interface MessageStopEvent {
  type: 'message_stop';
}

export type ClaudeSSEEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent;

// ==================== 代理配置类型 ====================

export type ModelSlot = 'opus' | 'sonnet' | 'haiku';

export interface ProxyContext {
  userId: string;
  apiKeyId: string;
  clientIp?: string;
  userAgent?: string;
  // 请求相关
  originalModel: string;
  modelSlot: ModelSlot;
  targetModel: string;
  platform: string;
  // 账号相关
  accountId: string;
  accessToken: string;
  projectId: string;
  // Session 相关
  sessionId: string;
  messageCount: number;
  // 日志相关
  logId: string;
  startTime: number;
}

// ==================== 账号选择结果 ====================

export interface SelectedAccount {
  id: string;
  platform: 'antigravity' | 'kiro' | 'openai';
  accessToken: string;
  projectId: string;
  refreshToken: string;
  tokenExpiresAt: Date | null;
  // Kiro 特有字段
  kiroClientId?: string;
  kiroClientSecret?: string;
  kiroRegion?: string;
  // OpenAI 特有字段
  openaiApiKey?: string;
  openaiBaseUrl?: string;
}

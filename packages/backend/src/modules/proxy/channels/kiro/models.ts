/**
 * Kiro (Amazon Q Developer) API 数据模型
 *
 * Kiro 使用 Amazon Q 的 generateAssistantResponse API，
 * 支持 Claude 模型的流式响应。
 */

// ==================== Kiro 请求类型 ====================

/**
 * generateAssistantResponse 请求体
 */
export interface KiroRequest {
  conversationState: KiroConversationState;
  profileArn?: string;  // AWS SSO OIDC 用户不需要，会导致 403
}

export interface KiroConversationState {
  chatTriggerType: 'MANUAL' | 'AUTO';
  conversationId: string;
  currentMessage: KiroCurrentMessage;
  history: KiroHistoryMessage[];
}

export interface KiroCurrentMessage {
  userInputMessage: KiroUserInputMessage;
}

export interface KiroUserInputMessage {
  content: string;
  modelId: string;
  origin: 'AI_EDITOR';
  images?: KiroImage[];
  userInputMessageContext?: KiroMessageContext;
}

export interface KiroImage {
  format: 'png' | 'jpeg' | 'gif' | 'webp';
  source: {
    bytes: string;  // base64
  };
}

export interface KiroMessageContext {
  tools?: KiroTool[];
  toolResults?: KiroToolResult[];
}

export interface KiroTool {
  toolSpecification: {
    name: string;
    description: string;
    inputSchema: {
      json: unknown;  // JSON Schema
    };
  };
}

export interface KiroToolResult {
  toolUseId: string;
  content: Array<{ text: string }>;  // 注意：是数组，不是对象
  status: 'success' | 'error';
}

// ==================== 历史消息类型 ====================

export type KiroHistoryMessage =
  | { userInputMessage: KiroUserInputMessage }
  | { assistantResponseMessage: KiroAssistantResponseMessage };

export interface KiroAssistantResponseMessage {
  content: string;
  messageId?: string;  // Kiro API 不需要此字段
  toolUses?: KiroToolUse[];
}

export interface KiroToolUse {
  toolUseId: string;
  name: string;
  input: object;  // 对象，不是 JSON 字符串
}

// ==================== Kiro SSE 响应类型 ====================

/**
 * AWS SSE 事件格式
 *
 * AWS 使用特殊的二进制格式发送 SSE 事件，
 * 包含 :event-type, :message-type, :content-type 头
 */
export interface KiroSSEEvent {
  type: KiroEventType;
  body?: unknown;
}

export type KiroEventType =
  | 'messageMetadataEvent'
  | 'assistantResponseEvent'
  | 'codeEvent'
  | 'supplementaryWebLinksEvent'
  | 'error';

/**
 * assistantResponseEvent 事件体
 */
export interface KiroAssistantResponseEvent {
  assistantResponseEvent: {
    content: string;
  };
}

/**
 * messageMetadataEvent 事件体（流结束）
 */
export interface KiroMessageMetadataEvent {
  messageMetadataEvent: {
    conversationId: string;
  };
}

/**
 * codeEvent 事件体（工具调用）
 */
export interface KiroCodeEvent {
  codeEvent: {
    content: string;  // JSON string containing tool_use
  };
}

/**
 * error 事件体
 */
export interface KiroErrorEvent {
  error: {
    message: string;
    code?: string;
  };
}

// ==================== 常量配置 ====================

/**
 * Kiro API 端点（按区域）
 */
export function getKiroEndpoint(region: string): string {
  return `https://q.${region}.amazonaws.com`;
}

/**
 * generateAssistantResponse 路径
 */
export const KIRO_GENERATE_PATH = '/generateAssistantResponse';

/**
 * 模型列表路径
 */
export const KIRO_MODELS_PATH = '/ListAvailableModels?origin=AI_EDITOR';

/**
 * Claude 模型 ID → Kiro 模型 ID 映射
 *
 * Kiro 支持的模型 ID（从 ListAvailableModels API 获取）：
 * - auto
 * - claude-sonnet-4
 * - claude-sonnet-4.5
 * - claude-haiku-4.5
 * - claude-opus-4.5
 * - claude-opus-4.6
 */
export const CLAUDE_TO_KIRO_MODEL_MAP: Record<string, string> = {
  // Claude Sonnet 4
  'claude-sonnet-4-20250514': 'claude-sonnet-4',
  'claude-sonnet-4': 'claude-sonnet-4',

  // Claude Sonnet 4.5
  'claude-sonnet-4-5': 'claude-sonnet-4.5',
  'claude-sonnet-4.5': 'claude-sonnet-4.5',

  // Claude Opus 4.6
  'claude-opus-4-6': 'claude-opus-4.6',
  'claude-opus-4.6': 'claude-opus-4.6',

  // Claude Opus 4.5
  'claude-opus-4-5-20250220': 'claude-opus-4.5',
  'claude-opus-4.5-20250220': 'claude-opus-4.5',
  'claude-opus-4.5': 'claude-opus-4.5',
  'claude-opus-4-5': 'claude-opus-4.5',

  // Claude Haiku 4.5
  'claude-haiku-4-5-20250220': 'claude-haiku-4.5',
  'claude-haiku-4.5-20250220': 'claude-haiku-4.5',
  'claude-haiku-4.5': 'claude-haiku-4.5',
  'claude-haiku-4-5': 'claude-haiku-4.5',

  // Claude 3.7 Sonnet -> 映射到 sonnet-4.5（最接近的）
  'claude-3-7-sonnet-20250219': 'claude-sonnet-4.5',
  'claude-3.7-sonnet-20250219': 'claude-sonnet-4.5',
  'claude-3.7-sonnet': 'claude-sonnet-4.5',

  // Claude 3.5 Sonnet -> 映射到 sonnet-4
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4',
  'claude-3.5-sonnet-20241022': 'claude-sonnet-4',
  'claude-3.5-sonnet-v2': 'claude-sonnet-4',
  'claude-3.5-sonnet': 'claude-sonnet-4',

  // 自动选择
  'auto': 'auto',
};

/**
 * 生成 Thinking 标签
 * @param budgetTokens 思考预算 tokens（默认 10000）
 */
export function generateThinkingTags(budgetTokens: number = 10000): string {
  return `<thinking_mode>enabled</thinking_mode>
<max_thinking_length>${budgetTokens}</max_thinking_length>`;
}

/**
 * 工具名称最大长度（Kiro 限制）
 */
export const MAX_TOOL_NAME_LENGTH = 64;

/**
 * 工具描述最大长度（超过部分移到 system prompt）
 */
export const MAX_TOOL_DESCRIPTION_LENGTH = 4000;

/**
 * 空内容占位符（Kiro 要求非空内容）
 */
export const EMPTY_CONTENT_PLACEHOLDER = '...';

/**
 * 默认区域
 */
export const DEFAULT_REGION = 'us-east-1';

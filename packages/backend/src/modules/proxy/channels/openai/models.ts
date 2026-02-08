/**
 * OpenAI Responses API 类型定义和常量
 */

// ==================== 请求类型 ====================

export interface OpenAIResponsesRequest {
  model: string;
  input: OpenAIInputItem[];
  instructions?: string;
  stream?: boolean;
  store?: boolean;
  tools?: OpenAITool[];
  tool_choice?: OpenAIToolChoice;
  max_output_tokens?: number;
  temperature?: number;
  reasoning?: OpenAIReasoning;
}

export type OpenAIInputItem =
  | OpenAIMessageItem
  | OpenAIFunctionCallItem
  | OpenAIFunctionCallOutputItem;

export interface OpenAIMessageItem {
  role: 'user' | 'assistant' | 'system';
  content: string | OpenAIContentPart[];
}

export type OpenAIContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string };

export interface OpenAIFunctionCallItem {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface OpenAIFunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export interface OpenAITool {
  type: 'function';
  name: string;
  description?: string;
  parameters?: unknown;
  strict?: boolean;
}

export type OpenAIToolChoice =
  | 'auto'
  | 'required'
  | 'none'
  | { type: 'function'; name: string };

export interface OpenAIReasoning {
  effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  summary?: 'auto' | 'concise' | 'detailed';
}

// ==================== SSE 事件类型 ====================

export interface OpenAISSEEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface OpenAIResponseObject {
  id: string;
  object: string;
  model: string;
  status: string;
  output: OpenAIOutputItem[];
  usage?: OpenAIUsage;
  incomplete_details?: { reason: string } | null;
}

export type OpenAIOutputItem =
  | OpenAIOutputMessage
  | OpenAIOutputFunctionCall
  | OpenAIOutputReasoning;

export interface OpenAIOutputMessage {
  type: 'message';
  id: string;
  role: 'assistant';
  content: Array<{ type: 'output_text'; text: string }>;
}

export interface OpenAIOutputFunctionCall {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface OpenAIOutputReasoning {
  type: 'reasoning';
  id: string;
  summary: Array<{ type: 'summary_text'; text: string }>;
}

export interface OpenAIUsage {
  input_tokens: number;
  input_tokens_details?: { cached_tokens: number };
  output_tokens: number;
  output_tokens_details?: { reasoning_tokens: number };
  total_tokens: number;
}

// ==================== 常量 ====================

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com';

/** Stop reason 映射: OpenAI → Anthropic */
export const STOP_REASON_MAP: Record<string, string> = {
  stop: 'end_turn',
  max_output_tokens: 'max_tokens',
  content_filter: 'end_turn',
};

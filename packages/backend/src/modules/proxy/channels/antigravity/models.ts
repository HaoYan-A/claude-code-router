/**
 * Antigravity/Gemini v1internal API 数据模型
 */

// ==================== Gemini 请求类型 ====================

export interface GeminiRequest {
  project: string;
  requestId: string;
  request: GeminiInnerRequest;
  model: string;
  userAgent: string;
  requestType: string;
}

export interface GeminiInnerRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: GeminiSafetySetting[];
  sessionId?: string;
}

export interface GeminiSystemInstruction {
  role: 'user';
  parts: GeminiPart[];
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  inlineData?: GeminiInlineData;
}

export interface GeminiFunctionCall {
  name: string;
  id?: string;
  args?: unknown;
}

export interface GeminiFunctionResponse {
  name: string;
  response: {
    result: string;
  };
  id?: string;
}

export interface GeminiInlineData {
  mimeType: string;
  data: string;
}

export interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[];
  googleSearch?: Record<string, unknown>;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface GeminiToolConfig {
  functionCallingConfig: {
    mode: 'VALIDATED' | 'AUTO' | 'NONE';
  };
}

export interface GeminiGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  thinkingConfig?: {
    thinkingBudget?: number;
    includeThoughts?: boolean;
    thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  };
  responseMimeType?: string;
  responseModalities?: string[];
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

// ==================== Gemini 响应类型 ====================

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
  responseId?: string;
}

export interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
  index?: number;
  groundingMetadata?: GeminiGroundingMetadata;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
}

// ==================== Grounding Metadata (Web Search) ====================

export interface GeminiGroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GeminiGroundingChunk[];
  groundingSupports?: GeminiGroundingSupport[];
  searchEntryPoint?: GeminiSearchEntryPoint;
}

export interface GeminiGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface GeminiGroundingSupport {
  segment?: {
    startIndex?: number;
    endIndex?: number;
    text?: string;
  };
  groundingChunkIndices?: number[];
  confidenceScores?: number[];
}

export interface GeminiSearchEntryPoint {
  renderedContent?: string;
}

// ==================== 常量配置 ====================

export const ANTIGRAVITY_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
] as const;

export const STREAM_PATH = '/v1internal:streamGenerateContent?alt=sse';
export const NON_STREAM_PATH = '/v1internal:generateContent';

export const SAFETY_SETTINGS: GeminiSafetySetting[] = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'OFF' },
];

// Antigravity 身份注入提示词
export const ANTIGRAVITY_IDENTITY = `You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.
You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.
**Absolute paths only**
**Proactiveness**`;

// 最小有效签名长度
export const MIN_SIGNATURE_LENGTH = 50;

// 请求类型常量（固定使用 agent）
export const REQUEST_TYPE = 'agent';

// 工具参数需要清理的 JSON Schema 字段 (Gemini 不支持)
export const SCHEMA_FIELDS_TO_REMOVE = [
  '$schema',
  'additionalProperties',
  'format',
  'default',
  'uniqueItems',
  'propertyNames',
  'const',
  'anyOf',
  'oneOf',
  'allOf',
  'exclusiveMinimum',
  'exclusiveMaximum',
] as const;

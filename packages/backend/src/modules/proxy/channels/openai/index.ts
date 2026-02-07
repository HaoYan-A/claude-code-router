/**
 * OpenAI Responses API Channel
 *
 * 将 Claude API 请求转换为 OpenAI Responses API 格式并转发
 */

// 类型定义
export * from './models.js';

// 请求转换
export { convertClaudeToOpenAI } from './converter.js';
export type { OpenAIConvertOptions, OpenAIConvertResult } from './converter.js';

// 响应处理
export { handleOpenAISSEStream } from './handler.js';
export type { OpenAIStreamingOptions, OpenAISSEStreamResult } from './handler.js';

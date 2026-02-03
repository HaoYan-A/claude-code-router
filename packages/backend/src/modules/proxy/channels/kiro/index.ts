/**
 * Kiro (Amazon Q Developer) Channel
 *
 * 将 Claude API 请求转换为 Kiro API 格式并转发
 */

// 类型定义
export * from './models.js';

// 请求转换
export { convertClaudeToKiro } from './converter.js';
export type { KiroConvertOptions, KiroConvertResult } from './converter.js';

// 响应处理
export {
  handleKiroSSEStream,
  transformKiroResponse,
} from './handler.js';
export type {
  KiroStreamingOptions,
  KiroSSEStreamResult,
  KiroNonStreamingOptions,
} from './handler.js';

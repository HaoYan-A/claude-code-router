/**
 * Anthropic Beta Header 管理模块
 *
 * 参照 Antigravity-Manager 的 client_adapter 系统，
 * 根据模型和客户端类型注入对应的 beta header。
 */

/**
 * 获取 Anthropic Beta Header
 * 根据模型和客户端 User-Agent 返回适当的 beta 头
 */
export function getAnthropicBetaHeaders(model: string, clientUA?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const modelLower = model.toLowerCase();

  // Claude 模型注入 claude-code beta header
  if (modelLower.includes('claude')) {
    headers['anthropic-beta'] = 'claude-code-20250219';
  }

  // 客户端适配：OpenCode 使用更大的上下文窗口
  if (clientUA?.toLowerCase().includes('opencode')) {
    headers['anthropic-beta'] = 'context-1m-2025-08-07';
  }

  return headers;
}

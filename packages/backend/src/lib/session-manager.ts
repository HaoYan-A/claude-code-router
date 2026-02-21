/**
 * 会话指纹管理模块
 *
 * 参照 Antigravity-Manager 的 session_manager.rs，实现会话指纹。
 * 核心能力：
 * 1. 会话 ID 生成（基于首条用户消息 SHA256）
 * 2. 全局 Session ID（每次进程启动生成）
 * 3. 持久化 Machine ID（基于 hostname + username 的稳定哈希）
 */

import * as crypto from 'crypto';

/**
 * 从消息列表中提取会话 ID
 * 基于首条用户消息内容的 SHA256 哈希
 */
export function extractSessionIdFromMessages(messages: Array<{ role: string; content: unknown }>): string {
  // 找到首条用户消息
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (!firstUserMsg) {
    return `session-${crypto.randomUUID()}`;
  }

  // 提取文本内容
  let text: string;
  if (typeof firstUserMsg.content === 'string') {
    text = firstUserMsg.content;
  } else if (Array.isArray(firstUserMsg.content)) {
    text = firstUserMsg.content
      .filter((block: { type?: string; text?: string }) => block.type === 'text' && block.text)
      .map((block: { text?: string }) => block.text || '')
      .join('\n');
  } else {
    return `session-${crypto.randomUUID()}`;
  }

  if (!text) {
    return `session-${crypto.randomUUID()}`;
  }

  // 取前 200 字符生成哈希
  const truncated = text.substring(0, 200);
  return crypto.createHash('sha256').update(truncated).digest('hex').substring(0, 32);
}

/**
 * 全局 Session ID（每次进程启动生成）
 */
export const PROCESS_SESSION_ID = crypto.randomUUID();

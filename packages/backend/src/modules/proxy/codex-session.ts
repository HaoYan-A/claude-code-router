/**
 * Codex Session 粘性映射
 *
 * 使同一 conversation/session 的请求尽量路由到同一 Codex 账号，
 * 以获得更好的缓存命中和上下文一致性。
 */

import crypto from 'crypto';
import { redis, cacheKeys } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import type { ClaudeRequest, ContentBlock } from './types.js';

// Session 映射 TTL: 1 小时
const SESSION_TTL_SECONDS = 3600;

/**
 * 根据请求内容生成 session hash
 *
 * 优先级：
 * 1. metadata.user_id 中的 session UUID
 * 2. 带 cache_control.type === 'ephemeral' 的内容 SHA256 前 16 位
 * 3. system prompt SHA256 前 16 位
 * 4. 第一条消息 SHA256 前 16 位
 */
export function generateSessionHash(req: ClaudeRequest): string | null {
  // 1. 从 metadata.user_id 提取 session UUID
  if (req.metadata?.user_id) {
    const sessionMatch = req.metadata.user_id.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (sessionMatch) {
      return `session:${sessionMatch[1]}`;
    }
  }

  // 2. 查找带 cache_control.type === 'ephemeral' 的内容
  const ephemeralContent = findEphemeralContent(req);
  if (ephemeralContent) {
    return `ephemeral:${sha256Short(ephemeralContent)}`;
  }

  // 3. system prompt
  if (req.system) {
    const systemText = typeof req.system === 'string'
      ? req.system
      : req.system.map(b => b.text).join('\n');
    if (systemText) {
      return `system:${sha256Short(systemText)}`;
    }
  }

  // 4. 第一条消息内容
  if (req.messages && req.messages.length > 0) {
    const firstMsg = req.messages[0];
    const content = typeof firstMsg.content === 'string'
      ? firstMsg.content
      : JSON.stringify(firstMsg.content);
    if (content) {
      return `first_msg:${sha256Short(content)}`;
    }
  }

  return null;
}

/**
 * 获取 session 绑定的账号 ID
 */
export async function getSessionAccount(hash: string): Promise<string | null> {
  try {
    return await redis.get(cacheKeys.codexSession(hash));
  } catch (error) {
    logger.warn({ hash, error }, 'Failed to get codex session mapping');
    return null;
  }
}

/**
 * 设置 session 到账号的绑定
 */
export async function setSessionAccount(hash: string, accountId: string): Promise<void> {
  try {
    await redis.setex(cacheKeys.codexSession(hash), SESSION_TTL_SECONDS, accountId);
  } catch (error) {
    logger.warn({ hash, accountId, error }, 'Failed to set codex session mapping');
  }
}

/**
 * 删除 session 映射
 */
export async function deleteSessionMapping(hash: string): Promise<void> {
  try {
    await redis.del(cacheKeys.codexSession(hash));
  } catch (error) {
    logger.warn({ hash, error }, 'Failed to delete codex session mapping');
  }
}

function sha256Short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

function findEphemeralContent(req: ClaudeRequest): string | null {
  // 检查 system blocks
  if (Array.isArray(req.system)) {
    for (const block of req.system) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = block as any;
      if (b.cache_control?.type === 'ephemeral') {
        return b.text;
      }
    }
  }

  // 检查 messages 中的 content blocks
  for (const msg of req.messages || []) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = block as any;
        if (b.cache_control?.type === 'ephemeral' && b.text) {
          return b.text as string;
        }
      }
    }
  }

  return null;
}

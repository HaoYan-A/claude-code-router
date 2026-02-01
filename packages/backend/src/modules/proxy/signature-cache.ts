/**
 * 思考签名缓存 (Thinking Signature Cache)
 *
 * 用于缓存和恢复 Gemini thinking 模式的签名，支持多层缓存策略：
 * 1. Tool Cache: 按 tool_id 缓存 (用于工具调用链恢复)
 * 2. Session Cache: 按 session_id 缓存 (用于会话级别恢复)
 * 3. Model Family: 签名与模型家族的关联 (用于兼容性检查)
 */

import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { MIN_SIGNATURE_LENGTH } from './channels/antigravity/models.js';

// Redis key 前缀
const TOOL_SIG_PREFIX = 'proxy:tool_sig:';
const SESSION_SIG_PREFIX = 'proxy:session_sig:';
const SIG_FAMILY_PREFIX = 'proxy:sig_family:';

// 缓存 TTL (2 小时)
const CACHE_TTL = 7200;

export class SignatureCache {
  /**
   * 缓存工具调用签名 (按 tool_id)
   */
  async cacheToolSignature(toolId: string, signature: string): Promise<void> {
    if (!signature || signature.length < MIN_SIGNATURE_LENGTH) {
      return;
    }
    const key = `${TOOL_SIG_PREFIX}${toolId}`;
    await redis.setex(key, CACHE_TTL, signature);
    logger.debug({ toolId, sigLen: signature.length }, 'Cached tool signature');
  }

  /**
   * 获取工具调用签名
   */
  async getToolSignature(toolId: string): Promise<string | null> {
    const key = `${TOOL_SIG_PREFIX}${toolId}`;
    const sig = await redis.get(key);
    if (sig) {
      logger.debug({ toolId, sigLen: sig.length }, 'Retrieved tool signature');
    }
    return sig;
  }

  /**
   * 缓存会话签名 (按 session_id + message_count)
   *
   * 使用 message_count 支持回溯检测：如果客户端重放了历史消息，
   * 我们可以检测到并使用更早的签名版本。
   */
  async cacheSessionSignature(
    sessionId: string,
    signature: string,
    messageCount: number
  ): Promise<void> {
    if (!signature || signature.length < MIN_SIGNATURE_LENGTH) {
      return;
    }

    const key = `${SESSION_SIG_PREFIX}${sessionId}`;

    // 存储为 JSON，包含签名和消息计数
    const data = JSON.stringify({ signature, messageCount, timestamp: Date.now() });
    await redis.setex(key, CACHE_TTL, data);

    logger.debug(
      { sessionId, messageCount, sigLen: signature.length },
      'Cached session signature'
    );
  }

  /**
   * 获取会话签名
   */
  async getSessionSignature(sessionId: string): Promise<string | null> {
    const key = `${SESSION_SIG_PREFIX}${sessionId}`;
    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    try {
      const parsed = JSON.parse(data);
      logger.debug(
        { sessionId, messageCount: parsed.messageCount, sigLen: parsed.signature?.length },
        'Retrieved session signature'
      );
      return parsed.signature;
    } catch {
      // 兼容旧格式（直接存储签名字符串）
      return data;
    }
  }

  /**
   * 缓存签名与模型家族的关联
   *
   * 不同模型家族的签名可能不兼容，需要记录来源以进行兼容性检查。
   */
  async cacheSignatureFamily(signature: string, modelName: string): Promise<void> {
    if (!signature || signature.length < MIN_SIGNATURE_LENGTH) {
      return;
    }

    // 使用签名的前 32 字符作为 key（足够唯一且避免过长）
    const sigKey = signature.substring(0, 32);
    const key = `${SIG_FAMILY_PREFIX}${sigKey}`;

    // 提取模型家族
    const family = this.extractModelFamily(modelName);
    await redis.setex(key, CACHE_TTL, family);

    logger.debug({ family, sigKeyLen: sigKey.length }, 'Cached signature family');
  }

  /**
   * 获取签名的模型家族
   */
  async getSignatureFamily(signature: string): Promise<string | null> {
    if (!signature || signature.length < MIN_SIGNATURE_LENGTH) {
      return null;
    }

    const sigKey = signature.substring(0, 32);
    const key = `${SIG_FAMILY_PREFIX}${sigKey}`;
    return redis.get(key);
  }

  /**
   * 检查签名是否与目标模型兼容
   */
  async isSignatureCompatible(signature: string, targetModel: string): Promise<boolean> {
    const sigFamily = await this.getSignatureFamily(signature);
    if (!sigFamily) {
      // 未知来源的签名，如果长度足够则允许使用
      return signature.length >= MIN_SIGNATURE_LENGTH;
    }

    const targetFamily = this.extractModelFamily(targetModel);
    return this.areFamiliesCompatible(sigFamily, targetFamily);
  }

  /**
   * 清除会话相关的所有缓存
   */
  async clearSessionCache(sessionId: string): Promise<void> {
    const key = `${SESSION_SIG_PREFIX}${sessionId}`;
    await redis.del(key);
    logger.debug({ sessionId }, 'Cleared session signature cache');
  }

  /**
   * 从模型名称提取家族标识
   */
  private extractModelFamily(modelName: string): string {
    const lower = modelName.toLowerCase();

    // Claude 模型家族
    if (lower.includes('claude')) {
      if (lower.includes('opus')) return 'claude-opus';
      if (lower.includes('sonnet')) return 'claude-sonnet';
      if (lower.includes('haiku')) return 'claude-haiku';
      return 'claude';
    }

    // Gemini 模型家族
    if (lower.includes('gemini')) {
      if (lower.includes('pro')) return 'gemini-pro';
      if (lower.includes('flash')) return 'gemini-flash';
      return 'gemini';
    }

    return 'unknown';
  }

  /**
   * 检查两个模型家族是否兼容
   *
   * 当前策略：Claude 签名可以用于 Gemini，但反过来不行
   */
  private areFamiliesCompatible(sourceFamily: string, targetFamily: string): boolean {
    // 相同家族总是兼容
    if (sourceFamily === targetFamily) {
      return true;
    }

    // Claude 签名可以用于 Claude（跨版本）
    if (sourceFamily.startsWith('claude') && targetFamily.startsWith('claude')) {
      return true;
    }

    // Gemini 签名可以用于 Gemini（跨版本）
    if (sourceFamily.startsWith('gemini') && targetFamily.startsWith('gemini')) {
      return true;
    }

    // Claude 签名通常也可以用于 Gemini thinking 模型
    if (sourceFamily.startsWith('claude') && targetFamily.startsWith('gemini')) {
      return true;
    }

    // 其他情况不兼容
    return false;
  }
}

// 单例导出
export const signatureCache = new SignatureCache();

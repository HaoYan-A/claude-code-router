/**
 * 账号轮询选择器
 *
 * 使用 Redis INCR 原子操作实现账号轮询，确保请求均匀分布到各个账号。
 */

import { redis } from '../../lib/redis.js';

const KEY_PREFIX = 'claude_code_router:round_robin:';
const KEY_EXPIRE_SECONDS = 86400; // 24 小时

export class AccountRoundRobin {
  /**
   * 获取下一个账号索引
   *
   * 使用 Redis INCR 原子操作，确保并发安全。
   * 返回值对 accountCount 取模，得到实际索引。
   *
   * @param key 轮询 key（可以是 apiKeyId 或 'global'）
   * @param accountCount 可用账号数量
   * @returns 下一个账号的索引
   */
  static async getNextIndex(key: string, accountCount: number): Promise<number> {
    if (accountCount <= 0) {
      return 0;
    }

    const redisKey = `${KEY_PREFIX}${key}`;
    const value = await redis.incr(redisKey);

    // 设置过期时间（避免 key 无限增长）
    await redis.expire(redisKey, KEY_EXPIRE_SECONDS);

    return (value - 1) % accountCount;
  }
}

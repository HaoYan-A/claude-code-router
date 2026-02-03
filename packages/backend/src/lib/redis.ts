import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

export async function connectRedis(): Promise<void> {
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}

export const cacheKeys = {
  user: (id: string) => `user:${id}`,
  apiKey: (hash: string) => `apikey:${hash}`,
  rateLimit: (userId: string, window: number) => `ratelimit:${userId}:${window}`,
  account: (id: string) => `account:${id}`,
  accountQuota: (accountId: string) => `account:quota:${accountId}`,
  accountCooldown: (accountId: string) => `account:cooldown:${accountId}`,
  // 签名缓存
  toolSignature: (toolId: string) => `proxy:tool_sig:${toolId}`,
  sessionSignature: (sessionId: string) => `proxy:session_sig:${sessionId}`,
  signatureFamily: (sigKey: string) => `proxy:sig_family:${sigKey}`,
} as const;

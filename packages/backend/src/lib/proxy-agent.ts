/**
 * HTTP 代理配置
 * 用于第三方账号平台（如 Antigravity/Google API）的请求
 */

import { ProxyAgent } from 'undici';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let proxyAgent: ProxyAgent | undefined;

/**
 * 获取代理 Agent（如果启用）
 */
export function getProxyAgent(): ProxyAgent | undefined {
  if (!env.THIRD_PARTY_PROXY_ENABLED) {
    return undefined;
  }

  if (!env.THIRD_PARTY_PROXY_URL) {
    logger.warn('THIRD_PARTY_PROXY_ENABLED is true but THIRD_PARTY_PROXY_URL is not set');
    return undefined;
  }

  // 复用已创建的 ProxyAgent
  if (!proxyAgent) {
    proxyAgent = new ProxyAgent(env.THIRD_PARTY_PROXY_URL);
    logger.info({ proxyUrl: env.THIRD_PARTY_PROXY_URL }, 'Proxy agent initialized');
  }

  return proxyAgent;
}

/**
 * 检查代理是否启用
 */
export function isProxyEnabled(): boolean {
  return env.THIRD_PARTY_PROXY_ENABLED && !!env.THIRD_PARTY_PROXY_URL;
}

/**
 * 获取代理 URL（用于日志记录）
 */
export function getProxyUrl(): string | undefined {
  return env.THIRD_PARTY_PROXY_ENABLED ? env.THIRD_PARTY_PROXY_URL : undefined;
}

import * as os from 'os';
import * as crypto from 'crypto';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../middlewares/error.middleware.js';
import { ErrorCodes } from '@claude-code-router/shared';
import { getProxyAgent, isProxyEnabled } from '../../../lib/proxy-agent.js';

// Kiro API 版本
const KIRO_VERSION = '0.7.45';

// Token 刷新响应
export interface KiroTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

// 模型信息
export interface KiroModel {
  modelId: string;
  [key: string]: unknown;
}

// 模型列表响应
export interface KiroModelsResponse {
  models: KiroModel[];
}

/**
 * 生成机器指纹（模拟 Kiro Gateway）
 */
function getMachineFingerprint(): string {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const uniqueString = `${hostname}-${username}-kiro-gateway`;
  return crypto.createHash('sha256').update(uniqueString).digest('hex');
}

/**
 * 生成 Kiro API 请求头
 */
export function getKiroHeaders(accessToken: string): Record<string, string> {
  const fingerprint = getMachineFingerprint();

  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': `aws-sdk-js/1.0.27 ua/2.1 os/darwin#24.0.0 lang/js md/nodejs#22.0.0 api/codewhispererstreaming#1.0.27 m/E KiroIDE-${KIRO_VERSION}-${fingerprint}`,
    'x-amz-user-agent': `aws-sdk-js/1.0.27 KiroIDE-${KIRO_VERSION}-${fingerprint}`,
    'x-amzn-codewhisperer-optout': 'true',
    'x-amzn-kiro-agent-mode': 'vibe',
    'amz-sdk-invocation-id': crypto.randomUUID(),
    'amz-sdk-request': 'attempt=1; max=3',
  };
}

async function fetchWithProxy(url: string, options: RequestInit = {}): Promise<Response> {
  const proxyAgent = getProxyAgent();
  const fetchOptions: RequestInit & { dispatcher?: unknown } = {
    ...options,
  };

  // 如果启用了代理，添加 dispatcher
  if (proxyAgent) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchOptions.dispatcher = proxyAgent as any;
    logger.debug({ url, proxy: isProxyEnabled() }, 'Fetching Kiro API with proxy');
  }

  return fetch(url, fetchOptions);
}

export class KiroService {
  /**
   * 使用 refresh token 刷新 access token
   */
  async refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
    region: string
  ): Promise<KiroTokenResponse> {
    const url = `https://oidc.${region}.amazonaws.com/token`;

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grantType: 'refresh_token',
          clientId,
          clientSecret,
          refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error, region }, 'Kiro token refresh failed');
        throw new AppError(401, ErrorCodes.ACCOUNT_TOKEN_EXPIRED, 'Failed to refresh Kiro access token');
      }

      const data = await response.json() as KiroTokenResponse;

      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || refreshToken, // 可能不返回新的 refresh_token
        expiresIn: data.expiresIn || 3600,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, region }, 'Kiro token refresh error');
      throw new AppError(500, ErrorCodes.ACCOUNT_AUTH_FAILED, 'Failed to refresh Kiro access token');
    }
  }

  /**
   * 获取可用模型列表
   */
  async listModels(accessToken: string, region: string): Promise<KiroModel[]> {
    const url = `https://q.${region}.amazonaws.com/ListAvailableModels?origin=AI_EDITOR`;

    try {
      const response = await fetchWithProxy(url, {
        method: 'GET',
        headers: getKiroHeaders(accessToken),
      });

      if (response.status === 401) {
        throw new AppError(401, ErrorCodes.ACCOUNT_TOKEN_EXPIRED, 'Kiro access token expired');
      }

      if (response.status === 403) {
        const errorBody = await response.text();
        logger.warn({ status: 403, error: errorBody }, 'Kiro account forbidden (403)');
        throw new AppError(403, ErrorCodes.ACCOUNT_FORBIDDEN, `Kiro API error: 403 - ${errorBody}`);
      }

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Failed to fetch Kiro models');
        throw new AppError(500, ErrorCodes.ACCOUNT_QUOTA_REFRESH_FAILED, 'Failed to get Kiro models');
      }

      const data = await response.json() as KiroModelsResponse;
      return data.models || [];
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error }, 'Failed to fetch Kiro models');
      throw new AppError(500, ErrorCodes.ACCOUNT_QUOTA_REFRESH_FAILED, 'Failed to get Kiro models');
    }
  }

  /**
   * 验证账号是否有效（通过获取模型列表）
   */
  async validateAccount(accessToken: string, region: string): Promise<{ valid: boolean; models: string[] }> {
    try {
      const models = await this.listModels(accessToken, region);
      return {
        valid: true,
        models: models.map(m => m.modelId),
      };
    } catch (error) {
      logger.warn({ error }, 'Kiro account validation failed');
      return {
        valid: false,
        models: [],
      };
    }
  }
}

export const kiroService = new KiroService();

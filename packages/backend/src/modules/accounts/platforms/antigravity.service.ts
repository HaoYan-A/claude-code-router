import crypto from 'crypto';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../middlewares/error.middleware.js';
import { ErrorCodes } from '@claude-code-router/shared';

// Google OAuth 配置（硬编码，与 Antigravity 客户端一致）
const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const ANTIGRAVITY_CLIENT_SECRET = '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';
const ANTIGRAVITY_REDIRECT_URI = 'http://localhost:51121/oauth-callback';

// Google OAuth 端点
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v1/userinfo';

// Antigravity API 端点
const QUOTA_API_URL = 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels';
const LOAD_PROJECT_API_URL = 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist';

// OAuth 作用域
const ANTIGRAVITY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];

const USER_AGENT = 'antigravity/1.15.8 Darwin/arm64';

export interface AntigravityTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface AntigravitySubscription {
  tier: string | null;
  projectId: string | null;
}

export interface AntigravityQuota {
  model: string;
  percentage: number;
  resetTime: string | null;
}

export interface AntigravityUserInfo {
  email: string;
  subscription: AntigravitySubscription;
  quotas: AntigravityQuota[];
}

export interface OAuthStateData {
  verifier: string;
  projectId: string;
}

// 内存存储 OAuth state（生产环境应使用 Redis）
const oauthStateStore = new Map<string, OAuthStateData>();

function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function encodeState(verifier: string, projectId = ''): string {
  const payload = { verifier, projectId };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeState(state: string): OAuthStateData {
  try {
    const json = Buffer.from(state, 'base64url').toString('utf-8');
    const payload = JSON.parse(json);
    if (typeof payload.verifier !== 'string') {
      throw new Error('Missing PKCE verifier in state');
    }
    return {
      verifier: payload.verifier,
      projectId: payload.projectId || '',
    };
  } catch {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Invalid OAuth state');
  }
}

async function fetchWithProxy(url: string, options: RequestInit = {}): Promise<Response> {
  // 如果启用了代理，可以在这里配置
  // 目前直接使用 fetch
  return fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      ...options.headers,
    },
  });
}

export class AntigravityService {
  /**
   * 生成 OAuth 授权 URL（使用 PKCE）
   */
  getOAuthUrl(projectId = ''): { url: string; state: string } {
    const { verifier, challenge } = generatePkcePair();
    const state = encodeState(verifier, projectId);

    // 存储 state 用于后续验证
    oauthStateStore.set(state, { verifier, projectId });

    // 10 分钟后自动清理
    setTimeout(() => oauthStateStore.delete(state), 10 * 60 * 1000);

    const params = new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: ANTIGRAVITY_REDIRECT_URI,
      scope: ANTIGRAVITY_SCOPES.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return {
      url: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
      state,
    };
  }

  /**
   * 从 callback URL 中提取 code 和 state
   */
  extractCodeFromUrl(callbackUrl: string): { code: string; state: string } {
    try {
      const url = new URL(callbackUrl);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code || !state) {
        throw new Error('Missing code or state');
      }
      return { code, state };
    } catch {
      throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Invalid callback URL');
    }
  }

  /**
   * 使用 authorization code 交换 tokens（PKCE 流程）
   */
  async exchangeCodeForTokens(code: string, state: string): Promise<AntigravityTokenResponse & { email?: string; projectId?: string }> {
    // 从 state 中获取 verifier
    const stateData = oauthStateStore.get(state) || decodeState(state);
    const { verifier, projectId } = stateData;

    // 清理已使用的 state
    oauthStateStore.delete(state);

    try {
      const response = await fetchWithProxy(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: ANTIGRAVITY_CLIENT_ID,
          client_secret: ANTIGRAVITY_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: ANTIGRAVITY_REDIRECT_URI,
          code_verifier: verifier,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Google OAuth token exchange failed');
        throw new AppError(400, ErrorCodes.ACCOUNT_OAUTH_FAILED, 'Failed to exchange code for tokens');
      }

      const tokenData = await response.json() as AntigravityTokenResponse;

      if (!tokenData.refresh_token) {
        throw new AppError(400, ErrorCodes.ACCOUNT_OAUTH_FAILED, 'Missing refresh token in response');
      }

      // 获取用户邮箱
      let email: string | undefined;
      try {
        const userResponse = await fetchWithProxy(`${GOOGLE_USERINFO_ENDPOINT}?alt=json`, {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });
        if (userResponse.ok) {
          const userData = await userResponse.json() as { email?: string };
          email = userData.email;
        }
      } catch (e) {
        logger.warn({ error: e }, 'Failed to fetch user info');
      }

      // 获取 project ID
      let effectiveProjectId = projectId;
      if (!effectiveProjectId) {
        effectiveProjectId = await this.fetchProjectId(tokenData.access_token) || '';
      }

      return {
        ...tokenData,
        email,
        projectId: effectiveProjectId,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error }, 'Google OAuth token exchange error');
      throw new AppError(500, ErrorCodes.ACCOUNT_OAUTH_FAILED, 'Failed to exchange code for tokens');
    }
  }

  /**
   * 使用 refresh token 刷新 access token
   */
  async refreshAccessToken(refreshToken: string): Promise<AntigravityTokenResponse> {
    try {
      const response = await fetchWithProxy(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: ANTIGRAVITY_CLIENT_ID,
          client_secret: ANTIGRAVITY_CLIENT_SECRET,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Google token refresh failed');
        throw new AppError(401, ErrorCodes.ACCOUNT_TOKEN_EXPIRED, 'Failed to refresh access token');
      }

      const tokenData = await response.json() as AntigravityTokenResponse;
      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || refreshToken, // Google 可能不返回新的 refresh_token
        expires_in: tokenData.expires_in || 3600,
        token_type: tokenData.token_type || 'Bearer',
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error }, 'Google token refresh error');
      throw new AppError(500, ErrorCodes.ACCOUNT_AUTH_FAILED, 'Failed to refresh access token');
    }
  }

  /**
   * 获取 Project ID 和订阅等级
   */
  async fetchProjectIdAndSubscription(accessToken: string): Promise<AntigravitySubscription> {
    try {
      const response = await fetchWithProxy(LOAD_PROJECT_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } }),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Failed to fetch project info');
        return { tier: null, projectId: null };
      }

      const data = await response.json() as {
        cloudaicompanionProject?: string;
        paidTier?: { id?: string };
        currentTier?: { id?: string };
      };

      const projectId = data.cloudaicompanionProject || null;
      const rawTier = data.paidTier?.id || data.currentTier?.id;

      // 映射订阅等级
      const tierMapping: Record<string, string> = {
        'g1-ultra-tier': 'ULTRA',
        'g1-pro-tier': 'PRO',
        'free-tier': 'FREE',
        'standard-tier': 'FREE',
      };
      const tier = rawTier ? (tierMapping[rawTier] || rawTier.toUpperCase()) : null;

      return { tier, projectId };
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch project info');
      return { tier: null, projectId: null };
    }
  }

  /**
   * 仅获取 Project ID
   */
  async fetchProjectId(accessToken: string): Promise<string | null> {
    const { projectId } = await this.fetchProjectIdAndSubscription(accessToken);
    return projectId;
  }

  /**
   * 获取用户信息（包括订阅和额度）
   */
  async getUserInfo(accessToken: string): Promise<AntigravityUserInfo> {
    // 获取用户邮箱
    let email = 'unknown';
    try {
      const userResponse = await fetchWithProxy(`${GOOGLE_USERINFO_ENDPOINT}?alt=json`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (userResponse.ok) {
        const userData = await userResponse.json() as { email?: string };
        email = userData.email || 'unknown';
      }
    } catch (e) {
      logger.warn({ error: e }, 'Failed to fetch user info');
    }

    // 获取订阅信息
    const subscription = await this.fetchProjectIdAndSubscription(accessToken);

    // 获取额度信息
    const quotas = await this.getQuotas(accessToken, subscription.projectId);

    return {
      email,
      subscription,
      quotas,
    };
  }

  /**
   * 获取额度信息
   */
  async getQuotas(accessToken: string, projectId?: string | null): Promise<AntigravityQuota[]> {
    try {
      const body: Record<string, string> = {};
      if (projectId) {
        body.project = projectId;
      }

      const response = await fetchWithProxy(QUOTA_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        throw new AppError(401, ErrorCodes.ACCOUNT_TOKEN_EXPIRED, 'Access token expired');
      }

      if (response.status === 403) {
        logger.warn('Account forbidden (403)');
        return [];
      }

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Failed to fetch quotas');
        throw new AppError(500, ErrorCodes.ACCOUNT_QUOTA_REFRESH_FAILED, 'Failed to get quotas');
      }

      const data = await response.json() as {
        models?: Record<string, {
          quotaInfo?: {
            remainingFraction?: number;
            resetTime?: string;
          };
        }>;
      };

      const quotas: AntigravityQuota[] = [];
      const models = data.models || {};

      for (const [name, info] of Object.entries(models)) {
        // 只保留 claude 或 gemini 模型
        const nameLower = name.toLowerCase();
        if (!nameLower.includes('claude') && !nameLower.includes('gemini')) {
          continue;
        }

        const quotaInfo = info.quotaInfo || {};
        const remainingFraction = quotaInfo.remainingFraction ?? 0;
        const resetTime = quotaInfo.resetTime || null;

        quotas.push({
          model: name,
          percentage: Math.round(remainingFraction * 100),
          resetTime,
        });
      }

      return quotas;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error }, 'Failed to fetch quotas');
      throw new AppError(500, ErrorCodes.ACCOUNT_QUOTA_REFRESH_FAILED, 'Failed to get quotas');
    }
  }
}

export const antigravityService = new AntigravityService();

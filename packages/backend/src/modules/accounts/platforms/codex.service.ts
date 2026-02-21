import crypto from 'crypto';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../middlewares/error.middleware.js';
import { ErrorCodes } from '@claude-code-router/shared';
import { getUpstreamClient } from '../../../lib/upstream-client.js';

// Codex CLI OAuth 配置
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const CODEX_AUTH_ENDPOINT = 'https://auth.openai.com/oauth/authorize';
const CODEX_TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token';
const CODEX_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

const USER_AGENT = 'codex-cli/1.0.0';

export interface CodexTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

export interface CodexIdTokenPayload {
  chatgptAccountId?: string;
  email?: string;
  sub?: string;
  planType?: string;
  subscriptionActiveStart?: string;
  subscriptionActiveUntil?: string;
  organizations?: Array<{
    id: string;
    is_default: boolean;
    role: string;
    title: string;
  }>;
}

// planType → subscriptionTier 映射
const PLAN_TIER_MAP: Record<string, string> = {
  free: 'FREE',
  plus: 'PLUS',
  pro: 'PRO',
  team: 'TEAM',
};

interface OAuthStateData {
  verifier: string;
  createdAt: number;
}

// 内存存储 OAuth state（10 分钟过期）
const oauthStateStore = new Map<string, OAuthStateData>();

function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function fetchWithProxy(url: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }> {
  const upstreamClient = getUpstreamClient();
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
  };

  // 合并传入的 headers
  if (options.headers) {
    const inHeaders = options.headers as Record<string, string>;
    Object.assign(headers, inHeaders);
  }

  const response = await upstreamClient.fetch(url, {
    method: options.method || 'GET',
    headers,
    body: typeof options.body === 'string' ? options.body : options.body?.toString(),
  });

  return response;
}

export class CodexService {
  /**
   * 生成 Codex OAuth 授权 URL（使用 PKCE）
   */
  getOAuthUrl(): { url: string; state: string } {
    const { verifier, challenge } = generatePkcePair();
    const state = crypto.randomBytes(32).toString('hex');

    // 存储 state → verifier 映射
    oauthStateStore.set(state, { verifier, createdAt: Date.now() });

    // 10 分钟后自动清理
    setTimeout(() => oauthStateStore.delete(state), 10 * 60 * 1000);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CODEX_CLIENT_ID,
      redirect_uri: CODEX_REDIRECT_URI,
      scope: CODEX_SCOPES.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
    });

    return {
      url: `${CODEX_AUTH_ENDPOINT}?${params.toString()}`,
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
  async exchangeCodeForTokens(code: string, state: string): Promise<CodexTokenResponse> {
    // 从 state store 获取 verifier
    const stateData = oauthStateStore.get(state);
    if (!stateData) {
      throw new AppError(400, ErrorCodes.ACCOUNT_OAUTH_FAILED, 'Invalid or expired OAuth state');
    }

    const { verifier } = stateData;

    // 清理已使用的 state
    oauthStateStore.delete(state);

    try {
      const response = await fetchWithProxy(CODEX_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: CODEX_CLIENT_ID,
          grant_type: 'authorization_code',
          code,
          redirect_uri: CODEX_REDIRECT_URI,
          code_verifier: verifier,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Codex OAuth token exchange failed');
        throw new AppError(400, ErrorCodes.ACCOUNT_OAUTH_FAILED, 'Failed to exchange code for tokens');
      }

      const tokenData = await response.json() as CodexTokenResponse;

      if (!tokenData.refresh_token) {
        throw new AppError(400, ErrorCodes.ACCOUNT_OAUTH_FAILED, 'Missing refresh token in response');
      }

      return tokenData;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error }, 'Codex OAuth token exchange error');
      throw new AppError(500, ErrorCodes.ACCOUNT_OAUTH_FAILED, 'Failed to exchange code for tokens');
    }
  }

  /**
   * 使用 refresh token 刷新 access token
   */
  async refreshAccessToken(refreshToken: string): Promise<CodexTokenResponse> {
    try {
      const response = await fetchWithProxy(CODEX_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: CODEX_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Codex token refresh failed');
        throw new AppError(401, ErrorCodes.ACCOUNT_TOKEN_EXPIRED, 'Failed to refresh Codex access token');
      }

      const tokenData = await response.json() as CodexTokenResponse;
      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || refreshToken,
        expires_in: tokenData.expires_in || 3600,
        token_type: tokenData.token_type || 'Bearer',
        id_token: tokenData.id_token,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error }, 'Codex token refresh error');
      throw new AppError(500, ErrorCodes.ACCOUNT_AUTH_FAILED, 'Failed to refresh Codex access token');
    }
  }

  /**
   * 解析 id_token JWT payload 提取 chatgptAccountId 和 email
   */
  parseIdToken(idToken: string): CodexIdTokenPayload {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      const authData = payload['https://api.openai.com/auth'];
      return {
        chatgptAccountId: authData?.user_id || payload.sub,
        email: payload.email,
        planType: authData?.chatgpt_plan_type,
        subscriptionActiveStart: authData?.chatgpt_subscription_active_start,
        subscriptionActiveUntil: authData?.chatgpt_subscription_active_until,
        organizations: authData?.organizations,
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to parse Codex id_token');
      return {};
    }
  }

  /**
   * 从 id_token payload 构建订阅更新数据
   */
  buildSubscriptionUpdate(idPayload: CodexIdTokenPayload) {
    return {
      subscriptionTier: PLAN_TIER_MAP[idPayload.planType ?? ''] ?? idPayload.planType?.toUpperCase() ?? null,
      subscriptionExpiresAt: idPayload.subscriptionActiveUntil
        ? new Date(idPayload.subscriptionActiveUntil)
        : null,
      subscriptionRawPatch: {
        chatgptAccountId: idPayload.chatgptAccountId ?? null,
        email: idPayload.email ?? null,
        planType: idPayload.planType ?? null,
        subscriptionActiveStart: idPayload.subscriptionActiveStart ?? null,
        organizations: idPayload.organizations ?? null,
      },
    };
  }
}

export const codexService = new CodexService();

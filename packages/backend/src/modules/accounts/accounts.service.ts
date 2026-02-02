import type { AccountPlatform, Prisma } from '@prisma/client';
import type {
  CreateAccountSchema,
  UpdateAccountSchema,
  OAuthExchangeSchema,
  ImportKiroAccountSchema,
} from '@claude-code-router/shared';
import { ErrorCodes } from '@claude-code-router/shared';
import { accountsRepository, type AccountListParams, type AccountWithQuotas } from './accounts.repository.js';
import { antigravityService } from './platforms/antigravity.service.js';
import { kiroService } from './platforms/kiro.service.js';
import { AppError } from '../../middlewares/error.middleware.js';
import { getAllPlatformModels } from '../../config/platforms.js';
import { logger } from '../../lib/logger.js';

export class AccountsService {
  /**
   * 获取账号列表
   */
  async getAll(params: AccountListParams) {
    const { data, total } = await accountsRepository.findMany(params);
    return {
      data: data.map(this.sanitizeAccount),
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit),
    };
  }

  /**
   * 获取单个账号详情
   */
  async getById(id: string) {
    const account = await accountsRepository.findById(id);
    if (!account) {
      throw new AppError(404, ErrorCodes.ACCOUNT_NOT_FOUND, 'Account not found');
    }
    return this.sanitizeAccount(account);
  }

  /**
   * 创建账号（通过 refresh token）
   */
  async create(input: CreateAccountSchema) {
    const { platform, name, refreshToken, priority, schedulable } = input;

    if (platform === 'antigravity') {
      return this.createAntigravityAccount(refreshToken, name, priority, schedulable);
    }

    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, `Unsupported platform: ${platform}`);
  }

  /**
   * 创建 Antigravity 账号
   */
  private async createAntigravityAccount(
    refreshToken: string,
    name?: string,
    priority = 50,
    schedulable = true
  ) {
    // 1. 使用 refresh token 获取 access token
    const tokenResponse = await antigravityService.refreshAccessToken(refreshToken);

    // 2. 获取用户信息
    const userInfo = await antigravityService.getUserInfo(tokenResponse.access_token);

    // 3. 检查是否已存在
    const existing = await accountsRepository.findByPlatformId('antigravity', userInfo.email);
    if (existing) {
      throw new AppError(409, ErrorCodes.ACCOUNT_ALREADY_EXISTS, 'Account already exists');
    }

    // 4. 创建账号
    const account = await accountsRepository.create({
      platform: 'antigravity',
      platformId: userInfo.email,
      name: name ?? userInfo.email,
      refreshToken: tokenResponse.refresh_token,
      accessToken: tokenResponse.access_token,
      tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      subscriptionTier: userInfo.subscription.tier,
      subscriptionExpiresAt: null, // Antigravity 不提供过期时间
      subscriptionRaw: { projectId: userInfo.subscription.projectId } as Prisma.InputJsonValue,
      status: 'active',
      priority,
      schedulable,
    });

    // 5. 保存额度信息
    for (const quota of userInfo.quotas) {
      await accountsRepository.upsertQuota(account.id, quota.model, quota.percentage, quota.resetTime);
    }

    // 6. 重新获取带额度的账号
    const result = await accountsRepository.findById(account.id);
    return this.sanitizeAccount(result!);
  }

  /**
   * 更新账号
   */
  async update(id: string, input: UpdateAccountSchema) {
    const existing = await accountsRepository.findById(id);
    if (!existing) {
      throw new AppError(404, ErrorCodes.ACCOUNT_NOT_FOUND, 'Account not found');
    }

    const account = await accountsRepository.update(id, input);
    return this.sanitizeAccount(account);
  }

  /**
   * 删除账号
   */
  async delete(id: string) {
    const existing = await accountsRepository.findById(id);
    if (!existing) {
      throw new AppError(404, ErrorCodes.ACCOUNT_NOT_FOUND, 'Account not found');
    }

    await accountsRepository.delete(id);
  }

  /**
   * 获取 OAuth 授权 URL
   */
  getOAuthUrl(platform: AccountPlatform): { url: string; state: string } {
    if (platform === 'antigravity') {
      return antigravityService.getOAuthUrl();
    }
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, `Unsupported platform: ${platform}`);
  }

  /**
   * 使用 OAuth code URL 交换并创建账号
   */
  async exchangeOAuthCode(platform: AccountPlatform, input: OAuthExchangeSchema) {
    if (platform === 'antigravity') {
      return this.exchangeAntigravityCode(input);
    }
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, `Unsupported platform: ${platform}`);
  }

  /**
   * Antigravity OAuth code 交换
   */
  private async exchangeAntigravityCode(input: OAuthExchangeSchema) {
    const { codeUrl, name, priority, schedulable } = input;

    // 1. 从 URL 中提取 code 和 state
    const { code, state } = antigravityService.extractCodeFromUrl(codeUrl);

    // 2. 交换 tokens
    const tokenResponse = await antigravityService.exchangeCodeForTokens(code, state);

    // 3. 使用相同逻辑创建账号
    return this.createAntigravityAccount(
      tokenResponse.refresh_token,
      name,
      priority,
      schedulable
    );
  }

  /**
   * 刷新账号的 access token
   */
  async refreshToken(id: string) {
    const account = await accountsRepository.findById(id);
    if (!account) {
      throw new AppError(404, ErrorCodes.ACCOUNT_NOT_FOUND, 'Account not found');
    }

    if (!account.refreshToken) {
      throw new AppError(400, ErrorCodes.ACCOUNT_AUTH_FAILED, 'No refresh token available');
    }

    if (account.platform === 'antigravity') {
      try {
        const tokenResponse = await antigravityService.refreshAccessToken(account.refreshToken);

        await accountsRepository.update(id, {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
          status: 'active',
          errorMessage: null,
        });

        return { success: true, message: 'Token refreshed successfully' };
      } catch (error) {
        await accountsRepository.update(id, {
          status: 'expired',
          errorMessage: error instanceof Error ? error.message : 'Token refresh failed',
        });
        throw error;
      }
    }

    if (account.platform === 'kiro') {
      return this.refreshKiroToken(id, account);
    }

    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, `Unsupported platform: ${account.platform}`);
  }

  /**
   * 刷新 Kiro 账号的 Token
   */
  private async refreshKiroToken(id: string, account: AccountWithQuotas) {
    if (!account.kiroClientId || !account.kiroClientSecret || !account.kiroRegion) {
      throw new AppError(400, ErrorCodes.ACCOUNT_AUTH_FAILED, 'Missing Kiro client credentials');
    }

    try {
      const tokenResponse = await kiroService.refreshAccessToken(
        account.refreshToken!,
        account.kiroClientId,
        account.kiroClientSecret,
        account.kiroRegion
      );

      await accountsRepository.update(id, {
        accessToken: tokenResponse.accessToken,
        refreshToken: tokenResponse.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokenResponse.expiresIn * 1000),
        status: 'active',
        errorMessage: null,
      });

      return { success: true, message: 'Kiro token refreshed successfully' };
    } catch (error) {
      await accountsRepository.update(id, {
        status: 'expired',
        errorMessage: error instanceof Error ? error.message : 'Token refresh failed',
      });
      throw error;
    }
  }

  /**
   * 导入 Kiro 账号
   */
  async importKiroAccount(input: ImportKiroAccountSchema) {
    const { authToken, clientConfig, name, priority = 50, schedulable = true } = input;

    // 1. 检查是否已存在（使用 clientIdHash 作为 platformId）
    const existing = await accountsRepository.findByPlatformId('kiro', authToken.clientIdHash);
    if (existing) {
      throw new AppError(409, ErrorCodes.ACCOUNT_ALREADY_EXISTS, 'Kiro account already exists');
    }

    // 2. 验证 Token 是否有效
    const validation = await kiroService.validateAccount(authToken.accessToken, authToken.region);
    if (!validation.valid) {
      throw new AppError(400, ErrorCodes.ACCOUNT_AUTH_FAILED, 'Invalid Kiro access token');
    }

    // 3. 创建账号
    const account = await accountsRepository.create({
      platform: 'kiro',
      platformId: authToken.clientIdHash,
      name: name ?? `Kiro-${authToken.clientIdHash.substring(0, 8)}`,
      accessToken: authToken.accessToken,
      refreshToken: authToken.refreshToken,
      tokenExpiresAt: new Date(authToken.expiresAt),
      kiroClientId: clientConfig.clientId,
      kiroClientSecret: clientConfig.clientSecret,
      kiroRegion: authToken.region,
      status: 'active',
      priority,
      schedulable,
    });

    // 4. 保存模型额度（Kiro 按模型计算，暂时全部设为 100%）
    for (const modelId of validation.models) {
      await accountsRepository.upsertQuota(account.id, modelId, 100, null);
    }

    // 5. 重新获取带额度的账号
    const result = await accountsRepository.findById(account.id);
    return this.sanitizeAccount(result!);
  }

  /**
   * 刷新账号额度
   */
  async refreshQuota(id: string) {
    const account = await accountsRepository.findById(id);
    if (!account) {
      throw new AppError(404, ErrorCodes.ACCOUNT_NOT_FOUND, 'Account not found');
    }

    // 确保有有效的 access token
    await this.ensureValidToken(account);

    // 重新获取账号（可能 token 已更新）
    const refreshedAccount = await accountsRepository.findById(id);
    if (!refreshedAccount || !refreshedAccount.accessToken) {
      throw new AppError(500, ErrorCodes.ACCOUNT_AUTH_FAILED, 'Failed to get valid access token');
    }

    if (refreshedAccount.platform === 'antigravity') {
      let quotas;
      let currentAccessToken = refreshedAccount.accessToken;

      try {
        quotas = await antigravityService.getQuotas(currentAccessToken);
      } catch (error) {
        // 403 错误时自动刷新 token 并重试一次
        if (error instanceof AppError && error.statusCode === 403) {
          logger.info({ accountId: id }, 'Got 403, refreshing token and retrying...');
          await this.refreshToken(id);

          // 重新获取刷新后的账号
          const retryAccount = await accountsRepository.findById(id);
          if (!retryAccount || !retryAccount.accessToken) {
            throw new AppError(500, ErrorCodes.ACCOUNT_AUTH_FAILED, 'Failed to refresh token');
          }
          currentAccessToken = retryAccount.accessToken;

          // 重试获取额度
          quotas = await antigravityService.getQuotas(currentAccessToken);
        } else {
          throw error;
        }
      }

      for (const quota of quotas) {
        await accountsRepository.upsertQuota(id, quota.model, quota.percentage, quota.resetTime);
      }

      // 获取并更新订阅等级
      try {
        const subscription = await antigravityService.fetchProjectIdAndSubscription(currentAccessToken);
        if (subscription.tier) {
          await accountsRepository.update(id, {
            subscriptionTier: subscription.tier,
          });
        }
      } catch (error) {
        logger.warn({ accountId: id, error }, 'Failed to update subscription tier');
      }

      const result = await accountsRepository.findById(id);
      return this.sanitizeAccount(result!);
    }

    if (refreshedAccount.platform === 'kiro') {
      // Kiro 平台：获取模型列表作为额度信息
      let currentAccessToken = refreshedAccount.accessToken;

      try {
        const models = await kiroService.listModels(currentAccessToken, refreshedAccount.kiroRegion!);

        // 更新模型额度（Kiro 暂时全部设为 100%）
        for (const model of models) {
          await accountsRepository.upsertQuota(id, model.modelId, 100, null);
        }
      } catch (error) {
        // Token 过期时自动刷新并重试
        if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
          logger.info({ accountId: id }, 'Got 401/403, refreshing Kiro token and retrying...');
          await this.refreshToken(id);

          // 重新获取刷新后的账号
          const retryAccount = await accountsRepository.findById(id);
          if (!retryAccount || !retryAccount.accessToken) {
            throw new AppError(500, ErrorCodes.ACCOUNT_AUTH_FAILED, 'Failed to refresh Kiro token');
          }
          currentAccessToken = retryAccount.accessToken;

          // 重试获取模型列表
          const models = await kiroService.listModels(currentAccessToken, retryAccount.kiroRegion!);
          for (const model of models) {
            await accountsRepository.upsertQuota(id, model.modelId, 100, null);
          }
        } else {
          throw error;
        }
      }

      const result = await accountsRepository.findById(id);
      return this.sanitizeAccount(result!);
    }

    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, `Unsupported platform: ${account.platform}`);
  }

  /**
   * 批量刷新所有账号额度
   */
  async refreshAllQuotas() {
    const { data: accounts } = await accountsRepository.findMany({
      isActive: true,
      page: 1,
      limit: 1000, // 获取所有激活的账号
    });

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const account of accounts) {
      try {
        await this.refreshQuota(account.id);
        results.push({ id: account.id, success: true });
      } catch (error) {
        logger.error({ accountId: account.id, error }, 'Failed to refresh quota');
        results.push({
          id: account.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * 获取指定模型的可用账号列表
   */
  async getAvailableForModel(modelName: string) {
    const accounts = await accountsRepository.findAvailableForModel(modelName);
    return accounts.map(this.sanitizeAccount);
  }

  /**
   * 获取所有平台支持的模型列表
   */
  getPlatformModels() {
    return getAllPlatformModels();
  }

  /**
   * 确保账号有有效的 access token
   */
  private async ensureValidToken(account: AccountWithQuotas) {
    if (!account.accessToken || !account.tokenExpiresAt) {
      await this.refreshToken(account.id);
      return;
    }

    // 如果 token 将在 5 分钟内过期，提前刷新
    // 处理从缓存读取时 tokenExpiresAt 可能是字符串的情况
    const expiresAt = account.tokenExpiresAt instanceof Date
      ? account.tokenExpiresAt
      : new Date(account.tokenExpiresAt);
    const expiresIn = expiresAt.getTime() - Date.now();
    if (expiresIn < 5 * 60 * 1000) {
      await this.refreshToken(account.id);
    }
  }

  /**
   * 清理敏感信息
   */
  private sanitizeAccount(account: AccountWithQuotas) {
    const { refreshToken, accessToken, ...safe } = account;
    return safe;
  }
}

export const accountsService = new AccountsService();

/**
 * 账号选择器
 *
 * 根据目标模型选择可用的第三方账号：
 * 1. 筛选条件：激活、状态正常、可调度、配额充足
 * 2. 轮询策略：使用 Redis 原子计数实现负载均衡
 * 3. Token 刷新：提前 60 秒检查过期
 * 4. 失败处理：429 切换账号、401/403 标记错误
 */

import type { AccountWithQuotas } from '../accounts/accounts.repository.js';
import { accountsRepository } from '../accounts/accounts.repository.js';
import { antigravityService } from '../accounts/platforms/antigravity.service.js';
import type { SelectedAccount } from './types.js';
import { logger } from '../../lib/logger.js';
import { AccountRoundRobin } from './account-round-robin.js';

// Token 提前刷新时间 (60 秒)
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

export class AccountSelector {
  /**
   * 选择可用账号
   *
   * 使用轮询策略均匀分配请求到各个账号：
   * 1. 获取轮询起始索引
   * 2. 从该索引开始尝试各个账号
   * 3. 第一个准备成功的账号被选中
   *
   * @param targetModel 目标模型名称
   * @returns 选中的账号信息，如果没有可用账号则返回 null
   */
  async selectAccount(targetModel: string): Promise<SelectedAccount | null> {
    // 查找符合条件的账号
    const accounts = await accountsRepository.findAvailableForModel(targetModel);

    if (accounts.length === 0) {
      logger.warn({ targetModel }, 'No available accounts for model');
      return null;
    }

    // 获取轮询起始索引
    const startIndex = await AccountRoundRobin.getNextIndex('global', accounts.length);

    // 从起始索引开始尝试各个账号
    for (let i = 0; i < accounts.length; i++) {
      const index = (startIndex + i) % accounts.length;
      const account = accounts[index];

      try {
        const selected = await this.prepareAccount(account);
        if (selected) {
          logger.info(
            { accountId: account.id, targetModel, roundRobinIndex: startIndex },
            'Selected account via round-robin'
          );
          return selected;
        }
      } catch (error) {
        logger.warn(
          { accountId: account.id, error },
          'Failed to prepare account, trying next'
        );
        continue;
      }
    }

    logger.error({ targetModel, accountCount: accounts.length }, 'All accounts failed');
    return null;
  }

  /**
   * 准备账号（刷新 token 如果需要）
   */
  private async prepareAccount(account: AccountWithQuotas): Promise<SelectedAccount | null> {
    // 检查必要字段
    if (!account.refreshToken) {
      logger.warn({ accountId: account.id }, 'Account missing refresh token');
      return null;
    }

    let accessToken = account.accessToken;
    let tokenExpiresAt = account.tokenExpiresAt;

    // 检查是否需要刷新 token
    const needsRefresh =
      !accessToken ||
      !tokenExpiresAt ||
      tokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS;

    if (needsRefresh) {
      logger.info({ accountId: account.id }, 'Refreshing access token');

      try {
        const tokenData = await antigravityService.refreshAccessToken(account.refreshToken);

        accessToken = tokenData.access_token;
        tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

        // 更新数据库
        await accountsRepository.update(account.id, {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || account.refreshToken,
          tokenExpiresAt,
          status: 'active',
          errorMessage: null,
        });

        logger.info(
          { accountId: account.id, expiresAt: tokenExpiresAt },
          'Access token refreshed'
        );
      } catch (error) {
        // 刷新失败，标记账号状态
        await this.markAccountError(account.id, error);
        return null;
      }
    }

    // 获取 project ID
    const projectId = await this.getProjectId(account, accessToken!);
    if (!projectId) {
      logger.warn({ accountId: account.id }, 'Account missing project ID');
      return null;
    }

    return {
      id: account.id,
      accessToken: accessToken!,
      projectId,
      refreshToken: account.refreshToken,
      tokenExpiresAt,
    };
  }

  /**
   * 获取 project ID
   */
  private async getProjectId(
    account: AccountWithQuotas,
    accessToken: string
  ): Promise<string | null> {
    // 从订阅信息中获取
    const subscriptionRaw = account.subscriptionRaw as { projectId?: string } | null;
    if (subscriptionRaw?.projectId) {
      return subscriptionRaw.projectId;
    }

    // 从 API 获取
    try {
      const projectId = await antigravityService.fetchProjectId(accessToken);
      if (projectId) {
        // 更新数据库
        await accountsRepository.update(account.id, {
          subscriptionRaw: { ...subscriptionRaw, projectId },
        });
        return projectId;
      }
    } catch (error) {
      logger.warn({ accountId: account.id, error }, 'Failed to fetch project ID');
    }

    return null;
  }

  /**
   * 处理请求失败
   *
   * @param accountId 账号 ID
   * @param statusCode HTTP 状态码
   * @param errorMessage 错误信息
   * @returns 是否应该重试（使用其他账号）
   */
  async handleRequestFailure(
    accountId: string,
    statusCode: number,
    errorMessage?: string
  ): Promise<boolean> {
    switch (statusCode) {
      case 429:
        // 配额耗尽，可以重试其他账号
        logger.warn({ accountId, statusCode }, 'Account rate limited');
        return true;

      case 401:
      case 403:
        // Token 无效或权限问题
        await this.markAccountError(accountId, new Error(errorMessage || 'Unauthorized'));
        return true;

      case 400:
        // 请求错误，通常不需要切换账号
        return false;

      default:
        // 其他错误，可以重试
        return statusCode >= 500;
    }
  }

  /**
   * 标记账号错误状态
   */
  private async markAccountError(accountId: string, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await accountsRepository.update(accountId, {
      status: 'error',
      errorMessage,
    });

    logger.error({ accountId, errorMessage }, 'Account marked as error');
  }

  /**
   * 更新账号使用统计
   */
  async updateUsageStats(
    accountId: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    await accountsRepository.updateUsageStats(accountId, {
      totalRequests: 1,
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      lastUsedAt: new Date(),
    });
  }
}

export const accountSelector = new AccountSelector();

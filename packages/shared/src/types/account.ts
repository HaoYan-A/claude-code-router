/**
 * 第三方账号相关类型定义
 */

// 平台类型
export type AccountPlatform = 'antigravity';

// 账号状态
export type AccountStatus = 'created' | 'active' | 'expired' | 'error';

// 账号额度信息
export interface AccountQuota {
  id: string;
  accountId: string;
  modelName: string;
  percentage: number; // 0-100
  resetTime: string | null;
  lastUpdatedAt: Date;
}

// 第三方账号
export interface ThirdPartyAccount {
  id: string;
  platform: AccountPlatform;
  platformId: string;
  name: string | null;

  // 认证信息（不返回给前端）
  // refreshToken: string | null;
  // accessToken: string | null;
  tokenExpiresAt: Date | null;

  // 订阅信息
  subscriptionTier: string | null;
  subscriptionExpiresAt: Date | null;
  subscriptionRaw: unknown | null;

  // 状态
  isActive: boolean;
  status: AccountStatus;
  errorMessage: string | null;

  // 调度配置
  priority: number;
  schedulable: boolean;

  // 使用统计
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  lastUsedAt: Date | null;

  // 时间戳
  createdAt: Date;
  updatedAt: Date;

  // 关联的额度信息
  quotas?: AccountQuota[];
}

// 创建账号输入
export interface CreateAccountInput {
  platform: AccountPlatform;
  name?: string;
  refreshToken: string;
  priority?: number;
  schedulable?: boolean;
}

// 更新账号输入
export interface UpdateAccountInput {
  name?: string;
  isActive?: boolean;
  priority?: number;
  schedulable?: boolean;
}

// OAuth 授权 URL 响应
export interface OAuthUrlResponse {
  url: string;
}

// OAuth Code 交换请求
export interface OAuthExchangeInput {
  codeUrl: string;
  name?: string;
  priority?: number;
  schedulable?: boolean;
}

// 账号列表查询参数
export interface AccountListQuery {
  platform?: AccountPlatform;
  status?: AccountStatus;
  isActive?: boolean;
  schedulable?: boolean;
  page?: number;
  limit?: number;
}

// 可用账号查询参数
export interface AvailableAccountQuery {
  model: string;
}

// 平台模型信息
export interface PlatformModel {
  id: string;
  name: string;
}

// 平台模型列表响应
export interface PlatformModelsResponse {
  [platform: string]: PlatformModel[];
}

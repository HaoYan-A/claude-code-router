import type { Request, Response } from 'express';
import type {
  CreateAccountSchema,
  UpdateAccountSchema,
  AccountListQuerySchema,
  OAuthExchangeSchema,
  AvailableAccountQuerySchema,
  ImportKiroAccountSchema,
  ImportOpenAIAccountSchema,
  CodexOAuthExchangeSchema,
} from '@claude-code-router/shared';
import { accountsService } from './accounts.service.js';

export class AccountsController {
  /**
   * 获取账号列表
   */
  async getAll(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as AccountListQuerySchema;
    const result = await accountsService.getAll({
      platform: query.platform as 'antigravity' | 'kiro' | 'openai' | undefined,
      status: query.status as 'created' | 'active' | 'expired' | 'error' | undefined,
      isActive: query.isActive,
      schedulable: query.schedulable,
      page: query.page,
      limit: query.limit,
    });
    res.json({ success: true, data: result });
  }

  /**
   * 获取单个账号详情
   */
  async getById(req: Request, res: Response): Promise<void> {
    const account = await accountsService.getById(req.params.id);
    res.json({ success: true, data: account });
  }

  /**
   * 创建账号
   */
  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateAccountSchema;
    const account = await accountsService.create(input);
    res.status(201).json({ success: true, data: account });
  }

  /**
   * 更新账号
   */
  async update(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdateAccountSchema;
    const account = await accountsService.update(req.params.id, input);
    res.json({ success: true, data: account });
  }

  /**
   * 删除账号
   */
  async delete(req: Request, res: Response): Promise<void> {
    await accountsService.delete(req.params.id);
    res.json({ success: true, message: 'Account deleted successfully' });
  }

  /**
   * 获取 OAuth 授权 URL
   */
  async getOAuthUrl(_req: Request, res: Response): Promise<void> {
    // 目前只支持 antigravity
    const { url, state } = accountsService.getOAuthUrl('antigravity');
    res.json({ success: true, data: { url, state } });
  }

  /**
   * 使用 OAuth code URL 创建账号
   */
  async exchangeOAuthCode(req: Request, res: Response): Promise<void> {
    const input = req.body as OAuthExchangeSchema;
    // 目前只支持 antigravity
    const account = await accountsService.exchangeOAuthCode('antigravity', input);
    res.status(201).json({ success: true, data: account });
  }

  /**
   * 获取账号额度
   */
  async getQuota(req: Request, res: Response): Promise<void> {
    const account = await accountsService.getById(req.params.id);
    res.json({ success: true, data: account.quotas });
  }

  /**
   * 刷新账号额度
   */
  async refreshQuota(req: Request, res: Response): Promise<void> {
    const account = await accountsService.refreshQuota(req.params.id);
    res.json({ success: true, data: account });
  }

  /**
   * 批量刷新所有账号额度
   */
  async refreshAllQuotas(_req: Request, res: Response): Promise<void> {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const results = await accountsService.refreshAllQuotas();
    res.json({ success: true, data: results });
  }

  /**
   * 刷新账号 Token
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    const result = await accountsService.refreshToken(req.params.id);
    res.json({ success: true, data: result });
  }

  /**
   * 获取指定模型的可用账号
   */
  async getAvailable(req: Request, res: Response): Promise<void> {
    const query = req.query as AvailableAccountQuerySchema;
    const accounts = await accountsService.getAvailableForModel(query.model);
    res.json({ success: true, data: accounts });
  }

  /**
   * 获取所有平台支持的模型
   */
  async getModels(_req: Request, res: Response): Promise<void> {
    const models = accountsService.getPlatformModels();
    res.json({ success: true, data: models });
  }

  /**
   * 导入 Kiro 账号
   */
  async importKiroAccount(req: Request, res: Response): Promise<void> {
    const input = req.body as ImportKiroAccountSchema;
    const account = await accountsService.importKiroAccount(input);
    res.status(201).json({ success: true, data: account });
  }

  /**
   * 导入 OpenAI 账号
   */
  async importOpenAIAccount(req: Request, res: Response): Promise<void> {
    const input = req.body as ImportOpenAIAccountSchema;
    const account = await accountsService.importOpenAIAccount(input);
    res.status(201).json({ success: true, data: account });
  }

  /**
   * 获取 Codex OAuth 授权 URL
   */
  async getCodexOAuthUrl(_req: Request, res: Response): Promise<void> {
    const { url, state } = accountsService.getCodexOAuthUrl();
    res.json({ success: true, data: { url, state } });
  }

  /**
   * 使用 Codex OAuth code URL 创建账号
   */
  async exchangeCodexOAuthCode(req: Request, res: Response): Promise<void> {
    const input = req.body as CodexOAuthExchangeSchema;
    const account = await accountsService.exchangeCodexOAuthCode(input);
    res.status(201).json({ success: true, data: account });
  }
}

export const accountsController = new AccountsController();

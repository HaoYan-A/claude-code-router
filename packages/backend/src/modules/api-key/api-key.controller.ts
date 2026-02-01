import type { Request, Response } from 'express';
import type {
  CreateApiKeySchema,
  UpdateApiKeySchema,
  ApiKeyStatsQuerySchema,
} from '@claude-code-router/shared';
import { apiKeyService } from './api-key.service.js';

export class ApiKeyController {
  // ==================== 用户方法 ====================

  async getAll(req: Request, res: Response): Promise<void> {
    const { page = 1, pageSize = 20 } = req.query as { page?: number; pageSize?: number };
    const result = await apiKeyService.getByUserId(req.auth!.userId, {
      page: Number(page),
      pageSize: Number(pageSize),
    });
    res.json({ success: true, data: result });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const apiKey = await apiKeyService.getById(req.params.id, req.auth!.userId);
    res.json({ success: true, data: apiKey });
  }

  async create(req: Request<unknown, unknown, CreateApiKeySchema>, res: Response): Promise<void> {
    const apiKey = await apiKeyService.create(req.auth!.userId, req.body);
    res.status(201).json({
      success: true,
      data: apiKey,
      message: 'API key created. Please save the key as it will not be shown again.',
    });
  }

  async update(req: Request, res: Response): Promise<void> {
    const apiKey = await apiKeyService.update(
      req.params.id,
      req.auth!.userId,
      req.body as UpdateApiKeySchema
    );
    res.json({ success: true, data: apiKey });
  }

  async delete(req: Request, res: Response): Promise<void> {
    await apiKeyService.delete(req.params.id, req.auth!.userId);
    res.json({ success: true, message: 'API key deleted successfully' });
  }

  async getStats(req: Request, res: Response): Promise<void> {
    const { timeRange = 'month', includeDaily = false } = req.query as unknown as ApiKeyStatsQuerySchema;
    const result = await apiKeyService.getStats(
      req.params.id,
      req.auth!.userId,
      timeRange,
      includeDaily
    );
    res.json({ success: true, data: result });
  }

  async getFullKey(req: Request, res: Response): Promise<void> {
    const key = await apiKeyService.getFullKey(req.params.id, req.auth!.userId);
    res.json({ success: true, data: { key } });
  }

  // ==================== Admin 方法 ====================

  async getAllAdmin(req: Request, res: Response): Promise<void> {
    const { page = 1, pageSize = 20, userId } = req.query as {
      page?: number;
      pageSize?: number;
      userId?: string;
    };
    const result = await apiKeyService.getAllAdmin(
      { page: Number(page), pageSize: Number(pageSize) },
      userId
    );
    res.json({ success: true, data: result });
  }

  async getByIdAdmin(req: Request, res: Response): Promise<void> {
    const apiKey = await apiKeyService.getByIdAdmin(req.params.id);
    res.json({ success: true, data: apiKey });
  }

  async updateAdmin(req: Request, res: Response): Promise<void> {
    const apiKey = await apiKeyService.updateAdmin(req.params.id, req.body as UpdateApiKeySchema);
    res.json({ success: true, data: apiKey });
  }

  async deleteAdmin(req: Request, res: Response): Promise<void> {
    await apiKeyService.deleteAdmin(req.params.id);
    res.json({ success: true, message: 'API key deleted successfully' });
  }

  async getStatsAdmin(req: Request, res: Response): Promise<void> {
    const { timeRange = 'month', includeDaily = false } = req.query as unknown as ApiKeyStatsQuerySchema;
    const result = await apiKeyService.getStatsAdmin(req.params.id, timeRange, includeDaily);
    res.json({ success: true, data: result });
  }
}

export const apiKeyController = new ApiKeyController();

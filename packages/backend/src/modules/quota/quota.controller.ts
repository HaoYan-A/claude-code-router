import type { Request, Response } from 'express';
import { quotaService } from './quota.service.js';

export class QuotaController {
  async getSummary(_req: Request, res: Response): Promise<void> {
    const summary = await quotaService.getSummary();
    res.json({ success: true, data: summary });
  }
}

export const quotaController = new QuotaController();

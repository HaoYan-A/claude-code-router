import type { Request, Response } from 'express';
import type { UpdateUserSchema } from '@claude-code-router/shared';
import { userService } from './user.service.js';

export class UserController {
  async getAll(req: Request, res: Response): Promise<void> {
    const { page = 1, pageSize = 20 } = req.query as { page?: number; pageSize?: number };
    const result = await userService.getAll({ page: Number(page), pageSize: Number(pageSize) });
    res.json({ success: true, data: result });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const user = await userService.getById(req.params.id);
    res.json({ success: true, data: user });
  }

  async update(req: Request, res: Response): Promise<void> {
    const user = await userService.update(req.params.id, req.body as UpdateUserSchema);
    res.json({ success: true, data: user });
  }

  async delete(req: Request, res: Response): Promise<void> {
    await userService.delete(req.params.id);
    res.json({ success: true, message: 'User deleted successfully' });
  }
}

export const userController = new UserController();

import { Router, type IRouter } from 'express';
import { quotaController } from './quota.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router: IRouter = Router();

// 需要登录，但不需要管理员权限
router.use(authMiddleware);

router.get('/summary', asyncHandler((req, res) => quotaController.getSummary(req, res)));

export { router as quotaRoutes };

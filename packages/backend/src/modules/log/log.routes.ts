import { Router, type IRouter } from 'express';
import { logFilterSchema, idParamSchema } from '@claude-code-router/shared';
import { logController } from './log.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router: IRouter = Router();

router.use(authMiddleware);

router.get(
  '/',
  validate(logFilterSchema, 'query'),
  asyncHandler((req, res) => logController.getAll(req, res))
);

router.get(
  '/stats',
  asyncHandler((req, res) => logController.getStats(req, res))
);

router.get(
  '/leaderboard',
  asyncHandler((req, res) => logController.getLeaderboard(req, res))
);

router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => logController.getById(req, res))
);

export { router as logRoutes };

import { Router, type IRouter } from 'express';
import {
  createApiKeySchema,
  updateApiKeySchema,
  paginationSchema,
  idParamSchema,
  apiKeyStatsQuerySchema,
} from '@claude-code-router/shared';
import { apiKeyController } from './api-key.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authMiddleware, adminMiddleware } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router: IRouter = Router();

router.use(authMiddleware);

// ==================== 用户路由 ====================

router.get(
  '/',
  validate(paginationSchema, 'query'),
  asyncHandler((req, res) => apiKeyController.getAll(req, res))
);

router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => apiKeyController.getById(req, res))
);

router.get(
  '/:id/stats',
  validate(idParamSchema, 'params'),
  validate(apiKeyStatsQuerySchema, 'query'),
  asyncHandler((req, res) => apiKeyController.getStats(req, res))
);

router.get(
  '/:id/key',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => apiKeyController.getFullKey(req, res))
);

router.post(
  '/',
  validate(createApiKeySchema),
  asyncHandler((req, res) => apiKeyController.create(req, res))
);

router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateApiKeySchema),
  asyncHandler((req, res) => apiKeyController.update(req, res))
);

router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => apiKeyController.delete(req, res))
);

// ==================== Admin 路由 ====================

router.get(
  '/admin/all',
  adminMiddleware,
  validate(paginationSchema, 'query'),
  asyncHandler((req, res) => apiKeyController.getAllAdmin(req, res))
);

router.get(
  '/admin/:id',
  adminMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => apiKeyController.getByIdAdmin(req, res))
);

router.get(
  '/admin/:id/stats',
  adminMiddleware,
  validate(idParamSchema, 'params'),
  validate(apiKeyStatsQuerySchema, 'query'),
  asyncHandler((req, res) => apiKeyController.getStatsAdmin(req, res))
);

router.get(
  '/admin/:id/key',
  adminMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => apiKeyController.getFullKeyAdmin(req, res))
);

router.patch(
  '/admin/:id',
  adminMiddleware,
  validate(idParamSchema, 'params'),
  validate(updateApiKeySchema),
  asyncHandler((req, res) => apiKeyController.updateAdmin(req, res))
);

router.delete(
  '/admin/:id',
  adminMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => apiKeyController.deleteAdmin(req, res))
);

export { router as apiKeyRoutes };

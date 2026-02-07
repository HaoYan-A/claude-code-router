import { Router, type IRouter } from 'express';
import {
  createAccountSchema,
  updateAccountSchema,
  accountListQuerySchema,
  oauthExchangeSchema,
  availableAccountQuerySchema,
  idParamSchema,
  importKiroAccountSchema,
  importOpenAIAccountSchema,
} from '@claude-code-router/shared';
import { accountsController } from './accounts.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authMiddleware, adminMiddleware } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router: IRouter = Router();

// 所有路由都需要认证和管理员权限
router.use(authMiddleware);
router.use(adminMiddleware);

// 获取所有平台支持的模型列表
router.get('/models', asyncHandler((req, res) => accountsController.getModels(req, res)));

// 获取指定模型的可用账号（用于调度）
router.get(
  '/available',
  validate(availableAccountQuerySchema, 'query'),
  asyncHandler((req, res) => accountsController.getAvailable(req, res))
);

// Antigravity OAuth
router.get(
  '/antigravity/oauth-url',
  asyncHandler((req, res) => accountsController.getOAuthUrl(req, res))
);

router.post(
  '/antigravity/exchange',
  validate(oauthExchangeSchema),
  asyncHandler((req, res) => accountsController.exchangeOAuthCode(req, res))
);

// Kiro 账号导入
router.post(
  '/kiro/import',
  validate(importKiroAccountSchema),
  asyncHandler((req, res) => accountsController.importKiroAccount(req, res))
);

// OpenAI 账号导入
router.post(
  '/openai/import',
  validate(importOpenAIAccountSchema),
  asyncHandler((req, res) => accountsController.importOpenAIAccount(req, res))
);

// 批量刷新所有账号额度
router.post(
  '/quota/refresh-all',
  asyncHandler((req, res) => accountsController.refreshAllQuotas(req, res))
);

// 账号 CRUD
router.get(
  '/',
  validate(accountListQuerySchema, 'query'),
  asyncHandler((req, res) => accountsController.getAll(req, res))
);

router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => accountsController.getById(req, res))
);

router.post(
  '/',
  validate(createAccountSchema),
  asyncHandler((req, res) => accountsController.create(req, res))
);

router.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateAccountSchema),
  asyncHandler((req, res) => accountsController.update(req, res))
);

router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => accountsController.delete(req, res))
);

// 额度管理
router.get(
  '/:id/quota',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => accountsController.getQuota(req, res))
);

router.post(
  '/:id/quota/refresh',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => accountsController.refreshQuota(req, res))
);

// Token 管理
router.post(
  '/:id/token/refresh',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => accountsController.refreshToken(req, res))
);

export { router as accountsRoutes };

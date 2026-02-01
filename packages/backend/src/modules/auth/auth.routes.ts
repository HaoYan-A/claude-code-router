import { Router, type IRouter } from 'express';
import { adminLoginSchema, refreshTokenSchema } from '@claude-code-router/shared';
import { authController } from './auth.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router: IRouter = Router();

// Admin login
router.post(
  '/admin/login',
  validate(adminLoginSchema),
  asyncHandler((req, res) => authController.adminLogin(req, res))
);

// GitHub OAuth
router.get(
  '/github',
  asyncHandler((req, res) => authController.githubAuth(req, res))
);

router.get(
  '/github/callback',
  asyncHandler((req, res) => authController.githubCallback(req, res))
);

// Token refresh
router.post(
  '/refresh',
  validate(refreshTokenSchema),
  asyncHandler((req, res) => authController.refresh(req, res))
);

// Logout
router.post(
  '/logout',
  authMiddleware,
  validate(refreshTokenSchema),
  asyncHandler((req, res) => authController.logout(req, res))
);

router.post(
  '/logout-all',
  authMiddleware,
  asyncHandler((req, res) => authController.logoutAll(req, res))
);

// Get current user
router.get(
  '/me',
  authMiddleware,
  asyncHandler((req, res) => authController.me(req, res))
);

export { router as authRoutes };

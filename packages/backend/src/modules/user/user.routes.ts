import { Router, type IRouter } from 'express';
import {
  updateUserSchema,
  paginationSchema,
  idParamSchema,
} from '@claude-code-router/shared';
import { userController } from './user.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { authMiddleware, adminMiddleware } from '../../middlewares/auth.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router: IRouter = Router();

router.use(authMiddleware);

router.get(
  '/',
  adminMiddleware,
  validate(paginationSchema, 'query'),
  asyncHandler((req, res) => userController.getAll(req, res))
);

router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => userController.getById(req, res))
);

router.patch(
  '/:id',
  adminMiddleware,
  validate(idParamSchema, 'params'),
  validate(updateUserSchema),
  asyncHandler((req, res) => userController.update(req, res))
);

router.delete(
  '/:id',
  adminMiddleware,
  validate(idParamSchema, 'params'),
  asyncHandler((req, res) => userController.delete(req, res))
);

export { router as userRoutes };

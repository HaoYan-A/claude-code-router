import { Router, type IRouter } from 'express';
import { proxyController } from './proxy.controller.js';
import { proxyAuthMiddleware } from './proxy.middleware.js';
import { asyncHandler } from '../../utils/async-handler.js';

const router: IRouter = Router();

router.use(asyncHandler(proxyAuthMiddleware));

router.all(
  '*',
  asyncHandler((req, res) => proxyController.handleProxy(req, res))
);

export { router as proxyRoutes };

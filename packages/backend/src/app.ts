import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { fileURLToPath } from 'url';
import { API_PREFIX } from '@claude-code-router/shared';
import { logger } from './lib/logger.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { generateOpenAPIDocument } from './docs/openapi.js';
import { authRoutes } from './modules/auth/index.js';
import { userRoutes } from './modules/user/index.js';
import { apiKeyRoutes } from './modules/api-key/index.js';
import { logRoutes } from './modules/log/index.js';
import { proxyRoutes } from './modules/proxy/index.js';
import { accountsRoutes } from './modules/accounts/index.js';
import { quotaRoutes } from './modules/quota/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      // 在 HTTP 环境下禁用某些安全头
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false,
      // 不强制 HTTPS
      hsts: false,
    })
  );
  app.use(cors());

  // Request logging
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/health',
      },
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API documentation
  const openApiDoc = generateOpenAPIDocument();
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc));
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiDoc);
  });

  // API routes
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/users`, userRoutes);
  app.use(`${API_PREFIX}/api-keys`, apiKeyRoutes);
  app.use(`${API_PREFIX}/logs`, logRoutes);
  app.use(`${API_PREFIX}/accounts`, accountsRoutes);
  app.use(`${API_PREFIX}/quota`, quotaRoutes);

  // Proxy routes (mounted at root for Claude API compatibility)
  app.use('/proxy', proxyRoutes);

  // 静态文件托管（生产环境）
  const publicPath = path.join(__dirname, '../public');
  app.use(express.static(publicPath));

  // SPA fallback - 所有非 API/proxy 路由返回 index.html
  app.get('*', (req, res, next) => {
    // 跳过 API 和 proxy 路由
    if (req.path.startsWith('/api/') || req.path.startsWith('/proxy') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(publicPath, 'index.html'), (err) => {
      if (err) {
        // 如果 index.html 不存在（开发环境），继续下一个中间件
        next();
      }
    });
  });

  // Error handling
  app.use(errorHandler);

  return app;
}

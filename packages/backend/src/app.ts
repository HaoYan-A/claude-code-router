import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
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

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
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

  // Proxy routes (mounted at root for Claude API compatibility)
  app.use('/proxy', proxyRoutes);

  // Error handling
  app.use(errorHandler);

  return app;
}

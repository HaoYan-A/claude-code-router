import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/prisma.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './lib/scheduler.js';
import { initUpstreamClient, getUpstreamClient } from './lib/upstream-client.js';

async function main() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected');

    // Initialize upstream client with TLS fingerprint
    const proxyUrl = env.THIRD_PARTY_PROXY_ENABLED ? env.THIRD_PARTY_PROXY_URL : undefined;
    initUpstreamClient({
      proxyUrl,
      tlsEnabled: env.TLS_FINGERPRINT_ENABLED,
      tlsProfile: env.TLS_FINGERPRINT_PROFILE,
      customUserAgent: env.CUSTOM_USER_AGENT,
    });

    // Create and start Express app
    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
      logger.info(`API docs available at http://localhost:${env.PORT}/api/docs`);

      // 显示代理和 TLS 状态
      if (env.THIRD_PARTY_PROXY_ENABLED && proxyUrl) {
        logger.info({ proxyUrl }, '✓ Third-party proxy ENABLED');
      } else {
        logger.info('✗ Third-party proxy disabled');
      }

      if (env.TLS_FINGERPRINT_ENABLED) {
        logger.info({ profile: env.TLS_FINGERPRINT_PROFILE }, '✓ TLS fingerprint ENABLED');
      } else {
        logger.info('✗ TLS fingerprint disabled');
      }

      startScheduler();
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);

      stopScheduler();

      server.close(async () => {
        logger.info('HTTP server closed');

        // Destroy upstream TLS client
        await getUpstreamClient().destroy();
        logger.info('Upstream client destroyed');

        await disconnectDatabase();
        logger.info('Database disconnected');

        await disconnectRedis();
        logger.info('Redis disconnected');

        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/prisma.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { createApp } from './app.js';

async function main() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected');

    // Create and start Express app
    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
      logger.info(`API docs available at http://localhost:${env.PORT}/api/docs`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);

      server.close(async () => {
        logger.info('HTTP server closed');

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

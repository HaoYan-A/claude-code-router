import pino from 'pino';
import { env } from '../config/env.js';
import path from 'path';
import fs from 'fs';

// 确保日志目录存在
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');

// 开发环境：同时输出到控制台（美化）和文件
// 生产环境：输出到文件
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV === 'development'
      ? {
          targets: [
            // 控制台输出（美化）
            {
              target: 'pino-pretty',
              level: 'debug',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
            // 文件输出（JSON 格式）
            {
              target: 'pino/file',
              level: 'debug',
              options: {
                destination: logFile,
                mkdir: true,
              },
            },
          ],
        }
      : {
          target: 'pino/file',
          options: {
            destination: logFile,
            mkdir: true,
          },
        },
});

export type Logger = typeof logger;

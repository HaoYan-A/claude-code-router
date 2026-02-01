/**
 * 日志批量写入缓冲区
 *
 * 将日志更新操作缓存到内存队列，定时批量写入数据库
 * - 减少数据库连接开销
 * - 提高吞吐量
 */

import type { RequestStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

// 批量写入配置
const FLUSH_INTERVAL_MS = 5000; // 5 秒
const MAX_BUFFER_SIZE = 100; // 达到此数量立即刷新

export interface LogUpdateData {
  id: string;
  status?: RequestStatus;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  targetModel?: string;
  platform?: string;
  accountId?: string;

  // 下游响应
  upstreamResponseHeaders?: string;
  upstreamResponseBody?: string;

  // 客户端响应头
  clientResponseHeaders?: string;

  // 缓存 Token (映射后)
  cacheReadTokens?: number;
  cacheCreationTokens?: number;

  // 原始 Token (Google 返回)
  rawInputTokens?: number;
  rawOutputTokens?: number;
  rawCacheTokens?: number;
}

class LogBuffer {
  private buffer: LogUpdateData[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor() {
    this.startFlushTimer();
  }

  /**
   * 添加日志更新到缓冲区
   */
  add(data: LogUpdateData): void {
    this.buffer.push(data);

    // 达到最大数量立即刷新
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  /**
   * 启动定时刷新
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);

    // 确保进程退出时刷新剩余日志
    process.on('beforeExit', () => this.flush());
    process.on('SIGINT', () => {
      this.flush();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.flush();
      process.exit(0);
    });
  }

  /**
   * 刷新缓冲区，批量写入数据库
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;

    // 取出当前缓冲区的所有数据
    const batch = this.buffer.splice(0, this.buffer.length);

    try {
      // 使用事务批量更新
      await prisma.$transaction(
        batch.map((data) => {
          const { id, ...updateData } = data;
          return prisma.requestLog.update({
            where: { id },
            data: updateData,
          });
        })
      );

      logger.debug({ count: batch.length }, 'Flushed log buffer');
    } catch (error) {
      logger.error({ error, count: batch.length }, 'Failed to flush log buffer');

      // 失败时尝试逐条写入
      for (const data of batch) {
        try {
          const { id, ...updateData } = data;
          await prisma.requestLog.update({
            where: { id },
            data: updateData,
          });
        } catch (innerError) {
          logger.error({ error: innerError, logId: data.id }, 'Failed to update single log');
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * 获取当前缓冲区大小
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * 停止定时器（用于测试或关闭）
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

// 单例导出
export const logBuffer = new LogBuffer();

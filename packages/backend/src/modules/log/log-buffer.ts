/**
 * 日志批量写入缓冲区
 *
 * 将日志更新操作缓存到内存队列，定时批量写入数据库
 * - 减少数据库连接开销
 * - 提高吞吐量
 * - 自动计算费用
 * - 同步更新 API Key 日度聚合
 */

import type { RequestStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { calculateCost } from '../../lib/cost-calculator.js';
import { apiKeyUsageRepository } from '../api-key/api-key-usage.repository.js';

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

  // 费用（自动计算）
  cost?: number;

  // API Key ID（用于日度聚合）
  apiKeyId?: string;
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
   *
   * 如果有 token 数据和目标模型，会自动计算费用
   */
  add(data: LogUpdateData): void {
    // 自动计算费用（如果有 token 数据）
    if (data.targetModel && data.inputTokens !== undefined && data.cost === undefined) {
      data.cost = calculateCost({
        targetModel: data.targetModel,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens || 0,
        cacheReadTokens: data.cacheReadTokens,
        cacheCreationTokens: data.cacheCreationTokens,
      });
    }

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
          const { id, apiKeyId, ...updateData } = data;
          return prisma.requestLog.update({
            where: { id },
            data: updateData,
          });
        })
      );

      logger.debug({ count: batch.length }, 'Flushed log buffer');

      // 成功写入后，更新 API Key 日度聚合（异步执行，不阻塞）
      this.updateDailyUsage(batch).catch((err) =>
        logger.error({ err }, 'Failed to update daily usage')
      );
    } catch (error) {
      // 记录详细错误信息
      const errorDetail = error instanceof Error ? {
        name: error.name,
        message: error.message,
      } : error;
      logger.error({ error: errorDetail, count: batch.length }, 'Failed to flush log buffer');

      // 失败时尝试逐条写入
      for (const data of batch) {
        try {
          const { id, apiKeyId, ...updateData } = data;
          await prisma.requestLog.update({
            where: { id },
            data: updateData,
          });
        } catch (innerError) {
          const innerErrorDetail = innerError instanceof Error ? {
            name: innerError.name,
            message: innerError.message,
          } : innerError;
          logger.error({ error: innerErrorDetail, logId: data.id }, 'Failed to update single log');
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * 更新 API Key 日度聚合
   */
  private async updateDailyUsage(batch: LogUpdateData[]): Promise<void> {
    for (const data of batch) {
      // 只处理成功的请求且有费用数据
      if (
        data.status === 'success' &&
        data.apiKeyId &&
        data.targetModel &&
        data.cost !== undefined &&
        data.cost > 0
      ) {
        try {
          await apiKeyUsageRepository.incrementDailyUsage(
            data.apiKeyId,
            data.targetModel,
            data.inputTokens || 0,
            data.outputTokens || 0,
            data.cost
          );
        } catch (err) {
          logger.error(
            { err, apiKeyId: data.apiKeyId, model: data.targetModel },
            'Failed to increment daily usage'
          );
        }
      }
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

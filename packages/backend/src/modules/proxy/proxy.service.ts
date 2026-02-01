/**
 * 代理服务
 *
 * 核心流程：
 * 1. 收到 Claude API 请求
 * 2. 从请求体提取模型 slot (opus/sonnet/haiku)
 * 3. 根据 API Key 的 ModelMapping 找到映射
 * 4. 选择可用的 ThirdPartyAccount
 * 5. 转换请求格式并转发到 Antigravity API
 * 6. 转换响应格式返回给客户端
 * 7. 记录日志
 */

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../lib/logger.js';
import { logRepository } from '../log/log.repository.js';
import { logBuffer } from '../log/log-buffer.js';
import { apiKeyRepository } from '../api-key/api-key.repository.js';
import { accountSelector } from './account-selector.js';
import {
  convertClaudeToGemini,
  extractModelSlot,
} from './channels/antigravity/converter.js';
import {
  handleSSEStream,
  transformNonStreamingResponse,
} from './channels/antigravity/handler.js';
import {
  ANTIGRAVITY_ENDPOINTS,
  STREAM_PATH,
  NON_STREAM_PATH,
} from './channels/antigravity/models.js';
import type { ClaudeRequest, ProxyContext, ModelSlot } from './types.js';

// 最大重试次数
const MAX_RETRIES = 2;

// User-Agent (版本号需要 >= 1.15.8)
const USER_AGENT = 'antigravity/1.15.8 darwin/arm64';

// Anthropic Beta 功能
const ANTHROPIC_BETA = 'interleaved-thinking-2025-01-24,claude-code-2025-01-24';

export interface ProxyRequestOptions {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  userId: string;
  apiKeyId: string;
  clientIp?: string;
  userAgent?: string;
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'authorization' || lowerKey === 'x-api-key') {
      sanitized[key] = value.substring(0, 10) + '...[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export class ProxyService {
  async proxyRequest(options: ProxyRequestOptions, res: Response): Promise<void> {
    const { method, path, body, userId, apiKeyId, clientIp, userAgent } = options;
    const startTime = Date.now();

    // 只处理 /v1/messages 路径
    if (path !== '/v1/messages' || method !== 'POST') {
      res.status(400).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_PATH',
          message: `Only POST /v1/messages is supported, got ${method} ${path}`,
        },
      });
      return;
    }

    const claudeReq = body as ClaudeRequest;
    if (!claudeReq.model || !claudeReq.messages) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required fields: model, messages',
        },
      });
      return;
    }

    // 创建日志记录（包含脱敏的客户端请求头）
    const log = await logRepository.create({
      userId,
      apiKeyId,
      method,
      path,
      clientIp,
      userAgent,
      requestBody: JSON.stringify(claudeReq),
      model: claudeReq.model,
      clientHeaders: JSON.stringify(sanitizeHeaders(options.headers)),
    });

    try {
      // 1. 提取模型 slot
      const modelSlot = extractModelSlot(claudeReq.model);

      // 2. 获取模型映射
      const mapping = await this.getModelMapping(apiKeyId, modelSlot);
      if (!mapping) {
        throw new ProxyError(
          400,
          'MODEL_MAPPING_NOT_FOUND',
          `No mapping found for model slot: ${modelSlot}`
        );
      }

      // 3. 选择账号
      const account = await accountSelector.selectAccount(mapping.targetModel);
      if (!account) {
        throw new ProxyError(
          503,
          'NO_AVAILABLE_ACCOUNT',
          `No available account for model: ${mapping.targetModel}`
        );
      }

      // 4. 构建代理上下文
      const context: ProxyContext = {
        userId,
        apiKeyId,
        clientIp,
        userAgent,
        originalModel: claudeReq.model,
        modelSlot,
        targetModel: mapping.targetModel,
        platform: mapping.platform,
        accountId: account.id,
        accessToken: account.accessToken,
        projectId: account.projectId,
        sessionId: this.extractSessionId(claudeReq),
        messageCount: claudeReq.messages.length,
        logId: log.id,
        startTime,
      };

      // 5. 执行代理请求（带重试）
      await this.executeWithRetry(claudeReq, context, res);
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error instanceof ProxyError) {
        logger.error(
          { error, code: error.code, logId: log.id },
          'Proxy request failed'
        );

        // 先返回错误响应（包含请求 ID 头）
        res.setHeader('X-Request-Id', log.id);
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });

        // 添加到日志缓冲区（批量写入）
        logBuffer.add({
          id: log.id,
          status: 'error',
          statusCode: error.statusCode,
          errorMessage: error.message,
          durationMs,
        });
      } else {
        logger.error({ error, logId: log.id }, 'Unexpected proxy error');

        // 先返回错误响应（包含请求 ID 头）
        res.setHeader('X-Request-Id', log.id);
        res.status(500).json({
          success: false,
          error: {
            code: 'PROXY_ERROR',
            message: 'Failed to proxy request',
          },
        });

        // 添加到日志缓冲区（批量写入）
        logBuffer.add({
          id: log.id,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs,
        });
      }
    }
  }

  /**
   * 带重试的代理执行
   */
  private async executeWithRetry(
    claudeReq: ClaudeRequest,
    context: ProxyContext,
    res: Response
  ): Promise<void> {
    let lastError: Error | null = null;
    let currentAccount = {
      id: context.accountId,
      accessToken: context.accessToken,
      projectId: context.projectId,
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const isRetry = attempt > 0;

      if (isRetry) {
        logger.info(
          { attempt, accountId: currentAccount.id },
          'Retrying proxy request'
        );

        // 尝试选择新账号
        const newAccount = await accountSelector.selectAccount(context.targetModel);
        if (newAccount && newAccount.id !== currentAccount.id) {
          currentAccount = newAccount;
          logger.info(
            { newAccountId: newAccount.id },
            'Switched to new account for retry'
          );
        }
      }

      try {
        await this.executeProxy(
          claudeReq,
          { ...context, ...currentAccount },
          res,
          isRetry
        );
        return; // 成功则返回
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // 判断是否可重试
        if (error instanceof ProxyError) {
          const canRetry = await accountSelector.handleRequestFailure(
            currentAccount.id,
            error.statusCode,
            error.message
          );

          if (!canRetry || attempt >= MAX_RETRIES) {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * 执行单次代理请求
   */
  private async executeProxy(
    claudeReq: ClaudeRequest,
    context: ProxyContext & { accessToken: string; projectId: string },
    res: Response,
    isRetry: boolean
  ): Promise<void> {
    const isStream = claudeReq.stream === true;

    // 转换请求
    const { body: geminiBody, isThinkingEnabled, messageCount } = await convertClaudeToGemini(
      claudeReq,
      context.targetModel,
      {
        projectId: context.projectId,
        sessionId: context.sessionId,
        isRetry,
      }
    );

    // 构建 URL
    const endpoint = ANTIGRAVITY_ENDPOINTS[0];
    const path = isStream ? STREAM_PATH : NON_STREAM_PATH;
    const url = `${endpoint}${path}`;

    // 构建上游请求头（用于日志记录，脱敏处理）
    const upstreamHeaders: Record<string, string> = {
      Host: 'daily-cloudcode-pa.sandbox.googleapis.com',
      'X-App': 'cli',
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${context.accessToken}`,
      'Anthropic-Beta': ANTHROPIC_BETA,
      'X-Stainless-Lang': 'python',
      'X-Stainless-Runtime': 'CPython',
      'X-Stainless-Package-Version': '0.43.0',
      'X-Stainless-Runtime-Version': '3.11.0',
    };

    // 记录上游请求数据（异步，不阻塞请求）
    // 上游请求头完整记录（包含 accessToken），用于问题排查
    const upstreamRequestHeadersStr = JSON.stringify(upstreamHeaders);
    const upstreamRequestBodyStr = JSON.stringify(geminiBody);

    // 更新日志记录，保存上游请求数据
    logRepository.update(context.logId, {
      upstreamRequestHeaders: upstreamRequestHeadersStr,
      upstreamRequestBody: upstreamRequestBodyStr,
    }).catch((err) => logger.error({ err, logId: context.logId }, 'Failed to update upstream request data'));

    logger.debug(
      {
        url,
        targetModel: context.targetModel,
        isStream,
        isThinkingEnabled,
        messageCount,
      },
      'Sending request to Antigravity'
    );

    // 发送请求
    const response = await fetch(url, {
      method: 'POST',
      headers: upstreamHeaders,
      body: upstreamRequestBodyStr,
    });

    // 收集上游响应头
    const upstreamResponseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      upstreamResponseHeaders[key] = value;
    });

    // 处理错误响应
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        {
          statusCode: response.status,
          errorBody,
          accountId: context.accountId,
          url,
          targetModel: context.targetModel,
        },
        'Antigravity API error'
      );

      throw new ProxyError(
        response.status,
        'UPSTREAM_ERROR',
        `Antigravity API error: ${response.status} - ${errorBody.substring(0, 200)}`
      );
    }

    // 处理响应
    const durationMs = Date.now() - context.startTime;

    if (isStream && response.body) {
      // 流式响应 - 先设置请求 ID 头
      res.setHeader('X-Request-Id', context.logId);

      const result = await handleSSEStream(
        response.body,
        res,
        {
          sessionId: context.sessionId,
          modelName: context.targetModel,
          messageCount,
          scalingEnabled: false,
          contextLimit: 1_048_576,
        }
      );

      // 添加到日志缓冲区（批量写入，包含完整的请求响应数据）
      logBuffer.add({
        id: context.logId,
        status: 'success',
        statusCode: 200,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
        targetModel: context.targetModel,
        platform: context.platform,
        accountId: context.accountId,
        // 上游请求数据（在创建日志时已记录 clientHeaders）
        upstreamResponseHeaders: JSON.stringify(upstreamResponseHeaders),
        upstreamResponseBody: result.upstreamResponseBody,
        // 客户端响应
        clientResponseHeaders: JSON.stringify({ 'Content-Type': 'text/event-stream' }),
        responseBody: result.clientResponseBody,
        // 缓存 Token (映射后)
        cacheReadTokens: result.cacheReadTokens,
        cacheCreationTokens: 0,
        // 原始 Token (用于对账)
        rawInputTokens: result.rawInputTokens,
        rawOutputTokens: result.rawOutputTokens,
        rawCacheTokens: result.rawCacheTokens,
      });

      // 异步更新账号统计
      accountSelector.updateUsageStats(context.accountId, result.inputTokens, result.outputTokens)
        .catch((err) => logger.error({ err, accountId: context.accountId }, 'Failed to update account stats'));
    } else {
      // 非流式响应
      const geminiResponseText = await response.text();
      const geminiResponse = JSON.parse(geminiResponseText);
      const claudeResponse = await transformNonStreamingResponse(geminiResponse, {
        sessionId: context.sessionId,
        modelName: context.targetModel,
        messageCount,
        scalingEnabled: false,
        contextLimit: 1_048_576,
      });

      // 先返回响应给客户端（包含请求 ID 头）
      res.setHeader('X-Request-Id', context.logId);
      res.json(claudeResponse);

      // 提取原始 Token
      const rawUsage = geminiResponse.usageMetadata || {};
      const rawInputTokens = rawUsage.promptTokenCount || 0;
      const rawOutputTokens = rawUsage.candidatesTokenCount || 0;
      const rawCacheTokens = rawUsage.cachedContentTokenCount || 0;

      // 添加到日志缓冲区（批量写入，包含完整的请求响应数据）
      logBuffer.add({
        id: context.logId,
        status: 'success',
        statusCode: 200,
        responseBody: JSON.stringify(claudeResponse),
        inputTokens: claudeResponse.usage.input_tokens,
        outputTokens: claudeResponse.usage.output_tokens,
        durationMs,
        targetModel: context.targetModel,
        platform: context.platform,
        accountId: context.accountId,
        // 上游响应数据
        upstreamResponseHeaders: JSON.stringify(upstreamResponseHeaders),
        upstreamResponseBody: geminiResponseText,
        // 客户端响应
        clientResponseHeaders: JSON.stringify({ 'Content-Type': 'application/json' }),
        // 缓存 Token (映射后)
        cacheReadTokens: claudeResponse.usage.cache_read_input_tokens || 0,
        cacheCreationTokens: 0,
        // 原始 Token (用于对账)
        rawInputTokens,
        rawOutputTokens,
        rawCacheTokens,
      });

      // 异步更新账号统计
      accountSelector.updateUsageStats(
        context.accountId,
        claudeResponse.usage.input_tokens,
        claudeResponse.usage.output_tokens
      ).catch((err) => logger.error({ err, accountId: context.accountId }, 'Failed to update account stats'));
    }
  }

  /**
   * 获取模型映射
   */
  private async getModelMapping(
    apiKeyId: string,
    modelSlot: ModelSlot
  ): Promise<{ platform: string; targetModel: string } | null> {
    const mappings = await apiKeyRepository.getModelMappings(apiKeyId);
    const mapping = mappings.find((m) => m.claudeModel === modelSlot);

    if (!mapping) {
      return null;
    }

    return {
      platform: mapping.platform,
      targetModel: mapping.targetModel,
    };
  }

  /**
   * 从请求中提取 session ID
   */
  private extractSessionId(req: ClaudeRequest): string {
    // 优先使用 metadata.user_id
    if (req.metadata?.user_id) {
      return req.metadata.user_id;
    }

    // 否则生成新的
    return `session-${uuidv4()}`;
  }
}

/**
 * 代理错误类
 */
class ProxyError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ProxyError';
  }
}

export const proxyService = new ProxyService();

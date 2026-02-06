/**
 * 代理服务
 *
 * 核心流程：
 * 1. 收到 Claude API 请求
 * 2. 从请求体提取模型 slot (opus/sonnet/haiku)
 * 3. 根据 API Key 的 ModelMapping 找到映射
 * 4. 选择可用的 ThirdPartyAccount
 * 5. 根据平台类型选择 channel (Antigravity/Kiro)
 * 6. 转换请求格式并转发
 * 7. 转换响应格式返回给客户端
 * 8. 记录日志
 */

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../lib/logger.js';
import { logRepository } from '../log/log.repository.js';
import { logBuffer } from '../log/log-buffer.js';
import { apiKeyRepository } from '../api-key/api-key.repository.js';
import { accountSelector } from './account-selector.js';
import { getProxyAgent } from '../../lib/proxy-agent.js';
// Antigravity channel
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
// Kiro channel
import {
  convertClaudeToKiro,
  handleKiroSSEStream,
  transformKiroResponse,
  getKiroEndpoint,
  KIRO_GENERATE_PATH,
} from './channels/kiro/index.js';
import { getKiroHeaders } from '../accounts/platforms/kiro.service.js';
import type { ClaudeRequest, ProxyContext, ModelSlot, MessageContent, SystemPrompt } from './types.js';
import type { SelectedAccount } from './types.js';

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

function extractSystemText(system?: SystemPrompt): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  return system
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');
}

function extractTextFromContent(content: MessageContent): string {
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      parts.push(block.text);
      continue;
    }
    if (block.type === 'tool_result') {
      const toolContent = (block.content ?? '') as unknown;
      if (typeof toolContent === 'string') {
        parts.push(toolContent);
      } else if (Array.isArray(toolContent)) {
        const text = toolContent
          .map((item: unknown) => {
            if (typeof item === 'object' && item !== null) {
              const typedItem = item as { type?: string; text?: string };
              if (typedItem.type === 'text' && typedItem.text) {
                return typedItem.text;
              }
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');
        if (text) parts.push(text);
      }
      continue;
    }
    if (block.type === 'tool_use') {
      const inputText = typeof block.input === 'string'
        ? block.input
        : JSON.stringify(block.input ?? {});
      if (inputText) parts.push(inputText);
      continue;
    }
  }
  return parts.join('\n');
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

    // 用于在错误处理时记录 targetModel 和 accountId（即使后续步骤失败也能获取）
    let resolvedTargetModel: string | undefined;
    let resolvedAccountId: string | undefined;

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
      // 保存 targetModel 以便在错误处理时使用
      resolvedTargetModel = mapping.targetModel;

      // 3. 选择账号
      const account = await accountSelector.selectAccount(mapping.targetModel);
      if (!account) {
        throw new ProxyError(
          503,
          'NO_AVAILABLE_ACCOUNT',
          `No available account for model: ${mapping.targetModel}`
        );
      }
      resolvedAccountId = account.id;

      // 4. 构建代理上下文
      const context: ProxyContext = {
        userId,
        apiKeyId,
        clientIp,
        userAgent,
        originalModel: claudeReq.model,
        modelSlot,
        targetModel: mapping.targetModel,
        platform: account.platform, // 使用账号的 platform
        accountId: account.id,
        accessToken: account.accessToken,
        projectId: account.projectId,
        sessionId: this.extractSessionId(claudeReq),
        messageCount: claudeReq.messages.length,
        logId: log.id,
        startTime,
      };

      // 5. 执行代理请求（带重试）
      await this.executeWithRetry(claudeReq, context, res, account);
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
          targetModel: resolvedTargetModel,
          accountId: error.accountId,
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
          statusCode: 500,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          durationMs,
          targetModel: resolvedTargetModel,
          accountId: resolvedAccountId,
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
    res: Response,
    initialAccount: SelectedAccount
  ): Promise<void> {
    let currentAccount = initialAccount;
    const triedAccountIds = new Set<string>([initialAccount.id]);
    let retryCount = 0;

    while (true) {
      try {
        // 根据平台类型选择不同的执行方法
        if (currentAccount.platform === 'kiro') {
          await this.executeKiroProxy(
            claudeReq,
            { ...context, platform: 'kiro', accountId: currentAccount.id, accessToken: currentAccount.accessToken, projectId: currentAccount.projectId },
            res,
            currentAccount
          );
        } else {
          await this.executeAntigravityProxy(
            claudeReq,
            { ...context, platform: 'antigravity', accountId: currentAccount.id, accessToken: currentAccount.accessToken, projectId: currentAccount.projectId },
            res,
            retryCount > 0
          );
        }
        return; // 成功则返回
      } catch (error) {
        // 判断是否可重试
        if (error instanceof ProxyError) {
          const canRetry = await accountSelector.handleRequestFailure(
            currentAccount.id,
            error.statusCode,
            error.message,
            context.targetModel
          );

          if (!canRetry) {
            throw error.withAccountId(currentAccount.id);
          }

          const allowRetryAll = error.statusCode === 429;
          if (!allowRetryAll && retryCount >= MAX_RETRIES) {
            throw error.withAccountId(currentAccount.id);
          }

          // 选择下一个账号（排除已尝试）
          const nextAccount = await accountSelector.selectAccountWithOptions(
            context.targetModel,
            { excludeIds: Array.from(triedAccountIds) }
          );
          if (!nextAccount) {
            throw error.withAccountId(currentAccount.id);
          }
          currentAccount = nextAccount;
          triedAccountIds.add(nextAccount.id);
          if (!allowRetryAll) {
            retryCount += 1;
          }
          logger.info(
            { newAccountId: nextAccount.id, platform: nextAccount.platform },
            'Switched to new account for retry'
          );
          continue;
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * 执行 Antigravity 平台代理请求
   */
  private async executeAntigravityProxy(
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

    // 构建上游请求头
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

    const upstreamRequestHeadersStr = JSON.stringify(upstreamHeaders);
    const upstreamRequestBodyStr = JSON.stringify(geminiBody);

    // 更新日志记录
    logRepository.update(context.logId, {
      upstreamRequestHeaders: upstreamRequestHeadersStr,
      upstreamRequestBody: upstreamRequestBodyStr,
    }).catch((err) => logger.error({ err, logId: context.logId }, 'Failed to update upstream request data'));

    logger.debug(
      {
        url,
        platform: 'antigravity',
        targetModel: context.targetModel,
        isStream,
        isThinkingEnabled,
        messageCount,
      },
      'Sending request to Antigravity'
    );

    // 发送请求
    const proxyAgent = getProxyAgent();
    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      method: 'POST',
      headers: upstreamHeaders,
      body: upstreamRequestBodyStr,
    };
    if (proxyAgent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchOptions.dispatcher = proxyAgent as any;
    }
    const response = await fetch(url, fetchOptions);

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
        upstreamResponseHeaders: JSON.stringify(upstreamResponseHeaders),
        upstreamResponseBody: result.upstreamResponseBody,
        clientResponseHeaders: JSON.stringify({ 'Content-Type': 'text/event-stream' }),
        responseBody: result.clientResponseBody,
        cacheReadTokens: result.cacheReadTokens,
        cacheCreationTokens: 0,
        rawInputTokens: result.rawInputTokens,
        rawOutputTokens: result.rawOutputTokens,
        rawCacheTokens: result.rawCacheTokens,
        apiKeyId: context.apiKeyId,
      });

      accountSelector.updateUsageStats(
        context.accountId,
        result.inputTokens,
        result.outputTokens,
        result.cacheReadTokens || 0
      ).catch((err) => logger.error({ err, accountId: context.accountId }, 'Failed to update account stats'));
    } else {
      const geminiResponseText = await response.text();
      const geminiResponse = JSON.parse(geminiResponseText);
      const claudeResponse = await transformNonStreamingResponse(geminiResponse, {
        sessionId: context.sessionId,
        modelName: context.targetModel,
        messageCount,
        scalingEnabled: false,
        contextLimit: 1_048_576,
      });

      res.setHeader('X-Request-Id', context.logId);
      res.json(claudeResponse);

      const rawUsage = geminiResponse.usageMetadata || {};
      const rawInputTokens = rawUsage.promptTokenCount || 0;
      const rawOutputTokens = rawUsage.candidatesTokenCount || 0;
      const rawCacheTokens = rawUsage.cachedContentTokenCount || 0;

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
        upstreamResponseHeaders: JSON.stringify(upstreamResponseHeaders),
        upstreamResponseBody: geminiResponseText,
        clientResponseHeaders: JSON.stringify({ 'Content-Type': 'application/json' }),
        cacheReadTokens: claudeResponse.usage.cache_read_input_tokens || 0,
        cacheCreationTokens: 0,
        rawInputTokens,
        rawOutputTokens,
        rawCacheTokens,
        apiKeyId: context.apiKeyId,
      });

      accountSelector.updateUsageStats(
        context.accountId,
        claudeResponse.usage.input_tokens,
        claudeResponse.usage.output_tokens,
        claudeResponse.usage.cache_read_input_tokens || 0
      ).catch((err) => logger.error({ err, accountId: context.accountId }, 'Failed to update account stats'));
    }
  }

  /**
   * 执行 Kiro 平台代理请求
   */
  private async executeKiroProxy(
    claudeReq: ClaudeRequest,
    context: ProxyContext & { accessToken: string; projectId: string },
    res: Response,
    account: SelectedAccount
  ): Promise<void> {
    const isStream = claudeReq.stream === true;
    const region = account.kiroRegion || 'us-east-1';
    const inputTokens = this.estimateInputTokens(claudeReq);

    // 转换请求
    const { body: kiroBody, kiroModelId } = convertClaudeToKiro(claudeReq, {
      conversationId: context.sessionId,
      enableThinking: true,  // 始终启用 thinking
    });

    // 构建 URL
    const endpoint = getKiroEndpoint(region);
    const url = `${endpoint}${KIRO_GENERATE_PATH}`;

    // 构建上游请求头
    const upstreamHeaders = getKiroHeaders(context.accessToken);

    const upstreamRequestHeadersStr = JSON.stringify(upstreamHeaders);
    const upstreamRequestBodyStr = JSON.stringify(kiroBody);

    // 更新日志记录
    logRepository.update(context.logId, {
      upstreamRequestHeaders: upstreamRequestHeadersStr,
      upstreamRequestBody: upstreamRequestBodyStr,
    }).catch((err) => logger.error({ err, logId: context.logId }, 'Failed to update upstream request data'));

    logger.info(
      {
        url,
        platform: 'kiro',
        region,
        kiroModelId,
        isStream,
        messageCount: context.messageCount,
        requestBodyPreview: upstreamRequestBodyStr.substring(0, 1000),
      },
      'Sending request to Kiro'
    );

    // 发送请求
    const proxyAgent = getProxyAgent();
    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      method: 'POST',
      headers: upstreamHeaders,
      body: upstreamRequestBodyStr,
    };
    if (proxyAgent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchOptions.dispatcher = proxyAgent as any;
    }
    const response = await fetch(url, fetchOptions);

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
          kiroModelId,
          fullRequestBody: upstreamRequestBodyStr, // 添加完整请求体便于调试
        },
        'Kiro API error'
      );

      throw new ProxyError(
        response.status,
        'UPSTREAM_ERROR',
        `Kiro API error: ${response.status} - ${errorBody.substring(0, 200)}`
      );
    }

    // 处理响应
    const durationMs = Date.now() - context.startTime;

    if (isStream && response.body) {
      res.setHeader('X-Request-Id', context.logId);

      const result = await handleKiroSSEStream(
        response.body,
        res,
        {
          sessionId: context.sessionId,
          modelName: kiroModelId,
          messageCount: context.messageCount,
          inputTokens,
        }
      );

      // Kiro 返回的是 AWS 二进制 SSE 格式，包含 null 字节，需要转为 base64 存储
      const sanitizedUpstreamBody = result.upstreamResponseBody
        ? `base64:${Buffer.from(result.upstreamResponseBody).toString('base64')}`
        : undefined;

      logBuffer.add({
        id: context.logId,
        status: 'success',
        statusCode: 200,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
        targetModel: kiroModelId,
        platform: 'kiro',
        accountId: context.accountId,
        upstreamResponseHeaders: JSON.stringify(upstreamResponseHeaders),
        upstreamResponseBody: sanitizedUpstreamBody,
        clientResponseHeaders: JSON.stringify({ 'Content-Type': 'text/event-stream' }),
        responseBody: result.clientResponseBody,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        rawInputTokens: result.inputTokens,
        rawOutputTokens: result.outputTokens,
        rawCacheTokens: 0,
        apiKeyId: context.apiKeyId,
      });

      accountSelector.updateUsageStats(
        context.accountId,
        result.inputTokens,
        result.outputTokens,
        0
      ).catch((err) => logger.error({ err, accountId: context.accountId }, 'Failed to update account stats'));
    } else {
      // 非流式响应
      const kiroResponseText = await response.text();
      const claudeResponse = await transformKiroResponse(kiroResponseText, {
        sessionId: context.sessionId,
        modelName: kiroModelId,
        messageCount: context.messageCount,
        inputTokens,
      });

      res.setHeader('X-Request-Id', context.logId);
      res.json(claudeResponse);

      // Kiro 返回的是 AWS 二进制 SSE 格式，包含 null 字节，需要转为 base64 存储
      const sanitizedKiroResponse = kiroResponseText
        ? `base64:${Buffer.from(kiroResponseText).toString('base64')}`
        : undefined;

      logBuffer.add({
        id: context.logId,
        status: 'success',
        statusCode: 200,
        responseBody: JSON.stringify(claudeResponse),
        inputTokens: claudeResponse.usage.input_tokens,
        outputTokens: claudeResponse.usage.output_tokens,
        durationMs,
        targetModel: kiroModelId,
        platform: 'kiro',
        accountId: context.accountId,
        upstreamResponseHeaders: JSON.stringify(upstreamResponseHeaders),
        upstreamResponseBody: sanitizedKiroResponse,
        clientResponseHeaders: JSON.stringify({ 'Content-Type': 'application/json' }),
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        rawInputTokens: claudeResponse.usage.input_tokens,
        rawOutputTokens: claudeResponse.usage.output_tokens,
        rawCacheTokens: 0,
        apiKeyId: context.apiKeyId,
      });

      accountSelector.updateUsageStats(
        context.accountId,
        claudeResponse.usage.input_tokens,
        claudeResponse.usage.output_tokens,
        0
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

  private estimateInputTokens(req: ClaudeRequest): number {
    const parts: string[] = [];
    const systemText = extractSystemText(req.system);
    if (systemText) parts.push(systemText);

    for (const msg of req.messages) {
      const text = extractTextFromContent(msg.content);
      if (text) parts.push(text);
    }

    const totalText = parts.join('\n');
    if (!totalText) return 0;
    return Math.ceil(totalText.length / 4);
  }
}

/**
 * 代理错误类
 */
class ProxyError extends Error {
  public accountId?: string;

  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    accountId?: string
  ) {
    super(message);
    this.name = 'ProxyError';
    this.accountId = accountId;
  }

  /** 创建带 accountId 的新错误副本 */
  withAccountId(accountId: string): ProxyError {
    return new ProxyError(this.statusCode, this.code, this.message, accountId);
  }
}

export const proxyService = new ProxyService();

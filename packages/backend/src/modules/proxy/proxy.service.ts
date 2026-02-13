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
import { accountsRepository } from '../accounts/accounts.repository.js';
import { accountSelector } from './account-selector.js';
import { generateSessionHash, buildSessionKey, setSessionAccount } from './session-affinity.js';
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
// OpenAI channel
import {
  convertClaudeToOpenAI,
  handleOpenAISSEStream,
  DEFAULT_OPENAI_BASE_URL,
} from './channels/openai/index.js';
import type { ClaudeRequest, ClaudeResponse, ContentBlock, ProxyContext, ModelSlot, MessageContent, SystemPrompt, EffortLevel } from './types.js';
import type { SelectedAccount } from './types.js';

// 最大重试次数
const MAX_RETRIES = 2;

// User-Agent (版本号需要 >= 1.15.8)
const USER_AGENT = 'antigravity/1.15.8 darwin/arm64';

// Antigravity 端点容量不足重试配置
const ANTIGRAVITY_MAX_CAPACITY_RETRIES = 3;
const ANTIGRAVITY_CAPACITY_RETRY_BASE_MS = 250;
const ANTIGRAVITY_CAPACITY_RETRY_MAX_MS = 2000;

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

      // 2.5 应用 API Key 映射的 reasoningEffort 覆盖
      this.applyReasoningEffortOverride(claudeReq, mapping.reasoningEffort);

      // 3. 选择账号（带 session 粘性）
      const account = await accountSelector.selectAccountWithSession(mapping.targetModel, claudeReq);
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
          { error, code: error.code, logId: log.id, headersSent: res.headersSent },
          'Proxy request failed'
        );

        // 返回错误响应（包含请求 ID 头）
        if (!res.headersSent) {
          res.setHeader('X-Request-Id', log.id);
          res.status(error.statusCode).json({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        } else {
          logger.warn({ logId: log.id, code: error.code }, 'Cannot send ProxyError response, headers already sent (streaming)');
        }

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
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : undefined;
        const errName = error instanceof Error ? error.name : typeof error;

        logger.error(
          {
            logId: log.id,
            errorName: errName,
            errorMessage: errMsg,
            errorStack: errStack,
            targetModel: resolvedTargetModel,
            accountId: resolvedAccountId,
            headersSent: res.headersSent,
            durationMs,
          },
          'Unexpected proxy error (non-ProxyError)'
        );

        // 如果响应头已发送（流式传输中途出错），无法再发送 JSON 错误响应
        if (!res.headersSent) {
          res.setHeader('X-Request-Id', log.id);
          res.status(500).json({
            success: false,
            error: {
              code: 'PROXY_ERROR',
              message: 'Failed to proxy request',
            },
          });
        } else {
          // 流式传输中途出错，尝试写入一个 SSE 错误事件后关闭连接
          try {
            const errorEvent = `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'server_error', message: 'Internal stream error' } })}\n\n`;
            res.write(errorEvent);
            res.end();
          } catch {
            // 连接可能已断开，忽略写入错误
          }
        }

        // 添加到日志缓冲区（批量写入），记录完整错误信息
        logBuffer.add({
          id: log.id,
          status: 'error',
          statusCode: 500,
          errorMessage: `[${errName}] ${errMsg}`,
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
        if (currentAccount.platform === 'openai') {
          await this.executeOpenaiProxy(
            claudeReq,
            { ...context, platform: 'openai', accountId: currentAccount.id, accessToken: currentAccount.accessToken, projectId: currentAccount.projectId },
            res,
            currentAccount
          );
        } else if (currentAccount.platform === 'kiro') {
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
        // 重试成功切换到新账号后，更新 session 映射
        if (currentAccount.id !== initialAccount.id) {
          const sessionHash = generateSessionHash(claudeReq);
          if (sessionHash) {
            const sessionKey = buildSessionKey(sessionHash, context.targetModel);
            await setSessionAccount(sessionKey, currentAccount.id);
          }
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
          // 非 ProxyError（网络异常、流中断、转换错误等），记录详细信息后向上抛出
          logger.error(
            {
              errorName: error instanceof Error ? error.name : typeof error,
              errorMessage: error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
              platform: currentAccount.platform,
              accountId: currentAccount.id,
              targetModel: context.targetModel,
              logId: context.logId,
              retryCount,
            },
            'Non-ProxyError in executeWithRetry, not retryable'
          );
          throw error;
        }
      }
    }
  }

  /**
   * 执行 Antigravity 平台代理请求
   * 支持多端点降级（429 切换端点）和容量不足重试（503 "no capacity" 指数退避）
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

    const path = isStream ? STREAM_PATH : NON_STREAM_PATH;
    const upstreamRequestBodyStr = JSON.stringify(geminiBody);
    const proxyAgent = getProxyAgent();

    // 端点降级 + 容量不足重试
    attemptLoop:
    for (let attempt = 0; attempt < ANTIGRAVITY_MAX_CAPACITY_RETRIES; attempt++) {
      for (let epIdx = 0; epIdx < ANTIGRAVITY_ENDPOINTS.length; epIdx++) {
        const endpoint = ANTIGRAVITY_ENDPOINTS[epIdx];
        const url = `${endpoint}${path}`;

        // 构建上游请求头（Host 动态解析）
        const upstreamHeaders: Record<string, string> = {
          Host: new URL(endpoint).hostname,
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
          Authorization: `Bearer ${context.accessToken}`,
          Accept: isStream ? 'text/event-stream' : 'application/json',
        };

        const upstreamRequestHeadersStr = JSON.stringify(upstreamHeaders);

        // 首次尝试时更新日志记录
        if (attempt === 0 && epIdx === 0) {
          logRepository.update(context.logId, {
            upstreamRequestHeaders: upstreamRequestHeadersStr,
            upstreamRequestBody: upstreamRequestBodyStr,
          }).catch((err) => logger.error({ err, logId: context.logId }, 'Failed to update upstream request data'));
        }

        logger.debug(
          {
            url,
            platform: 'antigravity',
            targetModel: context.targetModel,
            isStream,
            isThinkingEnabled,
            messageCount,
            attempt,
            endpointIndex: epIdx,
          },
          'Sending request to Antigravity'
        );

        // 发送请求
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

          // 429：尝试下一个 endpoint
          if (response.status === 429 && epIdx < ANTIGRAVITY_ENDPOINTS.length - 1) {
            logger.warn(
              { statusCode: 429, endpoint, attempt, nextEndpoint: ANTIGRAVITY_ENDPOINTS[epIdx + 1] },
              'Antigravity 429, trying next endpoint'
            );
            continue;
          }

          // 503 + "no capacity"：延迟后从第一个端点重试
          if (response.status === 503 && errorBody.toLowerCase().includes('no capacity')) {
            if (attempt < ANTIGRAVITY_MAX_CAPACITY_RETRIES - 1) {
              const delay = Math.min(
                (attempt + 1) * ANTIGRAVITY_CAPACITY_RETRY_BASE_MS,
                ANTIGRAVITY_CAPACITY_RETRY_MAX_MS
              );
              logger.warn(
                { statusCode: 503, attempt, delayMs: delay },
                'Antigravity no capacity, retrying after delay'
              );
              await new Promise(r => setTimeout(r, delay));
              continue attemptLoop;
            }
          }

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

        // 成功响应 — 处理并返回
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

        return; // 成功处理完毕
      }
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
      targetModel: context.targetModel,
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

    let response: globalThis.Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (fetchError) {
      // fetch 网络层异常（DNS 解析失败、连接超时、连接拒绝等）
      const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      logger.error(
        {
          errorName: fetchError instanceof Error ? fetchError.name : typeof fetchError,
          errorMessage: errMsg,
          url,
          region,
          kiroModelId,
          accountId: context.accountId,
          logId: context.logId,
        },
        'Kiro fetch network error'
      );
      throw new ProxyError(
        502,
        'UPSTREAM_NETWORK_ERROR',
        `Kiro network error: ${errMsg}`
      );
    }

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
   * 执行 OpenAI 平台代理请求
   */
  private async executeOpenaiProxy(
    claudeReq: ClaudeRequest,
    context: ProxyContext & { accessToken: string; projectId: string },
    res: Response,
    account: SelectedAccount
  ): Promise<void> {
    const isStream = claudeReq.stream !== false; // 默认流式
    const isCodex = account.openaiAccountType === 'codex';

    // 转换请求
    const { body: openaiBody, toolNameMap } = convertClaudeToOpenAI(claudeReq, {
      targetModel: context.targetModel,
    });

    // 强制设置 stream
    openaiBody.stream = isStream;

    // Codex 特殊处理
    if (isCodex) {
      openaiBody.store = false;
      openaiBody.stream = true; // Codex endpoint 强制要求 stream: true
      delete openaiBody.max_output_tokens; // Codex 不支持 max_output_tokens
      // Codex endpoint 要求 instructions 必须存在
      if (!openaiBody.instructions) {
        openaiBody.instructions = 'You are a helpful assistant.';
      }
    }

    // 构建 URL
    let url: string;
    if (isCodex) {
      url = 'https://chatgpt.com/backend-api/codex/responses';
    } else {
      const baseUrl = account.openaiBaseUrl || DEFAULT_OPENAI_BASE_URL;
      url = `${baseUrl}/v1/responses`;
    }

    // 构建上游请求头
    const upstreamHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${isCodex ? context.accessToken : (account.openaiApiKey || context.accessToken)}`,
    };

    // Codex 需要额外的 chatgpt-account-id 头
    if (isCodex && account.chatgptAccountId) {
      upstreamHeaders['chatgpt-account-id'] = account.chatgptAccountId;
    }

    const upstreamRequestHeadersStr = JSON.stringify(upstreamHeaders);
    const upstreamRequestBodyStr = JSON.stringify(openaiBody);

    // 更新日志记录
    logRepository.update(context.logId, {
      upstreamRequestHeaders: upstreamRequestHeadersStr,
      upstreamRequestBody: upstreamRequestBodyStr,
    }).catch((err) => logger.error({ err, logId: context.logId }, 'Failed to update upstream request data'));

    logger.info(
      {
        url,
        platform: 'openai',
        targetModel: context.targetModel,
        isStream,
        messageCount: context.messageCount,
      },
      'Sending request to OpenAI Responses API'
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

    // Codex: 提取并保存用量信息（从响应头）
    if (isCodex && response.ok) {
      this.extractAndSaveCodexUsage(account.id, upstreamResponseHeaders);
    }

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
        'OpenAI API error'
      );

      throw new ProxyError(
        response.status,
        'UPSTREAM_ERROR',
        `OpenAI API error: ${response.status} - ${errorBody.substring(0, 200)}`
      );
    }

    // 处理响应
    const durationMs = Date.now() - context.startTime;

    if (isStream && response.body) {
      res.setHeader('X-Request-Id', context.logId);

      // 构建反向映射: shortened → original
      const toolNameReverseMap = new Map<string, string>();
      for (const [original, shortened] of toolNameMap) {
        if (original !== shortened) {
          toolNameReverseMap.set(shortened, original);
        }
      }

      const result = await handleOpenAISSEStream(
        response.body,
        res,
        {
          sessionId: context.sessionId,
          modelName: context.targetModel,
          toolNameReverseMap,
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
        platform: 'openai',
        accountId: context.accountId,
        upstreamResponseHeaders: JSON.stringify(upstreamResponseHeaders),
        upstreamResponseBody: result.upstreamResponseBody,
        clientResponseHeaders: JSON.stringify({ 'Content-Type': 'text/event-stream' }),
        responseBody: result.clientResponseBody,
        cacheReadTokens: result.cacheReadTokens,
        cacheCreationTokens: 0,
        rawInputTokens: result.rawInputTokens,
        rawOutputTokens: result.outputTokens,
        rawCacheTokens: result.rawCacheReadTokens,
        apiKeyId: context.apiKeyId,
      });

      accountSelector.updateUsageStats(
        context.accountId,
        result.inputTokens,
        result.outputTokens,
        result.cacheReadTokens
      ).catch((err) => logger.error({ err, accountId: context.accountId }, 'Failed to update account stats'));
    } else {
      // 非流式响应 — OpenAI Responses API 返回完整 response 对象
      const responseText = await response.text();
      try {
        const responseObj = JSON.parse(responseText);
        const claudeResponse = transformOpenAINonStreamingResponse(responseObj, context.targetModel);

        // 保存原始值用于日志，缩放值返回给客户端
        const rawInputTokens = claudeResponse.usage.input_tokens;
        const rawCacheTokens = claudeResponse.usage.cache_read_input_tokens || 0;
        claudeResponse.usage.input_tokens = Math.round(rawInputTokens / 2);
        if (claudeResponse.usage.cache_read_input_tokens) {
          claudeResponse.usage.cache_read_input_tokens = Math.round(rawCacheTokens / 2);
        }

        res.setHeader('X-Request-Id', context.logId);
        res.json(claudeResponse);

        logBuffer.add({
          id: context.logId,
          status: 'success',
          statusCode: 200,
          responseBody: JSON.stringify(claudeResponse),
          inputTokens: claudeResponse.usage.input_tokens,
          outputTokens: claudeResponse.usage.output_tokens,
          durationMs,
          targetModel: context.targetModel,
          platform: 'openai',
          accountId: context.accountId,
          upstreamResponseHeaders: JSON.stringify(upstreamResponseHeaders),
          upstreamResponseBody: responseText,
          clientResponseHeaders: JSON.stringify({ 'Content-Type': 'application/json' }),
          cacheReadTokens: claudeResponse.usage.cache_read_input_tokens || 0,
          cacheCreationTokens: 0,
          rawInputTokens,
          rawOutputTokens: claudeResponse.usage.output_tokens,
          rawCacheTokens,
          apiKeyId: context.apiKeyId,
        });

        accountSelector.updateUsageStats(
          context.accountId,
          claudeResponse.usage.input_tokens,
          claudeResponse.usage.output_tokens,
          claudeResponse.usage.cache_read_input_tokens || 0
        ).catch((err) => logger.error({ err, accountId: context.accountId }, 'Failed to update account stats'));
      } catch (parseError) {
        logger.error({ parseError, responseText: responseText.substring(0, 500) }, 'Failed to parse OpenAI response');
        throw new ProxyError(500, 'PARSE_ERROR', 'Failed to parse OpenAI response');
      }
    }
  }

  /**
   * 提取并保存 Codex 用量信息（从响应头）
   */
  private extractAndSaveCodexUsage(
    accountId: string,
    headers: Record<string, string>
  ): void {
    const primaryUsed = parseFloat(headers['x-codex-primary-used-percent'] || '');
    const primaryReset = parseInt(headers['x-codex-primary-reset-after-seconds'] || '', 10);
    const secondaryUsed = parseFloat(headers['x-codex-secondary-used-percent'] || '');
    const secondaryReset = parseInt(headers['x-codex-secondary-reset-after-seconds'] || '', 10);

    // 如果没有 codex 用量头，跳过
    if (isNaN(primaryUsed) && isNaN(secondaryUsed)) return;

    const safePrimaryUsed = isNaN(primaryUsed) ? 0 : primaryUsed;
    const safeSecondaryUsed = isNaN(secondaryUsed) ? 0 : secondaryUsed;

    // 分别保存 5h 窗口和周限窗口配额
    const primaryPercentage = Math.max(0, Math.round(100 - safePrimaryUsed));
    const primaryResetTime = !isNaN(primaryReset) && primaryReset > 0
      ? new Date(Date.now() + primaryReset * 1000).toISOString()
      : null;

    const secondaryPercentage = Math.max(0, Math.round(100 - safeSecondaryUsed));
    const secondaryResetTime = !isNaN(secondaryReset) && secondaryReset > 0
      ? new Date(Date.now() + secondaryReset * 1000).toISOString()
      : null;

    accountsRepository.upsertQuota(accountId, 'codex-5h', primaryPercentage, primaryResetTime)
      .catch(err => logger.error({ err, accountId }, 'Failed to update codex-5h quota'));
    accountsRepository.upsertQuota(accountId, 'codex-weekly', secondaryPercentage, secondaryResetTime)
      .catch(err => logger.error({ err, accountId }, 'Failed to update codex-weekly quota'));

    // 更新 subscriptionRaw 中的 codexUsage 快照
    const codexUsage = {
      primary: {
        usedPercent: safePrimaryUsed,
        resetAfterSeconds: isNaN(primaryReset) ? null : primaryReset,
        windowMinutes: 300,
      },
      secondary: {
        usedPercent: safeSecondaryUsed,
        resetAfterSeconds: isNaN(secondaryReset) ? null : secondaryReset,
        windowMinutes: 10080,
      },
      lastUpdated: new Date().toISOString(),
    };

    accountsRepository.findById(accountId).then(async (account) => {
      if (!account) return;
      const existingRaw = (account.subscriptionRaw || {}) as Record<string, unknown>;
      await accountsRepository.update(accountId, {
        subscriptionRaw: { ...existingRaw, codexUsage } as unknown as import('@prisma/client').Prisma.InputJsonValue,
      });
    }).catch(err => logger.error({ err, accountId }, 'Failed to update codex usage snapshot'));

    logger.debug(
      { accountId, primaryRemaining: primaryPercentage, weeklyRemaining: secondaryPercentage },
      'Codex usage extracted'
    );
  }

  /**
   * 获取模型映射
   */
  private async getModelMapping(
    apiKeyId: string,
    modelSlot: ModelSlot
  ): Promise<{ platform: string; targetModel: string; reasoningEffort?: string } | null> {
    const mappings = await apiKeyRepository.getModelMappings(apiKeyId);
    const mapping = mappings.find((m) => m.claudeModel === modelSlot);

    if (!mapping) {
      return null;
    }

    return {
      platform: mapping.platform,
      targetModel: mapping.targetModel,
      reasoningEffort: mapping.reasoningEffort,
    };
  }

  /**
   * 应用 API Key 映射的 reasoningEffort 覆盖
   * - auto / undefined: 不覆盖，走请求中的配置
   * - none: 等同于 high（默认值）
   * - low / medium / high / max: 强制覆盖
   */
  private applyReasoningEffortOverride(claudeReq: ClaudeRequest, reasoningEffort?: string): void {
    if (!reasoningEffort || reasoningEffort === 'auto') {
      return;
    }

    const effortMap: Record<string, EffortLevel> = {
      none: 'high',
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'max',
    };

    const effort = effortMap[reasoningEffort];
    if (!effort) return;

    logger.info(
      { reasoningEffort, resolvedEffort: effort },
      'Applying API Key reasoningEffort override'
    );

    claudeReq.output_config = { effort };
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
 * 将 OpenAI Responses API 非流式响应转换为 Claude 响应格式
 */
function transformOpenAINonStreamingResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
  modelName: string
): ClaudeResponse {
  const content: ContentBlock[] = [];

  // 遍历 output items
  if (response.output && Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === 'reasoning' && item.summary) {
        // Reasoning summary → thinking block
        for (const part of item.summary) {
          if (part.type === 'summary_text' && part.text) {
            content.push({
              type: 'thinking',
              thinking: part.text,
            } as ContentBlock);
          }
        }
      } else if (item.type === 'message' && item.content) {
        // Message → text block
        for (const part of item.content) {
          if (part.type === 'output_text' && part.text) {
            content.push({
              type: 'text',
              text: part.text,
            } as ContentBlock);
          }
        }
      } else if (item.type === 'function_call') {
        // Function call → tool_use block
        let input: unknown = {};
        try {
          input = JSON.parse(item.arguments || '{}');
        } catch {
          input = {};
        }
        content.push({
          type: 'tool_use',
          id: item.call_id || item.id,
          name: item.name,
          input,
        } as ContentBlock);
      }
    }
  }

  // 推导 stop_reason
  const hasFunctionCall = response.output?.some((item: { type: string }) => item.type === 'function_call');
  let stopReason = 'end_turn';
  if (hasFunctionCall) {
    stopReason = 'tool_use';
  } else if (response.incomplete_details) {
    stopReason = 'max_tokens';
  }

  // 提取 usage
  const usage = response.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;

  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: modelName,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_input_tokens: cachedTokens,
    },
  };
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

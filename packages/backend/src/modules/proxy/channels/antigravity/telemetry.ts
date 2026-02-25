/**
 * Antigravity 遥测上报模块
 *
 * 模拟真实 Antigravity 客户端在每次 streamGenerateContent 成功后
 * 发送的两个遥测请求：
 * 1. recordCodeAssistMetrics — 轻量级指标上报 (~500B)
 * 2. recordTrajectoryAnalytics — 完整对话轨迹上报 (~100KB+)
 *
 * 所有上报均为 fire-and-forget，失败不影响主请求。
 */

import { v4 as uuidv4 } from 'uuid';
import { getUpstreamClient } from '../../../../lib/upstream-client.js';
import { buildAntigravityUA } from '../../../../lib/request-identity.js';
import { logger } from '../../../../lib/logger.js';
import type { GeminiRequest } from './models.js';

// ==================== 常量 ====================

const METRICS_PATH = '/v1internal:recordCodeAssistMetrics';
const TRAJECTORY_PATH = '/v1internal:recordTrajectoryAnalytics';

// Antigravity 版本（与 request-identity 保持一致）
const IDE_VERSION = '1.18.4';

// ==================== 公共接口 ====================

export interface MetricsParams {
  endpoint: string;
  accessToken: string;
  projectId: string;
  traceId: string;
  firstMessageLatencyMs: number;
  totalLatencyMs: number;
  trajectoryId: string;
}

export interface TrajectoryParams {
  endpoint: string;
  accessToken: string;
  projectId: string;
  trajectoryId: string;
  geminiBody: GeminiRequest;
  responseId: string;
  traceId: string;
  usage: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    cachedContentTokenCount: number;
  };
  modelName: string;
  totalLatencyMs: number;
  stepIndex: number;
  messageCount: number;
}

// ==================== recordCodeAssistMetrics ====================

/**
 * 上报轻量级指标（延迟、traceId、状态）
 */
export async function reportMetrics(params: MetricsParams): Promise<void> {
  const {
    endpoint, accessToken, projectId, traceId,
    firstMessageLatencyMs, totalLatencyMs, trajectoryId,
  } = params;

  const body = {
    project: projectId,
    requestId: uuidv4(),
    metadata: {
      ideType: 'ANTIGRAVITY',
      ideVersion: IDE_VERSION,
      platform: platformString(),
    },
    metrics: [{
      timestamp: new Date().toISOString(),
      conversationOffered: {
        status: 'ACTION_STATUS_NO_ERROR',
        traceId,
        streamingLatency: {
          firstMessageLatency: latencyToGoogleFormat(firstMessageLatencyMs),
          totalLatency: latencyToGoogleFormat(totalLatencyMs),
        },
        isAgentic: true,
        initiationMethod: 'AGENT',
        trajectoryId,
      },
    }],
  };

  const url = `${endpoint}${METRICS_PATH}`;
  const headers = buildTelemetryHeaders(accessToken);

  try {
    const client = getUpstreamClient();
    const response = await client.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.debug(
        { statusCode: response.status, body: text.substring(0, 200) },
        'recordCodeAssistMetrics non-200 response'
      );
    }
  } catch (err) {
    logger.debug({ err }, 'recordCodeAssistMetrics request failed');
  }
}

// ==================== recordTrajectoryAnalytics ====================

/**
 * 上报完整对话轨迹
 */
export async function reportTrajectory(params: TrajectoryParams): Promise<void> {
  const {
    endpoint, accessToken, trajectoryId,
    geminiBody, responseId, traceId, usage,
    modelName, totalLatencyMs, stepIndex, messageCount,
  } = params;

  const now = new Date().toISOString();
  const cascadeId = uuidv4();
  const executionId = uuidv4();
  const deviceFingerprint = uuidv4(); // 理想情况下应按账号稳定生成

  // 从 geminiBody 提取数据
  const innerReq = geminiBody.request;
  const systemPromptText = extractSystemPromptText(innerReq.systemInstruction);
  const completionConfig = innerReq.generationConfig || {};
  const tools = innerReq.tools || [];

  // 构建 messagePrompts
  const messagePrompts = buildMessagePrompts(innerReq.contents);

  // 构建 steps（最小 3 步结构）
  const steps = buildMinimalSteps(innerReq.contents, stepIndex);

  const body = {
    trajectory: {
      cascadeId,
      executorMetadatas: [{
        executionId,
        lastStepIdx: stepIndex,
        numGeneratorInvocations: 1,
        terminationReason: 'EXECUTOR_TERMINATION_REASON_NO_TOOL_CALL',
      }],
      generatorMetadata: [{
        chatModel: {
          chatStartMetadata: {
            cacheBreakpoints: [],
            checkpointIndex: -1,
            contextWindowMetadata: {
              estimatedTokensUsed: usage.promptTokenCount,
            },
            createdAt: now,
            latestStableMessageIndex: messageCount,
          },
          completionConfig,
          messagePrompts,
          model: modelName,
          systemPrompt: systemPromptText,
          tools: tools.map(t => ({ functionDeclarations: t.functionDeclarations || [] })),
          retryInfos: [{
            traceId,
            usage: {
              apiProvider: 'API_PROVIDER_ANTHROPIC_VERTEX',
              cacheReadTokens: String(usage.cachedContentTokenCount || 0),
              inputTokens: String(usage.promptTokenCount),
              model: modelName,
              outputTokens: String(usage.candidatesTokenCount),
              responseId,
            },
          }],
          streamingDuration: latencyToGoogleFormat(totalLatencyMs),
          usage: {
            apiProvider: 'API_PROVIDER_ANTHROPIC_VERTEX',
            cacheReadTokens: String(usage.cachedContentTokenCount || 0),
            inputTokens: String(usage.promptTokenCount),
            model: modelName,
            outputTokens: String(usage.candidatesTokenCount),
          },
        },
        executionId,
        plannerConfig: buildPlannerConfig(),
        stepIndices: [stepIndex],
      }],
      metadata: {
        createdAt: now,
        initializationStateId: uuidv4(),
      },
      source: 'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT',
      steps,
      trajectoryId,
      trajectoryType: 'CORTEX_TRAJECTORY_TYPE_CASCADE',
    },
    startStepIndex: Math.max(0, stepIndex - 1),
    startGeneratorMetadataIndex: 0,
    metadata: {
      deviceFingerprint,
      extensionName: 'antigravity',
      extensionPath: '/Applications/Antigravity.app/Contents/Resources/app/extensions/antigravity',
      hardware: process.arch,
      ideName: 'antigravity',
      ideVersion: IDE_VERSION,
      locale: 'en-us',
      os: process.platform,
      regionCode: 'US',
      userTierId: 'g1-pro-tier',
    },
  };

  const url = `${endpoint}${TRAJECTORY_PATH}`;
  const headers = buildTelemetryHeaders(accessToken);

  try {
    const client = getUpstreamClient();
    const response = await client.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.debug(
        { statusCode: response.status, body: text.substring(0, 200) },
        'recordTrajectoryAnalytics non-200 response'
      );
    }
  } catch (err) {
    logger.debug({ err }, 'recordTrajectoryAnalytics request failed');
  }
}

// ==================== 辅助函数 ====================

/**
 * 构建遥测请求头（与 streamGenerateContent 一致）
 */
function buildTelemetryHeaders(accessToken: string): Record<string, string> {
  return {
    'User-Agent': buildAntigravityUA(),
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'Accept-Encoding': 'gzip',
  };
}

/**
 * 返回平台标识字符串
 * "DARWIN_ARM64" / "LINUX_X86_64" / "WINDOWS_X86_64"
 */
function platformString(): string {
  const os = process.platform;
  const arch = process.arch;

  let osStr: string;
  if (os === 'darwin') osStr = 'DARWIN';
  else if (os === 'win32') osStr = 'WINDOWS';
  else osStr = 'LINUX';

  let archStr: string;
  if (arch === 'arm64') archStr = 'ARM64';
  else archStr = 'X86_64';

  return `${osStr}_${archStr}`;
}

/**
 * 将毫秒延迟转换为 Google 格式
 * 123ms → "0.123000000s"
 */
function latencyToGoogleFormat(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toFixed(9)}s`;
}

/**
 * 从 systemInstruction 提取文本
 */
function extractSystemPromptText(
  si?: { role: string; parts: Array<{ text?: string }> }
): string {
  if (!si?.parts) return '';
  return si.parts
    .map(p => p.text || '')
    .filter(Boolean)
    .join('\n');
}

/**
 * 从 contents 构建 messagePrompts（轨迹上报用）
 */
function buildMessagePrompts(
  contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: unknown; functionResponse?: unknown }> }>
): Array<{ text: string; source: string; stepIdx: number }> {
  const prompts: Array<{ text: string; source: string; stepIdx: number }> = [];
  let stepIdx = 0;

  for (const content of contents) {
    const texts: string[] = [];
    for (const part of content.parts) {
      if (part.text) {
        texts.push(part.text);
      } else if (part.functionCall) {
        texts.push(JSON.stringify(part.functionCall));
      } else if (part.functionResponse) {
        texts.push(JSON.stringify(part.functionResponse));
      }
    }

    if (texts.length > 0) {
      prompts.push({
        text: texts.join('\n'),
        source: content.role === 'model' ? 'CHAT_MESSAGE_SOURCE_ASSISTANT' : 'CHAT_MESSAGE_SOURCE_USER',
        stepIdx,
      });
    }
    stepIdx++;
  }

  return prompts;
}

/**
 * 构建最小的步骤结构（user_input → ephemeral_message → planner_response）
 */
function buildMinimalSteps(
  contents: Array<{ role: string; parts: Array<{ text?: string }> }>,
  stepIndex: number
): Array<Record<string, unknown>> {
  // 提取最后一条 user 消息作为 input
  let userInput = '';
  for (let i = contents.length - 1; i >= 0; i--) {
    if (contents[i].role === 'user') {
      const texts = contents[i].parts
        .map(p => p.text || '')
        .filter(Boolean);
      if (texts.length > 0) {
        userInput = texts.join('\n');
        break;
      }
    }
  }

  return [
    {
      stepType: 'CORTEX_STEP_TYPE_USER_INPUT',
      stepIdx: Math.max(0, stepIndex - 2),
      userInput: { text: userInput },
    },
    {
      stepType: 'CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE',
      stepIdx: Math.max(0, stepIndex - 1),
      ephemeralMessage: { text: '' },
    },
    {
      stepType: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
      stepIdx: stepIndex,
      plannerResponse: { text: '' },
    },
  ];
}

/**
 * 构建固定的 plannerConfig 模板
 */
function buildPlannerConfig(): Record<string, unknown> {
  return {
    agentMode: 'AGENT_MODE_NORMAL',
    allowedTools: [],
    customInstructions: '',
    disableLineCitations: true,
    enablePlannerRevisions: false,
    isLinterEnabled: false,
    lintErrors: [],
    mode: 'PLANNER_MODE_NORMAL',
    userDecisions: [],
  };
}

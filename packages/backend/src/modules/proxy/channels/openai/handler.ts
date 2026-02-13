/**
 * OpenAI Responses API SSE → Anthropic SSE 响应转换器
 *
 * 将 OpenAI Responses API 的 SSE 事件流转换为 Anthropic Claude SSE 格式
 */

import type { Response } from 'express';
import { logger } from '../../../../lib/logger.js';

export interface OpenAIStreamingOptions {
  sessionId: string;
  modelName: string;
  /** shortened→original 工具名反向映射，用于恢复原始名称 */
  toolNameReverseMap?: Map<string, string>;
}

export interface OpenAISSEStreamResult {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  rawInputTokens: number;
  rawCacheReadTokens: number;
  upstreamResponseBody: string;
  clientResponseBody: string;
}

/**
 * 状态机 — 跟踪流式转换状态
 */
interface StreamState {
  messageId: string;
  model: string;
  hasMessageStarted: boolean;
  contentIndex: number;
  isThinkingBlockOpen: boolean;
  isTextBlockOpen: boolean;
  isToolUseBlockOpen: boolean;
  // 按 item_id 跟踪 function calls
  functionCalls: Map<string, { name: string; callId: string; contentBlockIndex: number }>;
  // Usage
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  // 用于推导 stop_reason
  hasFunctionCall: boolean;
  responseStatus: string;
  hasIncompleteDetails: boolean;
  // 工具名反向映射: shortened → original
  toolNameReverseMap: Map<string, string>;
}

/**
 * 处理 OpenAI Responses API SSE 流并转换为 Anthropic SSE 格式
 */
export async function handleOpenAISSEStream(
  upstream: ReadableStream<Uint8Array>,
  res: Response,
  options: OpenAIStreamingOptions
): Promise<OpenAISSEStreamResult> {
  const state: StreamState = {
    messageId: `msg_${Date.now()}`,
    model: options.modelName,
    hasMessageStarted: false,
    contentIndex: 0,
    isThinkingBlockOpen: false,
    isTextBlockOpen: false,
    isToolUseBlockOpen: false,
    functionCalls: new Map(),
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    hasFunctionCall: false,
    responseStatus: '',
    hasIncompleteDetails: false,
    toolNameReverseMap: options.toolNameReverseMap ?? new Map(),
  };

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const upstreamChunks: string[] = [];
  const clientChunks: string[] = [];

  const safeWrite = (eventType: string, data: unknown): void => {
    if (res.writableEnded) return;
    const line = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(line);
    clientChunks.push(line);
  };

  // 行缓冲，处理跨 chunk 的不完整行
  let lineBuffer = '';

  const reader = upstream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      upstreamChunks.push(chunk);
      lineBuffer += chunk;

      // 按行处理
      const lines = lineBuffer.split('\n');
      // 最后一行可能不完整，保留在 buffer 中
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 处理 SSE 格式: "event: xxx" 和 "data: {...}"
        if (trimmed.startsWith('event:')) {
          // 事件类型行，后续 data 行中会包含事件类型
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') continue;

          try {
            const event = JSON.parse(dataStr);
            processEvent(event, state, safeWrite);
          } catch {
            // JSON 解析错误不中断流
            logger.debug({ dataStr: dataStr.substring(0, 200) }, 'Failed to parse OpenAI SSE data');
          }
        }
      }
    }

    // 处理 buffer 中剩余的数据
    if (lineBuffer.trim()) {
      const trimmed = lineBuffer.trim();
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr && dataStr !== '[DONE]') {
          try {
            const event = JSON.parse(dataStr);
            processEvent(event, state, safeWrite);
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error reading OpenAI SSE stream');
  } finally {
    reader.releaseLock();
  }

  // 确保关闭所有开启的 blocks
  closeOpenBlocks(state, safeWrite);

  // 缩放 input tokens（Codex 400k 上下文 → Claude 200k，除以 2）
  const scaledInputTokens = Math.round(state.inputTokens / 2);
  const scaledCacheReadTokens = Math.round(state.cacheReadTokens / 2);

  // 确保发送 message_delta 和 message_stop
  if (state.hasMessageStarted) {
    const stopReason = deriveStopReason(state);

    safeWrite('message_delta', {
      type: 'message_delta',
      delta: {
        stop_reason: stopReason,
        stop_sequence: null,
      },
      usage: {
        input_tokens: scaledInputTokens,
        output_tokens: state.outputTokens,
      },
    });

    safeWrite('message_stop', { type: 'message_stop' });
  }

  if (!res.writableEnded) {
    res.end();
  }

  return {
    inputTokens: scaledInputTokens,
    outputTokens: state.outputTokens,
    cacheReadTokens: scaledCacheReadTokens,
    rawInputTokens: state.inputTokens,
    rawCacheReadTokens: state.cacheReadTokens,
    upstreamResponseBody: upstreamChunks.join(''),
    clientResponseBody: clientChunks.join(''),
  };
}

/**
 * 处理单个 OpenAI SSE 事件
 */
function processEvent(
  event: Record<string, unknown>,
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  const eventType = event.type as string;
  if (!eventType) return;

  switch (eventType) {
    case 'response.created':
      handleResponseCreated(event, state, safeWrite);
      break;

    case 'response.in_progress':
      // 无需处理
      break;

    case 'response.output_item.added':
      handleOutputItemAdded(event, state, safeWrite);
      break;

    case 'response.output_item.done':
      // output item 完成，可能不需要额外处理
      break;

    case 'response.content_part.added':
    case 'response.content_part.done':
      // 等待实际的 delta
      break;

    case 'response.output_text.delta':
      handleTextDelta(event, state, safeWrite);
      break;

    case 'response.output_text.done':
      handleTextDone(state, safeWrite);
      break;

    case 'response.reasoning_summary_part.added':
    case 'response.reasoning_summary_part.done':
      // 等待实际的 delta
      break;

    case 'response.reasoning_summary_text.delta':
      handleReasoningSummaryDelta(event, state, safeWrite);
      break;

    case 'response.reasoning_summary_text.done':
      handleReasoningSummaryDone(state, safeWrite);
      break;

    case 'response.function_call_arguments.delta':
      handleFunctionCallArgumentsDelta(event, state, safeWrite);
      break;

    case 'response.function_call_arguments.done':
      handleFunctionCallArgumentsDone(event, state, safeWrite);
      break;

    case 'response.completed':
      handleResponseCompleted(event, state);
      break;

    case 'response.failed':
      logger.error({ event }, 'OpenAI response failed');
      break;

    default:
      logger.debug({ eventType }, 'Unhandled OpenAI SSE event type');
      break;
  }
}

/**
 * response.created → message_start
 */
function handleResponseCreated(
  event: Record<string, unknown>,
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  const response = event.response as Record<string, unknown> | undefined;
  if (response?.model) {
    state.model = response.model as string;
  }

  if (!state.hasMessageStarted) {
    emitMessageStart(state, safeWrite);
  }
}

/**
 * response.output_item.added — 处理新的输出项
 */
function handleOutputItemAdded(
  event: Record<string, unknown>,
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  const item = event.item as Record<string, unknown> | undefined;
  if (!item) return;

  const itemType = item.type as string;

  if (itemType === 'function_call') {
    // 关闭当前开启的 block
    closeOpenBlocks(state, safeWrite);

    const callId = (item.call_id as string) || '';
    const shortenedName = (item.name as string) || '';
    const itemId = (item.id as string) || '';

    // 使用反向映射恢复原始工具名
    const originalName = state.toolNameReverseMap.get(shortenedName) ?? shortenedName;

    state.hasFunctionCall = true;

    // 记录 function call（使用原始名称）
    const blockIndex = state.contentIndex++;
    state.functionCalls.set(itemId, { name: originalName, callId, contentBlockIndex: blockIndex });

    // 发送 content_block_start (tool_use)（使用原始名称）
    safeWrite('content_block_start', {
      type: 'content_block_start',
      index: blockIndex,
      content_block: {
        type: 'tool_use',
        id: callId,
        name: originalName,
        input: {},
      },
    });

    state.isToolUseBlockOpen = true;
  }
  // reasoning 和 message 类型等待后续 delta 事件
}

/**
 * response.output_text.delta → content_block_start (text) + content_block_delta (text_delta)
 */
function handleTextDelta(
  event: Record<string, unknown>,
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  const delta = (event.delta as string) || '';
  if (!delta) return;

  if (!state.hasMessageStarted) {
    emitMessageStart(state, safeWrite);
  }

  // 如果 thinking block 还开着，先关闭
  if (state.isThinkingBlockOpen) {
    closeThinkingBlock(state, safeWrite);
  }

  if (!state.isTextBlockOpen) {
    // 开启 text block
    safeWrite('content_block_start', {
      type: 'content_block_start',
      index: state.contentIndex,
      content_block: {
        type: 'text',
        text: '',
      },
    });
    state.isTextBlockOpen = true;
  }

  safeWrite('content_block_delta', {
    type: 'content_block_delta',
    index: state.contentIndex,
    delta: {
      type: 'text_delta',
      text: delta,
    },
  });
}

/**
 * response.output_text.done → content_block_stop
 */
function handleTextDone(
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  if (state.isTextBlockOpen) {
    safeWrite('content_block_stop', {
      type: 'content_block_stop',
      index: state.contentIndex,
    });
    state.isTextBlockOpen = false;
    state.contentIndex++;
  }
}

/**
 * response.reasoning_summary_text.delta → content_block_start (thinking) + thinking_delta
 */
function handleReasoningSummaryDelta(
  event: Record<string, unknown>,
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  const delta = (event.delta as string) || '';
  if (!delta) return;

  if (!state.hasMessageStarted) {
    emitMessageStart(state, safeWrite);
  }

  if (!state.isThinkingBlockOpen) {
    // 开启 thinking block
    safeWrite('content_block_start', {
      type: 'content_block_start',
      index: state.contentIndex,
      content_block: {
        type: 'thinking',
        thinking: '',
      },
    });
    state.isThinkingBlockOpen = true;
  }

  safeWrite('content_block_delta', {
    type: 'content_block_delta',
    index: state.contentIndex,
    delta: {
      type: 'thinking_delta',
      thinking: delta,
    },
  });
}

/**
 * response.reasoning_summary_text.done → content_block_stop (thinking)
 */
function handleReasoningSummaryDone(
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  if (state.isThinkingBlockOpen) {
    closeThinkingBlock(state, safeWrite);
  }
}

/**
 * response.function_call_arguments.delta → input_json_delta
 */
function handleFunctionCallArgumentsDelta(
  event: Record<string, unknown>,
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  const delta = (event.delta as string) || '';
  if (!delta) return;

  // 找到当前活跃的 function call 的 block index
  const blockIndex = findActiveToolBlockIndex(state);
  if (blockIndex === -1) return;

  safeWrite('content_block_delta', {
    type: 'content_block_delta',
    index: blockIndex,
    delta: {
      type: 'input_json_delta',
      partial_json: delta,
    },
  });
}

/**
 * response.function_call_arguments.done → content_block_stop (tool_use)
 */
function handleFunctionCallArgumentsDone(
  _event: Record<string, unknown>,
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  if (state.isToolUseBlockOpen) {
    const blockIndex = findActiveToolBlockIndex(state);
    if (blockIndex !== -1) {
      safeWrite('content_block_stop', {
        type: 'content_block_stop',
        index: blockIndex,
      });
    }
    state.isToolUseBlockOpen = false;
  }
}

/**
 * response.completed — 提取 usage 和 status
 */
function handleResponseCompleted(
  event: Record<string, unknown>,
  state: StreamState
): void {
  const response = event.response as Record<string, unknown> | undefined;
  if (!response) return;

  state.responseStatus = (response.status as string) || 'completed';
  state.hasIncompleteDetails = response.incomplete_details != null;

  const usage = response.usage as Record<string, unknown> | undefined;
  if (usage) {
    state.inputTokens = (usage.input_tokens as number) || 0;
    state.outputTokens = (usage.output_tokens as number) || 0;

    const inputDetails = usage.input_tokens_details as Record<string, unknown> | undefined;
    if (inputDetails) {
      state.cacheReadTokens = (inputDetails.cached_tokens as number) || 0;
    }
  }
}

// ==================== 辅助函数 ====================

/**
 * 发送 message_start 事件
 */
function emitMessageStart(
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  safeWrite('message_start', {
    type: 'message_start',
    message: {
      id: state.messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: state.model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
  });
  state.hasMessageStarted = true;
}

/**
 * 关闭 thinking block
 */
function closeThinkingBlock(
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  if (!state.isThinkingBlockOpen) return;

  safeWrite('content_block_stop', {
    type: 'content_block_stop',
    index: state.contentIndex,
  });
  state.isThinkingBlockOpen = false;
  state.contentIndex++;
}

/**
 * 关闭所有打开的 blocks
 */
function closeOpenBlocks(
  state: StreamState,
  safeWrite: (eventType: string, data: unknown) => void
): void {
  if (state.isThinkingBlockOpen) {
    closeThinkingBlock(state, safeWrite);
  }
  if (state.isTextBlockOpen) {
    safeWrite('content_block_stop', {
      type: 'content_block_stop',
      index: state.contentIndex,
    });
    state.isTextBlockOpen = false;
    state.contentIndex++;
  }
  if (state.isToolUseBlockOpen) {
    const blockIndex = findActiveToolBlockIndex(state);
    if (blockIndex !== -1) {
      safeWrite('content_block_stop', {
        type: 'content_block_stop',
        index: blockIndex,
      });
    }
    state.isToolUseBlockOpen = false;
  }
}

/**
 * 查找当前活跃的 tool use block index
 */
function findActiveToolBlockIndex(state: StreamState): number {
  // 返回最后一个 function call 的 block index
  let lastIndex = -1;
  for (const fc of state.functionCalls.values()) {
    if (fc.contentBlockIndex > lastIndex) {
      lastIndex = fc.contentBlockIndex;
    }
  }
  return lastIndex;
}

/**
 * 推导 stop_reason
 */
function deriveStopReason(state: StreamState): string {
  if (state.hasFunctionCall) return 'tool_use';
  if (state.hasIncompleteDetails) return 'max_tokens';
  return 'end_turn';
}

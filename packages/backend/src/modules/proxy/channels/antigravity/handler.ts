/**
 * Antigravity/Gemini → Claude 响应处理器
 *
 * 核心功能：
 * 1. SSE 流式响应转换
 * 2. 工具参数修复 (Gemini 幻觉)
 * 3. 签名透传与缓存（保持原始 Base64 格式）
 * 4. Token 用量智能缩放
 */

import type { Response } from 'express';
import type { Usage, ContentBlock, ClaudeResponse } from '../../types.js';
import type {
  GeminiResponse,
  GeminiPart,
  GeminiUsageMetadata,
  GeminiGroundingMetadata,
} from './models.js';
import { MIN_SIGNATURE_LENGTH } from './models.js';
import { signatureCache } from '../../signature-cache.js';
import { logger } from '../../../../lib/logger.js';

// ==================== 流式响应处理 ====================

export interface StreamingOptions {
  sessionId: string;
  modelName: string;
  messageCount: number;
  scalingEnabled?: boolean;
  contextLimit?: number;
}

/**
 * 流式状态机
 */
export class StreamingState {
  // 块状态
  private blockType: 'none' | 'text' | 'thinking' | 'function' = 'none';
  private blockIndex = 0;
  private messageStartSent = false;
  private messageStopSent = false;
  private usedTool = false;

  // 签名管理
  private pendingSignature: string | null = null;
  private trailingSignature: string | null = null;

  // Grounding 数据
  private webSearchQuery: string | null = null;
  private groundingChunks: unknown[] | null = null;

  // 配置
  private readonly sessionId: string;
  private readonly modelName: string;
  private readonly messageCount: number;
  private readonly scalingEnabled: boolean;
  private readonly contextLimit: number;

  // 追踪内容
  hasThinking = false;
  hasContent = false;

  constructor(options: StreamingOptions) {
    this.sessionId = options.sessionId;
    this.modelName = options.modelName;
    this.messageCount = options.messageCount;
    this.scalingEnabled = options.scalingEnabled ?? false;
    this.contextLimit = options.contextLimit ?? 1_048_576;
  }

  /**
   * 发送 SSE 事件
   */
  emit(eventType: string, data: unknown): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  /**
   * 发送 message_start 事件
   */
  emitMessageStart(rawJson: GeminiResponse): string {
    if (this.messageStartSent) {
      return '';
    }

    const usage = rawJson.usageMetadata
      ? toClaudeUsage(rawJson.usageMetadata, this.scalingEnabled, this.contextLimit)
      : undefined;

    const message = {
      id: rawJson.responseId || 'msg_unknown',
      type: 'message',
      role: 'assistant',
      content: [],
      model: rawJson.modelVersion || '',
      stop_reason: null,
      stop_sequence: null,
      usage,
    };

    this.messageStartSent = true;

    return this.emit('message_start', {
      type: 'message_start',
      message,
    });
  }

  /**
   * 开始新的内容块
   */
  startBlock(blockType: 'text' | 'thinking' | 'function', contentBlock: unknown): string[] {
    const chunks: string[] = [];

    // 先关闭当前块
    if (this.blockType !== 'none') {
      chunks.push(...this.endBlock());
    }

    chunks.push(
      this.emit('content_block_start', {
        type: 'content_block_start',
        index: this.blockIndex,
        content_block: contentBlock,
      })
    );

    this.blockType = blockType;
    return chunks;
  }

  /**
   * 结束当前块
   */
  endBlock(): string[] {
    if (this.blockType === 'none') {
      return [];
    }

    const chunks: string[] = [];

    // 发送暂存的签名
    if (this.blockType === 'thinking' && this.pendingSignature) {
      chunks.push(this.emitDelta('signature_delta', { signature: this.pendingSignature }));
      this.pendingSignature = null;
    }

    chunks.push(
      this.emit('content_block_stop', {
        type: 'content_block_stop',
        index: this.blockIndex,
      })
    );

    this.blockIndex++;
    this.blockType = 'none';

    return chunks;
  }

  /**
   * 发送 delta 事件
   */
  emitDelta(deltaType: string, deltaContent: Record<string, unknown>): string {
    return this.emit('content_block_delta', {
      type: 'content_block_delta',
      index: this.blockIndex,
      delta: {
        type: deltaType,
        ...deltaContent,
      },
    });
  }

  /**
   * 处理单个 part
   */
  async processPart(part: GeminiPart): Promise<string[]> {
    const chunks: string[] = [];

    // 直接使用原始签名（不解码，保持 Base64 格式）
    const signature = part.thoughtSignature;

    // 缓存签名
    if (signature && signature.length >= MIN_SIGNATURE_LENGTH) {
      await signatureCache.cacheSessionSignature(this.sessionId, signature, this.messageCount);
      await signatureCache.cacheSignatureFamily(signature, this.modelName);
    }

    // 1. FunctionCall 处理
    if (part.functionCall) {
      // 先处理 trailing signature
      if (this.trailingSignature) {
        chunks.push(...this.endBlock());
        chunks.push(...this.emitThinkingWithSignature(this.trailingSignature));
        this.trailingSignature = null;
      }

      chunks.push(...this.processFunctionCall(part.functionCall, signature));
      this.hasContent = true;
      return chunks;
    }

    // 2. Text 处理
    if (part.text !== undefined) {
      if (part.thought) {
        // Thinking
        chunks.push(...(await this.processThinking(part.text, signature)));
      } else {
        // 普通 text
        chunks.push(...this.processText(part.text, signature));
      }
    }

    // 3. InlineData (图片) 处理
    if (part.inlineData) {
      const markdown = `![image](data:${part.inlineData.mimeType};base64,${part.inlineData.data})`;
      chunks.push(...this.processText(markdown, undefined));
    }

    return chunks;
  }

  /**
   * 处理 thinking 内容
   */
  private async processThinking(text: string, signature?: string): Promise<string[]> {
    const chunks: string[] = [];

    // 处理 trailing signature
    if (this.trailingSignature) {
      chunks.push(...this.endBlock());
      chunks.push(...this.emitThinkingWithSignature(this.trailingSignature));
      this.trailingSignature = null;
    }

    // 开始或继续 thinking 块
    if (this.blockType !== 'thinking') {
      chunks.push(...this.startBlock('thinking', { type: 'thinking', thinking: '' }));
    }

    this.hasThinking = true;

    if (text) {
      chunks.push(this.emitDelta('thinking_delta', { thinking: text }));
    }

    // 暂存签名
    if (signature) {
      this.pendingSignature = signature;
    }

    return chunks;
  }

  /**
   * 处理普通文本
   */
  private processText(text: string, signature?: string): string[] {
    const chunks: string[] = [];

    if (!text) {
      // 空文本带签名 - 暂存
      if (signature) {
        this.trailingSignature = signature;
      }
      return chunks;
    }

    // 关闭 thinking 块
    if (this.blockType === 'thinking') {
      chunks.push(...this.endBlock());
    }

    // 处理 trailing signature
    if (this.trailingSignature) {
      chunks.push(...this.endBlock());
      chunks.push(...this.emitThinkingWithSignature(this.trailingSignature));
      this.trailingSignature = null;
    }

    // 开始或继续 text 块
    if (this.blockType !== 'text') {
      chunks.push(...this.startBlock('text', { type: 'text', text: '' }));
    }

    chunks.push(this.emitDelta('text_delta', { text }));
    this.hasContent = true;

    // 非空 text 带签名 - 立即输出空 thinking 块
    if (signature) {
      chunks.push(...this.endBlock());
      chunks.push(...this.emitThinkingWithSignature(signature));
    }

    return chunks;
  }

  /**
   * 处理函数调用
   */
  private processFunctionCall(
    fc: NonNullable<GeminiPart['functionCall']>,
    signature?: string
  ): string[] {
    const chunks: string[] = [];

    // 关闭当前块
    chunks.push(...this.endBlock());

    this.usedTool = true;

    // 生成 tool_use id
    const toolId = fc.id || `${fc.name}-${generateRandomId()}`;

    // 修复工具名称
    let toolName = fc.name;
    if (toolName.toLowerCase() === 'search') {
      toolName = 'Grep';
    }

    // 修复参数
    const args = fc.args ? JSON.parse(JSON.stringify(fc.args)) : {};
    remapFunctionCallArgs(toolName, args);

    // 开始 tool_use 块 - 添加 signature 字段
    const toolUseBlock: {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
      signature?: string;
    } = {
      type: 'tool_use',
      id: toolId,
      name: toolName,
      input: {},
    };

    // 只有有效签名才添加
    if (signature && signature.length >= MIN_SIGNATURE_LENGTH) {
      toolUseBlock.signature = signature;
    }

    chunks.push(...this.startBlock('function', toolUseBlock));

    // 发送参数 delta
    chunks.push(this.emitDelta('input_json_delta', { partial_json: JSON.stringify(args) }));

    // 结束块
    chunks.push(...this.endBlock());

    // 缓存工具签名
    if (signature && signature.length >= MIN_SIGNATURE_LENGTH) {
      signatureCache.cacheToolSignature(toolId, signature);
    }

    return chunks;
  }

  /**
   * 发送空 thinking 块带签名
   */
  private emitThinkingWithSignature(signature: string): string[] {
    const chunks: string[] = [];

    chunks.push(
      ...this.startBlock('thinking', { type: 'thinking', thinking: '' })
    );
    chunks.push(this.emitDelta('thinking_delta', { thinking: '' }));
    chunks.push(this.emitDelta('signature_delta', { signature }));
    chunks.push(...this.endBlock());

    return chunks;
  }

  /**
   * 处理 grounding 元数据
   */
  processGrounding(grounding: GeminiGroundingMetadata): void {
    if (grounding.webSearchQueries?.length) {
      this.webSearchQuery = grounding.webSearchQueries.join(', ');
    }
    if (grounding.groundingChunks?.length) {
      this.groundingChunks = grounding.groundingChunks;
    }
  }

  /**
   * 发送结束事件
   */
  emitFinish(finishReason?: string, usageMetadata?: GeminiUsageMetadata): string[] {
    const chunks: string[] = [];

    // 关闭当前块
    chunks.push(...this.endBlock());

    // 处理 trailing signature (只缓存，不发送)
    if (this.trailingSignature) {
      signatureCache.cacheSessionSignature(this.sessionId, this.trailingSignature, this.messageCount);
      this.trailingSignature = null;
    }

    // 处理 grounding 结果
    if (this.webSearchQuery || this.groundingChunks) {
      let groundingText = '';

      if (this.webSearchQuery) {
        groundingText += `\n\n---\n**🔍 已为您搜索：** ${this.webSearchQuery}`;
      }

      if (this.groundingChunks) {
        const links = this.groundingChunks
          .map((chunk, i) => {
            const web = (chunk as { web?: { title?: string; uri?: string } }).web;
            if (web) {
              return `[${i + 1}] [${web.title || '网页来源'}](${web.uri || '#'})`;
            }
            return null;
          })
          .filter(Boolean);

        if (links.length > 0) {
          groundingText += `\n\n**🌐 来源引文：**\n${links.join('\n')}`;
        }
      }

      if (groundingText) {
        chunks.push(
          this.emit('content_block_start', {
            type: 'content_block_start',
            index: this.blockIndex,
            content_block: { type: 'text', text: '' },
          })
        );
        chunks.push(this.emitDelta('text_delta', { text: groundingText }));
        chunks.push(
          this.emit('content_block_stop', {
            type: 'content_block_stop',
            index: this.blockIndex,
          })
        );
        this.blockIndex++;
      }
    }

    // 确定 stop_reason
    let stopReason = 'end_turn';
    if (this.usedTool) {
      stopReason = 'tool_use';
    } else if (finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    }

    const usage = usageMetadata
      ? toClaudeUsage(usageMetadata, this.scalingEnabled, this.contextLimit)
      : { input_tokens: 0, output_tokens: 0 };

    chunks.push(
      this.emit('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage,
      })
    );

    if (!this.messageStopSent) {
      chunks.push('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      this.messageStopSent = true;
    }

    return chunks;
  }
}

// ==================== 非流式响应处理 ====================

export interface NonStreamingOptions {
  sessionId: string;
  modelName: string;
  messageCount: number;
  scalingEnabled?: boolean;
  contextLimit?: number;
}

/**
 * 转换非流式响应
 */
export async function transformNonStreamingResponse(
  geminiResponse: GeminiResponse,
  options: NonStreamingOptions
): Promise<ClaudeResponse> {
  const { sessionId, modelName, messageCount, scalingEnabled = false, contextLimit = 1_048_576 } =
    options;

  const contentBlocks: ContentBlock[] = [];
  let hasToolCall = false;
  let textBuilder = '';
  let thinkingBuilder = '';
  let thinkingSignature: string | null = null;
  let trailingSignature: string | null = null;

  const parts =
    geminiResponse.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    // 直接使用原始签名（不解码，保持 Base64 格式）
    const signature = part.thoughtSignature;

    // 缓存签名
    if (signature && signature.length >= MIN_SIGNATURE_LENGTH) {
      await signatureCache.cacheSessionSignature(sessionId, signature, messageCount);
      await signatureCache.cacheSignatureFamily(signature, modelName);
    }

    // FunctionCall
    if (part.functionCall) {
      // 刷新之前的内容
      if (thinkingBuilder || thinkingSignature) {
        contentBlocks.push({
          type: 'thinking',
          thinking: thinkingBuilder,
          signature: thinkingSignature || undefined,
        });
        thinkingBuilder = '';
        thinkingSignature = null;
      }
      if (textBuilder) {
        contentBlocks.push({ type: 'text', text: textBuilder });
        textBuilder = '';
      }

      // 处理 trailing signature
      if (trailingSignature) {
        contentBlocks.push({
          type: 'thinking',
          thinking: '',
          signature: trailingSignature,
        });
        trailingSignature = null;
      }

      hasToolCall = true;

      const fc = part.functionCall;
      const toolId = fc.id || `${fc.name}-${generateRandomId()}`;
      let toolName = fc.name;

      if (toolName.toLowerCase() === 'search') {
        toolName = 'Grep';
      }

      const args = fc.args ? JSON.parse(JSON.stringify(fc.args)) : {};
      remapFunctionCallArgs(toolName, args);

      contentBlocks.push({
        type: 'tool_use',
        id: toolId,
        name: toolName,
        input: args,
        signature: signature,
      });

      // 缓存工具签名
      if (signature && signature.length >= MIN_SIGNATURE_LENGTH) {
        await signatureCache.cacheToolSignature(toolId, signature);
      }

      continue;
    }

    // Text
    if (part.text !== undefined) {
      if (part.thought) {
        // Thinking
        if (textBuilder) {
          contentBlocks.push({ type: 'text', text: textBuilder });
          textBuilder = '';
        }

        // 处理 trailing signature
        if (trailingSignature) {
          if (thinkingBuilder || thinkingSignature) {
            contentBlocks.push({
              type: 'thinking',
              thinking: thinkingBuilder,
              signature: thinkingSignature || undefined,
            });
            thinkingBuilder = '';
            thinkingSignature = null;
          }
          contentBlocks.push({
            type: 'thinking',
            thinking: '',
            signature: trailingSignature,
          });
          trailingSignature = null;
        }

        thinkingBuilder += part.text;
        if (signature) {
          thinkingSignature = signature;
        }
      } else {
        // 普通 text
        if (!part.text) {
          // 空 text 带签名
          if (signature) {
            trailingSignature = signature;
          }
          continue;
        }

        // 刷新 thinking
        if (thinkingBuilder || thinkingSignature) {
          contentBlocks.push({
            type: 'thinking',
            thinking: thinkingBuilder,
            signature: thinkingSignature || undefined,
          });
          thinkingBuilder = '';
          thinkingSignature = null;
        }

        // 处理 trailing signature
        if (trailingSignature) {
          contentBlocks.push({
            type: 'thinking',
            thinking: '',
            signature: trailingSignature,
          });
          trailingSignature = null;
        }

        textBuilder += part.text;

        // 非空 text 带签名
        if (signature) {
          contentBlocks.push({ type: 'text', text: textBuilder });
          textBuilder = '';
          contentBlocks.push({
            type: 'thinking',
            thinking: '',
            signature,
          });
        }
      }
    }

    // InlineData (图片)
    if (part.inlineData) {
      if (thinkingBuilder || thinkingSignature) {
        contentBlocks.push({
          type: 'thinking',
          thinking: thinkingBuilder,
          signature: thinkingSignature || undefined,
        });
        thinkingBuilder = '';
        thinkingSignature = null;
      }

      const markdown = `![image](data:${part.inlineData.mimeType};base64,${part.inlineData.data})`;
      textBuilder += markdown;
    }
  }

  // 刷新剩余内容
  if (thinkingBuilder || thinkingSignature) {
    contentBlocks.push({
      type: 'thinking',
      thinking: thinkingBuilder,
      signature: thinkingSignature || undefined,
    });
  }
  if (textBuilder) {
    contentBlocks.push({ type: 'text', text: textBuilder });
  }
  if (trailingSignature) {
    contentBlocks.push({
      type: 'thinking',
      thinking: '',
      signature: trailingSignature,
    });
  }

  // 处理 grounding
  const grounding = geminiResponse.candidates?.[0]?.groundingMetadata;
  if (grounding) {
    let groundingText = '';

    if (grounding.webSearchQueries?.length) {
      groundingText += `\n\n---\n**🔍 已为您搜索：** ${grounding.webSearchQueries.join(', ')}`;
    }

    if (grounding.groundingChunks?.length) {
      const links = grounding.groundingChunks
        .map((chunk, i) => {
          if (chunk.web) {
            return `[${i + 1}] [${chunk.web.title || '网页来源'}](${chunk.web.uri || '#'})`;
          }
          return null;
        })
        .filter(Boolean);

      if (links.length > 0) {
        groundingText += `\n\n**🌐 来源引文：**\n${links.join('\n')}`;
      }
    }

    if (groundingText) {
      contentBlocks.push({ type: 'text', text: groundingText });
    }
  }

  // 确定 stop_reason
  const finishReason = geminiResponse.candidates?.[0]?.finishReason;
  let stopReason = 'end_turn';
  if (hasToolCall) {
    stopReason = 'tool_use';
  } else if (finishReason === 'MAX_TOKENS') {
    stopReason = 'max_tokens';
  }

  const usage = geminiResponse.usageMetadata
    ? toClaudeUsage(geminiResponse.usageMetadata, scalingEnabled, contextLimit)
    : { input_tokens: 0, output_tokens: 0 };

  return {
    id: geminiResponse.responseId || `msg_${generateRandomId()}`,
    type: 'message',
    role: 'assistant',
    model: geminiResponse.modelVersion || '',
    content: contentBlocks,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  };
}

// ==================== 工具参数修复 ====================

/**
 * 修复 Gemini 工具调用参数 (处理幻觉问题)
 */
function remapFunctionCallArgs(toolName: string, args: Record<string, unknown>): void {
  const nameLower = toolName.toLowerCase();

  // EnterPlanMode: 清空所有参数
  if (nameLower === 'enterplanmode') {
    for (const key of Object.keys(args)) {
      delete args[key];
    }
    return;
  }

  // Grep/Glob: description/query → pattern, paths[] → path
  if (['grep', 'search', 'glob'].includes(nameLower)) {
    // description → pattern
    if (args.description && !args.pattern) {
      args.pattern = args.description;
      delete args.description;
    }

    // query → pattern
    if (args.query && !args.pattern) {
      args.pattern = args.query;
      delete args.query;
    }

    // paths[] → path
    if (!args.path) {
      if (Array.isArray(args.paths)) {
        args.path = args.paths[0] || '.';
        delete args.paths;
      } else if (typeof args.paths === 'string') {
        args.path = args.paths;
        delete args.paths;
      } else {
        args.path = '.';
      }
    }
    return;
  }

  // Read: path → file_path
  if (nameLower === 'read') {
    if (args.path && !args.file_path) {
      args.file_path = args.path;
      delete args.path;
    }
    return;
  }

  // LS: 确保 path 存在
  if (nameLower === 'ls') {
    if (!args.path) {
      args.path = '.';
    }
    return;
  }

  // 通用: paths[0] → path
  if (!args.path && Array.isArray(args.paths) && args.paths.length === 1) {
    args.path = args.paths[0];
    delete args.paths;
  }
}

// ==================== Token 用量转换 ====================

/**
 * 转换 Gemini token 用量为 Claude 格式
 */
function toClaudeUsage(
  gemini: GeminiUsageMetadata,
  scalingEnabled: boolean,
  contextLimit: number
): Usage {
  let inputTokens = gemini.promptTokenCount || 0;
  const outputTokens = gemini.candidatesTokenCount || 0;

  // 智能缩放 (Gemini 上下文窗口更大)
  if (scalingEnabled && contextLimit > 0) {
    const ratio = inputTokens / contextLimit;

    // 分阶段压缩
    // 0-50%: 激进压缩 (50% → ~30%)
    // 50-70%: 开始回升 (70% → ~50%)
    // 70-85%: 快速回升 (85% → ~70%)
    // 85%+: 接近 1:1 (触发 compact 提示)
    if (ratio < 0.5) {
      inputTokens = Math.round(inputTokens * 0.6);
    } else if (ratio < 0.7) {
      inputTokens = Math.round(inputTokens * 0.7);
    } else if (ratio < 0.85) {
      inputTokens = Math.round(inputTokens * 0.8);
    }
    // 85%+ 保持原样，触发 compact
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_input_tokens: gemini.cachedContentTokenCount || undefined,
    cache_creation_input_tokens: 0,
  };
}

// ==================== 工具函数 ====================

/**
 * 生成随机 ID
 */
function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// ==================== SSE 流处理 ====================

export interface SSEStreamResult {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  finishReason?: string;
  rawInputTokens: number;
  rawOutputTokens: number;
  rawCacheTokens: number;
  upstreamResponseBody: string;
  clientResponseBody: string;
}

/**
 * 处理 SSE 流并转发给客户端
 */
export async function handleSSEStream(
  readable: ReadableStream<Uint8Array>,
  res: Response,
  options: StreamingOptions
): Promise<SSEStreamResult> {
  const state = new StreamingState(options);
  const decoder = new TextDecoder();
  const reader = readable.getReader();

  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let finishReason: string | undefined;

  // 原始 Token (Google 返回)
  let rawInputTokens = 0;
  let rawOutputTokens = 0;
  let rawCacheTokens = 0;

  // 收集上游原始响应
  const upstreamChunks: string[] = [];
  // 收集客户端响应
  const clientChunks: string[] = [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        // 收集上游原始响应
        upstreamChunks.push(line);

        try {
          const rawParsed = JSON.parse(data);
          // Antigravity 响应嵌套在 response 字段中
          const parsed = (rawParsed.response || rawParsed) as GeminiResponse;

          // 发送 message_start
          if (!state['messageStartSent']) {
            const chunk = state.emitMessageStart(parsed);
            res.write(chunk);
            clientChunks.push(chunk);
          }

          // 处理 candidates
          const candidate = parsed.candidates?.[0];
          if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
              const chunks = await state.processPart(part);
              for (const chunk of chunks) {
                res.write(chunk);
                clientChunks.push(chunk);
              }
            }
          }

          // 处理 grounding
          if (candidate?.groundingMetadata) {
            state.processGrounding(candidate.groundingMetadata);
          }

          // 记录 finish reason
          if (candidate?.finishReason) {
            finishReason = candidate.finishReason;
          }

          // 记录 usage (原始值)
          if (parsed.usageMetadata) {
            rawInputTokens = parsed.usageMetadata.promptTokenCount || 0;
            rawOutputTokens = parsed.usageMetadata.candidatesTokenCount || 0;
            rawCacheTokens = parsed.usageMetadata.cachedContentTokenCount || 0;

            // 计算映射后的值
            const usage = toClaudeUsage(parsed.usageMetadata, options.scalingEnabled ?? false, options.contextLimit ?? 1_048_576);
            inputTokens = usage.input_tokens;
            outputTokens = usage.output_tokens;
            cacheReadTokens = usage.cache_read_input_tokens || 0;
          }
        } catch (e) {
          logger.warn({ error: e, data }, 'Failed to parse SSE chunk');
        }
      }
    }

    // 发送结束事件
    const finishChunks = state.emitFinish(finishReason, { promptTokenCount: rawInputTokens, candidatesTokenCount: rawOutputTokens, cachedContentTokenCount: rawCacheTokens });
    for (const chunk of finishChunks) {
      res.write(chunk);
      clientChunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
    res.end();
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    finishReason,
    rawInputTokens,
    rawOutputTokens,
    rawCacheTokens,
    upstreamResponseBody: upstreamChunks.join('\n'),
    clientResponseBody: clientChunks.join(''),
  };
}

/**
 * Kiro SSE → Claude SSE 响应处理器
 *
 * 核心功能：
 * 1. 解析 AWS SSE 事件格式
 * 2. 提取 thinking 内容（<thinking>...</thinking> 标签）
 * 3. 转换为 Claude SSE 事件
 * 4. 处理工具调用
 */

import type { Response } from 'express';
import type { Usage, ContentBlock, ClaudeResponse } from '../../types.js';
import { logger } from '../../../../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ==================== 流式响应处理 ====================

export interface KiroStreamingOptions {
  sessionId: string;
  modelName: string;
  messageCount: number;
  inputTokens?: number;
}

export interface KiroSSEStreamResult {
  inputTokens: number;
  outputTokens: number;
  finishReason?: string;
  upstreamResponseBody: string;
  clientResponseBody: string;
}

/**
 * Kiro 流式状态机
 */
class KiroStreamingState {
  // 块状态
  private blockType: 'none' | 'text' | 'thinking' | 'function' = 'none';
  private blockIndex = 0;
  private messageStartSent = false;
  private messageStopSent = false;
  private usedTool = false;

  // Thinking 解析状态
  private inThinking = false;
  private thinkingBuffer = '';
  private textBuffer = '';
  private pendingBuffer = ''; // 用于缓冲可能是标签的内容
  private thinkingBlockProcessed = false; // thinking 块只在开头处理一次

  // 配置
  private readonly messageId: string;
  private readonly modelName: string;
  private readonly thinkingSignature: string;

  // 追踪内容
  hasThinking = false;
  hasContent = false;

  constructor(options: KiroStreamingOptions) {
    this.messageId = `msg_${uuidv4()}`;
    this.modelName = options.modelName;
    // 生成 thinking 块签名（模拟 Anthropic API 的签名格式）
    this.thinkingSignature = `sig_${uuidv4().replace(/-/g, '').slice(0, 32)}`;
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
  emitMessageStart(): string {
    if (this.messageStartSent) {
      return '';
    }

    const message = {
      id: this.messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: this.modelName,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
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
   * 处理文本内容（解析 thinking 标签）
   *
   * 使用缓冲策略处理标签可能被拆分到多个 chunk 的情况：
   * - pendingBuffer: 缓冲可能是标签开始的内容（以 < 开头）
   * - 当缓冲内容足够判断是否是标签时，做相应处理
   */
  processContent(content: string): string[] {
    const chunks: string[] = [];

    // 确保发送了 message_start
    if (!this.messageStartSent) {
      chunks.push(this.emitMessageStart());
    }

    // 将新内容追加到待处理缓冲区
    this.pendingBuffer += content;

    // 处理缓冲区内容
    while (this.pendingBuffer.length > 0) {
      // 如果还没开始 thinking 块，检测 <thinking> 开始标签
      if (!this.inThinking && !this.thinkingBlockProcessed) {
        // 跳过开头的空白字符
        const trimmed = this.pendingBuffer.trimStart();
        const whitespaceLen = this.pendingBuffer.length - trimmed.length;

        // 检查是否以 <thinking> 开头
        if (trimmed.startsWith('<thinking>')) {
          // 找到 thinking 开始标签
          this.pendingBuffer = trimmed.substring('<thinking>'.length);
          this.inThinking = true;
          logger.debug('Detected <thinking> tag at start');
          continue;
        }

        // 检查是否可能是不完整的 <thinking> 标签
        if (trimmed.length < '<thinking>'.length && '<thinking>'.startsWith(trimmed)) {
          // 可能是不完整的标签，等待更多内容
          break;
        }

        // 不是 thinking 标签，标记已处理（后续不再检测开始标签）
        this.thinkingBlockProcessed = true;
        // 恢复被跳过的空白
        if (whitespaceLen > 0) {
          this.textBuffer += this.pendingBuffer.substring(0, whitespaceLen);
        }
        this.pendingBuffer = trimmed;
      }

      // 如果在 thinking 块内，检测 </thinking> 结束标签
      if (this.inThinking) {
        const closeIndex = this.pendingBuffer.indexOf('</thinking>');

        if (closeIndex !== -1) {
          // 找到结束标签
          this.thinkingBuffer += this.pendingBuffer.substring(0, closeIndex);
          this.pendingBuffer = this.pendingBuffer.substring(closeIndex + '</thinking>'.length);
          this.inThinking = false;
          this.thinkingBlockProcessed = true;

          // 输出 thinking 块
          if (this.thinkingBuffer) {
            chunks.push(...this.outputThinking(this.thinkingBuffer));
            this.thinkingBuffer = '';
          }
          logger.debug('Detected </thinking> tag, thinking block completed');
          continue;
        }

        // 检查缓冲区末尾是否可能是不完整的 </thinking>
        const potentialCloseTag = this.pendingBuffer.slice(-'</thinking>'.length + 1);
        if ('</thinking>'.startsWith(potentialCloseTag) && potentialCloseTag.startsWith('<')) {
          // 保留可能是标签的部分，其余累积到 thinkingBuffer
          const safeLen = this.pendingBuffer.length - potentialCloseTag.length;
          if (safeLen > 0) {
            this.thinkingBuffer += this.pendingBuffer.substring(0, safeLen);
            this.pendingBuffer = this.pendingBuffer.substring(safeLen);
          }
          break;
        }

        // 没有找到结束标签，全部累积到 thinkingBuffer
        this.thinkingBuffer += this.pendingBuffer;
        this.pendingBuffer = '';
        break;
      }

      // 不在 thinking 块内，累积到 textBuffer
      this.textBuffer += this.pendingBuffer;
      this.pendingBuffer = '';
      break;
    }

    // 实时输出累积的内容（流式场景，超过 100 字符时输出）
    if (this.textBuffer.length > 100) {
      chunks.push(...this.outputText(this.textBuffer));
      this.textBuffer = '';
    }
    if (this.thinkingBuffer.length > 100) {
      chunks.push(...this.outputThinkingDelta(this.thinkingBuffer));
      this.thinkingBuffer = '';
    }

    return chunks;
  }

  /**
   * 输出文本内容
   */
  private outputText(text: string): string[] {
    const chunks: string[] = [];

    if (!text) return chunks;

    // 开始或继续 text 块
    if (this.blockType !== 'text') {
      chunks.push(...this.startBlock('text', { type: 'text', text: '' }));
    }

    chunks.push(this.emitDelta('text_delta', { text }));
    this.hasContent = true;

    return chunks;
  }

  /**
   * 输出 thinking 内容（完整块，或在已有 thinking 块时追加）
   */
  private outputThinking(thinking: string): string[] {
    const chunks: string[] = [];

    if (!thinking) return chunks;

    // 如果当前已经是 thinking 块，直接输出 delta 然后关闭
    if (this.blockType === 'thinking') {
      chunks.push(this.emitDelta('thinking_delta', { thinking }));
      chunks.push(...this.endBlock());
      this.hasThinking = true;
      return chunks;
    }

    // 关闭其他类型的块
    if (this.blockType !== 'none') {
      chunks.push(...this.endBlock());
    }

    // 开始 thinking 块（包含 signature）
    chunks.push(
      ...this.startBlock('thinking', {
        type: 'thinking',
        thinking: '',
        signature: this.thinkingSignature,
      })
    );
    chunks.push(this.emitDelta('thinking_delta', { thinking }));
    chunks.push(...this.endBlock());

    this.hasThinking = true;

    return chunks;
  }

  /**
   * 输出 thinking delta（流式场景）
   */
  private outputThinkingDelta(thinking: string): string[] {
    const chunks: string[] = [];

    if (!thinking) return chunks;

    // 开始或继续 thinking 块
    if (this.blockType !== 'thinking') {
      chunks.push(
        ...this.startBlock('thinking', {
          type: 'thinking',
          thinking: '',
          signature: this.thinkingSignature,
        })
      );
    }

    chunks.push(this.emitDelta('thinking_delta', { thinking }));
    this.hasThinking = true;

    return chunks;
  }

  /**
   * 处理工具调用
   */
  processToolUse(toolUseId: string, toolName: string, input: unknown): string[] {
    const chunks: string[] = [];

    // 确保发送了 message_start
    if (!this.messageStartSent) {
      chunks.push(this.emitMessageStart());
    }

    // 先输出累积的内容
    if (this.textBuffer) {
      chunks.push(...this.outputText(this.textBuffer));
      this.textBuffer = '';
    }
    if (this.thinkingBuffer) {
      chunks.push(...this.outputThinking(this.thinkingBuffer));
      this.thinkingBuffer = '';
    }

    // 关闭当前块
    chunks.push(...this.endBlock());

    this.usedTool = true;

    // 开始 tool_use 块
    const toolUseBlock = {
      type: 'tool_use',
      id: toolUseId,
      name: toolName,
      input: {},
    };

    chunks.push(...this.startBlock('function', toolUseBlock));

    // 发送参数 delta
    const inputJson = typeof input === 'string' ? input : JSON.stringify(input);
    chunks.push(this.emitDelta('input_json_delta', { partial_json: inputJson }));

    // 结束块
    chunks.push(...this.endBlock());

    this.hasContent = true;

    return chunks;
  }

  /**
   * 刷新剩余缓冲区
   */
  flush(): string[] {
    const chunks: string[] = [];

    // 输出剩余的 thinking
    if (this.thinkingBuffer) {
      if (this.blockType === 'thinking') {
        chunks.push(this.emitDelta('thinking_delta', { thinking: this.thinkingBuffer }));
      } else {
        chunks.push(...this.outputThinking(this.thinkingBuffer));
      }
      this.thinkingBuffer = '';
    }

    // 输出剩余的文本
    if (this.textBuffer) {
      chunks.push(...this.outputText(this.textBuffer));
      this.textBuffer = '';
    }

    return chunks;
  }

  /**
   * 发送结束事件
   */
  emitFinish(inputTokens: number, outputTokens: number): string[] {
    const chunks: string[] = [];

    // 刷新缓冲区
    chunks.push(...this.flush());

    // 关闭当前块
    chunks.push(...this.endBlock());

    // 确定 stop_reason
    let stopReason = 'end_turn';
    if (this.usedTool) {
      stopReason = 'tool_use';
    }

    const usage: Usage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };

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

/**
 * 处理 Kiro SSE 流并转发给客户端
 */
export async function handleKiroSSEStream(
  readable: ReadableStream<Uint8Array>,
  res: Response,
  options: KiroStreamingOptions
): Promise<KiroSSEStreamResult> {
  const state = new KiroStreamingState(options);
  const decoder = new TextDecoder();
  const reader = readable.getReader();

  let buffer = '';
  let inputTokens = options.inputTokens ?? 0;
  let outputTokens = 0;
  let finishReason: string | undefined;

  // 收集上游原始响应和客户端响应
  const upstreamChunks: string[] = [];
  const clientChunks: string[] = [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      upstreamChunks.push(chunk);
      buffer += chunk;

      // 从二进制 AWS SSE 格式中提取 JSON（使用正则表达式）
      const jsonMatches = buffer.match(/\{"[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];

      for (const jsonStr of jsonMatches) {
        try {
          const json = JSON.parse(jsonStr);
          let content = '';

          // assistantResponseEvent
          if (json.assistantResponseEvent?.content) {
            content = json.assistantResponseEvent.content;
          }
          // 直接的 content 字段
          else if (json.content && typeof json.content === 'string') {
            content = json.content;
          }

          if (content) {
            const chunks = state.processContent(content);
            for (const c of chunks) {
              res.write(c);
              clientChunks.push(c);
            }
            outputTokens += Math.ceil(content.length / 4);
          }

          // codeEvent（工具调用）
          if (json.codeEvent?.content) {
            try {
              const toolData = JSON.parse(json.codeEvent.content);
              if (toolData.tool_use_id && toolData.name) {
                const chunks = state.processToolUse(
                  toolData.tool_use_id,
                  toolData.name,
                  toolData.input
                );
                for (const c of chunks) {
                  res.write(c);
                  clientChunks.push(c);
                }
              }
            } catch {
              // 不是工具调用，作为文本处理
              const chunks = state.processContent(json.codeEvent.content);
              for (const c of chunks) {
                res.write(c);
                clientChunks.push(c);
              }
            }
          }
        } catch {
          // 跳过无效的 JSON
        }
      }

      // 清空已处理的 buffer（保留最后一部分以防 JSON 被截断）
      const lastBrace = buffer.lastIndexOf('}');
      if (lastBrace > 0) {
        buffer = buffer.substring(lastBrace + 1);
      }
    }

    // 发送结束事件
    const finishChunks = state.emitFinish(inputTokens, outputTokens);
    for (const chunk of finishChunks) {
      res.write(chunk);
      clientChunks.push(chunk);
    }

    finishReason = 'end_turn';
  } finally {
    reader.releaseLock();
    res.end();
  }

  return {
    inputTokens,
    outputTokens,
    finishReason,
    upstreamResponseBody: upstreamChunks.join(''),
    clientResponseBody: clientChunks.join(''),
  };
}

// ==================== 非流式响应处理 ====================

export interface KiroNonStreamingOptions {
  sessionId: string;
  modelName: string;
  messageCount: number;
  inputTokens?: number;
}

/**
 * 转换非流式 Kiro 响应为 Claude 格式
 *
 * Kiro 返回的是二进制 AWS SSE 格式，需要提取其中的 JSON
 */
export async function transformKiroResponse(
  kiroResponseText: string,
  options: KiroNonStreamingOptions
): Promise<ClaudeResponse> {
  const contentBlocks: ContentBlock[] = [];
  let hasToolCall = false;
  let fullText = '';

  // 从二进制 AWS SSE 格式中提取所有 JSON 内容
  try {
    // 使用正则表达式提取所有 JSON 对象
    const jsonMatches = kiroResponseText.match(/\{"[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];

    for (const jsonStr of jsonMatches) {
      try {
        const json = JSON.parse(jsonStr);

        // assistantResponseEvent
        if (json.assistantResponseEvent?.content) {
          fullText += json.assistantResponseEvent.content;
        }
        // 直接的 content 字段
        else if (json.content && typeof json.content === 'string') {
          fullText += json.content;
        }
        // codeEvent（工具调用）
        else if (json.codeEvent?.content) {
          try {
            const toolData = JSON.parse(json.codeEvent.content);
            if (toolData.tool_use_id && toolData.name) {
              hasToolCall = true;
              contentBlocks.push({
                type: 'tool_use',
                id: toolData.tool_use_id,
                name: toolData.name,
                input: toolData.input || {},
              });
            }
          } catch {
            fullText += json.codeEvent.content;
          }
        }
      } catch {
        // 跳过无效的 JSON
      }
    }

    // 解析 thinking 标签
    if (fullText) {
      const { thinking, text } = extractThinkingFromText(fullText);

      if (thinking) {
        // 生成 thinking 块签名（模拟 Anthropic API 的签名格式）
        const thinkingSignature = `sig_${uuidv4().replace(/-/g, '').slice(0, 32)}`;
        contentBlocks.push({
          type: 'thinking',
          thinking,
          signature: thinkingSignature,
        });
      }

      if (text) {
        contentBlocks.push({
          type: 'text',
          text,
        });
      }
    }
  } catch (e) {
    logger.error({ error: e, responseText: kiroResponseText.substring(0, 500) }, 'Failed to parse Kiro response');
  }

  // 确定 stop_reason
  const stopReason = hasToolCall ? 'tool_use' : 'end_turn';

  // 简单估算 token
  const totalText = contentBlocks
    .map((b) => {
      if ('text' in b) return b.text;
      if ('thinking' in b) return b.thinking;
      return '';
    })
    .join('');

  const usage: Usage = {
    input_tokens: options.inputTokens ?? 0, // 近似估算
    output_tokens: Math.ceil(totalText.length / 4),
  };

  return {
    id: `msg_${uuidv4()}`,
    type: 'message',
    role: 'assistant',
    model: options.modelName,
    content: contentBlocks,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  };
}

/**
 * 从文本中提取 thinking 内容
 */
function extractThinkingFromText(text: string): { thinking: string; text: string } {
  const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);

  if (thinkingMatch) {
    const thinking = thinkingMatch[1];
    const remainingText = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
    return { thinking, text: remainingText };
  }

  return { thinking: '', text };
}

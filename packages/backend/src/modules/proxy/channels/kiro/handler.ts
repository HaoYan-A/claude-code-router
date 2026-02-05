/**
 * Kiro SSE → Claude SSE 响应处理器
 *
 * 核心功能：
 * 1. 解析 AWS SSE 事件格式（参考 kiro-gateway/parsers.py）
 * 2. 提取 thinking 内容（<thinking>...</thinking> 标签）
 * 3. 转换为 Claude SSE 事件
 * 4. 处理工具调用（结构化格式 + 文本格式）
 */

import type { Response } from 'express';
import type { Usage, ContentBlock, ClaudeResponse } from '../../types.js';
import { logger } from '../../../../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

// ==================== AWS Event Stream Parser ====================

/**
 * 工具调用接口
 */
interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

/**
 * 解析后的事件
 */
interface ParsedEvent {
  type: 'content' | 'tool_start' | 'tool_input' | 'tool_stop' | 'usage' | 'context_usage';
  data: unknown;
}

/**
 * AWS Event Stream 解析器
 *
 * 参考 kiro-gateway/parsers.py 的 AwsEventStreamParser
 */
class AwsEventStreamParser {
  private buffer = '';
  private lastContent: string | null = null;
  private currentToolCall: ToolCall | null = null;
  private toolCalls: ToolCall[] = [];

  // 事件模式匹配
  private static readonly EVENT_PATTERNS: [string, ParsedEvent['type']][] = [
    ['{"content":', 'content'],
    ['{"name":', 'tool_start'],
    ['{"input":', 'tool_input'],
    ['{"stop":', 'tool_stop'],
    ['{"usage":', 'usage'],
    ['{"contextUsagePercentage":', 'context_usage'],
  ];

  /**
   * 找到匹配的右大括号位置
   */
  private findMatchingBrace(text: string, startPos: number): number {
    if (startPos >= text.length || text[startPos] !== '{') {
      return -1;
    }

    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startPos; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }

    return -1;
  }

  /**
   * 处理输入的数据块
   */
  feed(chunk: string): ParsedEvent[] {
    this.buffer += chunk;
    const events: ParsedEvent[] = [];

    while (true) {
      // 找到最早出现的事件模式
      let earliestPos = -1;
      let earliestType: ParsedEvent['type'] | null = null;

      for (const [pattern, eventType] of AwsEventStreamParser.EVENT_PATTERNS) {
        const pos = this.buffer.indexOf(pattern);
        if (pos !== -1 && (earliestPos === -1 || pos < earliestPos)) {
          earliestPos = pos;
          earliestType = eventType;
        }
      }

      if (earliestPos === -1 || earliestType === null) {
        break;
      }

      // 找到 JSON 结束位置
      const jsonEnd = this.findMatchingBrace(this.buffer, earliestPos);
      if (jsonEnd === -1) {
        // JSON 不完整，等待更多数据
        break;
      }

      const jsonStr = this.buffer.slice(earliestPos, jsonEnd + 1);
      this.buffer = this.buffer.slice(jsonEnd + 1);

      try {
        const data = JSON.parse(jsonStr);
        const event = this.processEvent(data, earliestType);
        if (event) {
          events.push(event);
        }
      } catch {
        logger.warn({ jsonStr: jsonStr.slice(0, 100) }, 'Failed to parse Kiro JSON');
      }
    }

    return events;
  }

  /**
   * 处理解析后的事件
   */
  private processEvent(data: Record<string, unknown>, eventType: ParsedEvent['type']): ParsedEvent | null {
    switch (eventType) {
      case 'content':
        return this.processContentEvent(data);
      case 'tool_start':
        return this.processToolStartEvent(data);
      case 'tool_input':
        return this.processToolInputEvent(data);
      case 'tool_stop':
        return this.processToolStopEvent(data);
      case 'usage':
        return { type: 'usage', data: data.usage };
      case 'context_usage':
        return { type: 'context_usage', data: data.contextUsagePercentage };
      default:
        return null;
    }
  }

  private processContentEvent(data: Record<string, unknown>): ParsedEvent | null {
    const content = data.content as string || '';

    // 跳过 followupPrompt
    if (data.followupPrompt) {
      return null;
    }

    // 去重重复内容
    if (content === this.lastContent) {
      return null;
    }

    this.lastContent = content;
    return { type: 'content', data: content };
  }

  private processToolStartEvent(data: Record<string, unknown>): ParsedEvent | null {
    // 完成之前的工具调用
    if (this.currentToolCall) {
      this.finalizeToolCall();
    }

    // input 可以是字符串或对象
    const inputData = data.input;
    let inputStr: string;
    if (typeof inputData === 'object' && inputData !== null) {
      inputStr = JSON.stringify(inputData);
    } else {
      inputStr = inputData ? String(inputData) : '';
    }

    this.currentToolCall = {
      id: (data.toolUseId as string) || `toolu_${uuidv4().replace(/-/g, '').slice(0, 24)}`,
      name: (data.name as string) || '',
      arguments: inputStr,
    };

    // 如果同时有 stop，立即完成
    if (data.stop) {
      this.finalizeToolCall();
    }

    return null;
  }

  private processToolInputEvent(data: Record<string, unknown>): ParsedEvent | null {
    if (this.currentToolCall) {
      const inputData = data.input;
      let inputStr: string;
      if (typeof inputData === 'object' && inputData !== null) {
        inputStr = JSON.stringify(inputData);
      } else {
        inputStr = inputData ? String(inputData) : '';
      }
      this.currentToolCall.arguments += inputStr;
    }
    return null;
  }

  private processToolStopEvent(data: Record<string, unknown>): ParsedEvent | null {
    if (this.currentToolCall && data.stop) {
      this.finalizeToolCall();
    }
    return null;
  }

  private finalizeToolCall(): void {
    if (!this.currentToolCall) {
      return;
    }

    // 尝试解析并规范化参数为 JSON
    let args = this.currentToolCall.arguments;
    if (args.trim()) {
      try {
        const parsed = JSON.parse(args);
        args = JSON.stringify(parsed);
      } catch {
        logger.warn({ toolName: this.currentToolCall.name, args: args.slice(0, 200) }, 'Failed to parse tool arguments');
        args = '{}';
      }
    } else {
      args = '{}';
    }

    this.currentToolCall.arguments = args;
    this.toolCalls.push(this.currentToolCall);
    this.currentToolCall = null;
  }

  /**
   * 获取所有已完成的工具调用
   */
  getToolCalls(): ToolCall[] {
    if (this.currentToolCall) {
      this.finalizeToolCall();
    }
    return this.deduplicateToolCalls(this.toolCalls);
  }

  /**
   * 工具调用去重
   */
  private deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    const byId = new Map<string, ToolCall>();

    for (const tc of toolCalls) {
      const existing = byId.get(tc.id);
      if (!existing) {
        byId.set(tc.id, tc);
      } else {
        // 保留参数更多的那个
        if (tc.arguments !== '{}' && (existing.arguments === '{}' || tc.arguments.length > existing.arguments.length)) {
          byId.set(tc.id, tc);
        }
      }
    }

    // 按 name+arguments 再次去重
    const seen = new Set<string>();
    const unique: ToolCall[] = [];

    for (const tc of byId.values()) {
      const key = `${tc.name}-${tc.arguments}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(tc);
      }
    }

    return unique;
  }
}

/**
 * 解析文本中的 bracket 格式工具调用
 * 格式: [Called func_name with args: {...}]
 */
function parseBracketToolCalls(text: string): ToolCall[] {
  if (!text || !text.includes('[Called')) {
    return [];
  }

  const toolCalls: ToolCall[] = [];
  const pattern = /\[Called\s+(\w+)\s+with\s+args:\s*/gi;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const funcName = match[1];
    const argsStart = match.index + match[0].length;

    // 找到 JSON 开始
    const jsonStart = text.indexOf('{', argsStart);
    if (jsonStart === -1) continue;

    // 找到匹配的右大括号
    const jsonEnd = findMatchingBrace(text, jsonStart);
    if (jsonEnd === -1) continue;

    const jsonStr = text.slice(jsonStart, jsonEnd + 1);

    try {
      const args = JSON.parse(jsonStr);
      toolCalls.push({
        id: `toolu_${uuidv4().replace(/-/g, '').slice(0, 24)}`,
        name: funcName,
        arguments: JSON.stringify(args),
      });
    } catch {
      logger.warn({ funcName, jsonStr: jsonStr.slice(0, 100) }, 'Failed to parse bracket tool call');
    }
  }

  return toolCalls;
}

function findMatchingBrace(text: string, startPos: number): number {
  if (startPos >= text.length || text[startPos] !== '{') {
    return -1;
  }

  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startPos; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return i;
        }
      }
    }
  }

  return -1;
}

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
  const parser = new AwsEventStreamParser();
  const decoder = new TextDecoder();
  const reader = readable.getReader();

  let inputTokens = options.inputTokens ?? 0;
  let outputTokens = 0;
  let finishReason: string | undefined;
  let fullContent = ''; // 用于解析 bracket 格式工具调用

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

      // 使用 AwsEventStreamParser 解析事件
      const events = parser.feed(chunk);

      for (const event of events) {
        if (event.type === 'content') {
          const content = event.data as string;
          fullContent += content;

          const chunks = state.processContent(content);
          for (const c of chunks) {
            res.write(c);
            clientChunks.push(c);
          }
          outputTokens += Math.ceil(content.length / 4);
        }
      }
    }

    // 检查文本中的 bracket 格式工具调用
    const bracketToolCalls = parseBracketToolCalls(fullContent);

    // 获取结构化工具调用
    const structuredToolCalls = parser.getToolCalls();

    // 合并所有工具调用（去重）
    const allToolCalls = deduplicateToolCalls([...structuredToolCalls, ...bracketToolCalls]);

    // 输出工具调用
    for (const tc of allToolCalls) {
      let input: unknown;
      try {
        input = JSON.parse(tc.arguments);
      } catch {
        input = {};
      }

      const chunks = state.processToolUse(tc.id, tc.name, input);
      for (const c of chunks) {
        res.write(c);
        clientChunks.push(c);
      }
    }

    // 发送结束事件
    const finishChunks = state.emitFinish(inputTokens, outputTokens);
    for (const chunk of finishChunks) {
      res.write(chunk);
      clientChunks.push(chunk);
    }

    finishReason = allToolCalls.length > 0 ? 'tool_use' : 'end_turn';
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

/**
 * 工具调用去重
 */
function deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const byId = new Map<string, ToolCall>();

  for (const tc of toolCalls) {
    const existing = byId.get(tc.id);
    if (!existing) {
      byId.set(tc.id, tc);
    } else {
      if (tc.arguments !== '{}' && (existing.arguments === '{}' || tc.arguments.length > existing.arguments.length)) {
        byId.set(tc.id, tc);
      }
    }
  }

  const seen = new Set<string>();
  const unique: ToolCall[] = [];

  for (const tc of byId.values()) {
    const key = `${tc.name}-${tc.arguments}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tc);
    }
  }

  return unique;
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

  // 使用 AwsEventStreamParser 解析
  const parser = new AwsEventStreamParser();
  const events = parser.feed(kiroResponseText);

  for (const event of events) {
    if (event.type === 'content') {
      fullText += event.data as string;
    }
  }

  // 获取结构化工具调用
  const structuredToolCalls = parser.getToolCalls();

  // 检查 bracket 格式工具调用
  const bracketToolCalls = parseBracketToolCalls(fullText);

  // 合并所有工具调用
  const allToolCalls = deduplicateToolCalls([...structuredToolCalls, ...bracketToolCalls]);

  // 解析 thinking 标签
  if (fullText) {
    const { thinking, text } = extractThinkingFromText(fullText);

    if (thinking) {
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

  // 添加工具调用
  for (const tc of allToolCalls) {
    hasToolCall = true;
    let input: unknown;
    try {
      input = JSON.parse(tc.arguments);
    } catch {
      input = {};
    }

    contentBlocks.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.name,
      input: input as Record<string, unknown>,
    });
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
    input_tokens: options.inputTokens ?? 0,
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

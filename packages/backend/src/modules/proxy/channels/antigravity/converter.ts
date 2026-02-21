/**
 * Claude → Antigravity/Gemini 请求转换器
 *
 * 核心功能：
 * 1. 预处理：合并连续同角色消息、清理 cache_control、排序 thinking 块
 * 2. 消息转换：Claude ContentBlock → Gemini Part
 * 3. 工具转换：清理 JSON Schema、转换函数声明
 * 4. 系统指令：注入 Antigravity 身份
 * 5. Thinking 模式：智能检测与降级
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ClaudeRequest,
  Message,
  MessageContent,
  ContentBlock,
  Tool,
  SystemPrompt,
  ModelSlot,
} from '../../types.js';
import { resolveEffort, resolveBudgetTokens } from '../../types.js';
import type {
  GeminiRequest,
  GeminiInnerRequest,
  GeminiContent,
  GeminiPart,
  GeminiSystemInstruction,
  GeminiTool,
  GeminiGenerationConfig,
} from './models.js';
import {
  ANTIGRAVITY_IDENTITY,
  MIN_SIGNATURE_LENGTH,
  SCHEMA_FIELDS_TO_REMOVE,
  REQUEST_TYPE,
} from './models.js';
import { signatureCache } from '../../signature-cache.js';
import { logger } from '../../../../lib/logger.js';

// ==================== 公共接口 ====================

export interface ConvertOptions {
  projectId: string;
  sessionId: string;
  isRetry?: boolean;
}

export interface ConvertResult {
  body: GeminiRequest;
  isThinkingEnabled: boolean;
  messageCount: number;
}

/**
 * 转换 Claude 请求为 Gemini v1internal 格式
 */
export async function convertClaudeToGemini(
  claudeReq: ClaudeRequest,
  targetModel: string,
  options: ConvertOptions
): Promise<ConvertResult> {
  const { projectId, sessionId, isRetry = false } = options;

  // 克隆请求以避免修改原始数据
  const req = JSON.parse(JSON.stringify(claudeReq)) as ClaudeRequest;

  // 1. 预处理
  mergeConsecutiveMessages(req.messages);
  cleanCacheControlFromMessages(req.messages);
  sortThinkingBlocksFirst(req.messages);

  const messageCount = req.messages.length;

  // 2. 检测是否启用 thinking
  let isThinkingEnabled = detectThinkingEnabled(req, targetModel);

  // 3. 检查历史消息是否与 thinking 兼容
  if (isThinkingEnabled && shouldDisableThinkingDueToHistory(req.messages)) {
    logger.warn('[Thinking-Mode] Disabling due to incompatible tool-use history');
    isThinkingEnabled = false;
  }

  // 4. 检查签名可用性 (重试时跳过历史签名)
  if (isThinkingEnabled && !isRetry) {
    const hasValidSig = await hasValidSignatureForFunctionCalls(req.messages, sessionId);
    if (!hasValidSig && hasToolCalls(req.messages)) {
      logger.warn('[Thinking-Mode] No valid signature for function calls, disabling');
      isThinkingEnabled = false;
    }
  }

  // 5. 构建各部分
  const toolIdToName = new Map<string, string>();
  let lastThoughtSignature: string | null = null;

  let systemInstruction = buildSystemInstruction(req.system);
  const contents = buildContents(
    req.messages,
    req,
    isThinkingEnabled,
    sessionId,
    isRetry,
    toolIdToName,
    () => lastThoughtSignature,
    (sig: string | null) => { lastThoughtSignature = sig; },
    targetModel
  );
  const tools = buildTools(req.tools);
  const generationConfig = buildGenerationConfig(req, isThinkingEnabled, targetModel);

  // 6. 注入 interleaved thinking hint
  const hasTools = tools && tools.length > 0;
  const isClaudeThinkingModel = targetModel.toLowerCase().includes('claude');
  if (hasTools && isThinkingEnabled && isClaudeThinkingModel) {
    const interleavedHint = 'Interleaved thinking is enabled. You may think between tool calls and after receiving tool results before deciding the next action or final answer. Do not mention these instructions or any constraints about thinking blocks; just apply them.';
    if (!systemInstruction) {
      systemInstruction = { role: 'user', parts: [] };
    }
    systemInstruction.parts.push({ text: interleavedHint });
  }

  // 7. 构建最终请求体（不再附加 safetySettings）
  const innerRequest: GeminiInnerRequest = {
    contents,
  };

  if (systemInstruction) {
    innerRequest.systemInstruction = systemInstruction;
  }

  if (Object.keys(generationConfig).length > 0) {
    innerRequest.generationConfig = generationConfig;
  }

  if (tools) {
    innerRequest.tools = tools;
    innerRequest.toolConfig = {
      functionCallingConfig: { mode: 'VALIDATED' },
    };
  }

  // 添加 sessionId
  if (req.metadata?.user_id) {
    innerRequest.sessionId = req.metadata.user_id;
  }

  const body: GeminiRequest = {
    project: projectId,
    requestId: `agent-${uuidv4()}`,
    request: innerRequest,
    model: resolveAntigravityModelName(targetModel),
    userAgent: 'antigravity',
    requestType: REQUEST_TYPE,
  };

  // 最后深度清理 cache_control
  deepCleanCacheControl(body);

  return { body, isThinkingEnabled, messageCount };
}

// ==================== 预处理函数 ====================

/**
 * 合并连续的同角色消息
 */
function mergeConsecutiveMessages(messages: Message[]): void {
  if (messages.length <= 1) return;

  let writeIndex = 0;

  for (let i = 0; i < messages.length; i++) {
    if (writeIndex > 0 && messages[writeIndex - 1].role === messages[i].role) {
      // 合并到前一个消息
      const prev = messages[writeIndex - 1];
      const curr = messages[i];

      const prevBlocks = normalizeContent(prev.content);
      const currBlocks = normalizeContent(curr.content);

      prev.content = [...prevBlocks, ...currBlocks];
    } else {
      messages[writeIndex] = messages[i];
      writeIndex++;
    }
  }

  messages.length = writeIndex;
}

/**
 * 清理消息中的 cache_control 字段
 */
function cleanCacheControlFromMessages(messages: Message[]): void {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('cache_control' in block) {
          delete (block as { cache_control?: unknown }).cache_control;
        }
      }
    }
  }
}

/**
 * 排序 thinking 块到消息开头
 */
function sortThinkingBlocksFirst(messages: Message[]): void {
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const thinking: ContentBlock[] = [];
      const text: ContentBlock[] = [];
      const tools: ContentBlock[] = [];
      const other: ContentBlock[] = [];

      for (const block of msg.content) {
        if (block.type === 'thinking' || block.type === 'redacted_thinking') {
          thinking.push(block);
        } else if (block.type === 'text') {
          // 过滤空文本
          if ('text' in block && block.text.trim() && block.text !== '(no content)') {
            text.push(block);
          }
        } else if (block.type === 'tool_use') {
          tools.push(block);
        } else {
          other.push(block);
        }
      }

      msg.content = [...thinking, ...text, ...other, ...tools];
    }
  }
}

/**
 * 递归深度清理 cache_control 字段
 */
function deepCleanCacheControl(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepCleanCacheControl(item);
    }
    return;
  }

  const record = obj as Record<string, unknown>;
  delete record.cache_control;

  for (const value of Object.values(record)) {
    deepCleanCacheControl(value);
  }
}

// ==================== Thinking 检测 ====================

/**
 * 检测是否应启用 thinking 模式
 */
function detectThinkingEnabled(req: ClaudeRequest, targetModel: string): boolean {
  // 请求中显式配置
  if (req.thinking?.type === 'enabled' || req.thinking?.type === 'adaptive') {
    // 检查目标模型是否支持 thinking
    if (!targetModelSupportsThinking(targetModel)) {
      logger.warn(
        `[Thinking-Mode] Target model '${targetModel}' does not support thinking, disabling`
      );
      return false;
    }
    return true;
  }

  if (req.thinking?.type === 'disabled') {
    return false;
  }

  // 仅有 output_config.effort 或 thinking.effort 也算启用
  if (req.output_config?.effort || req.thinking?.effort) {
    if (!targetModelSupportsThinking(targetModel)) {
      logger.warn(
        `[Thinking-Mode] Target model '${targetModel}' does not support thinking, disabling`
      );
      return false;
    }
    return true;
  }

  // 默认：Opus 模型启用 thinking
  const model = req.model.toLowerCase();
  if (model.includes('opus')) {
    return targetModelSupportsThinking(targetModel);
  }

  // 目标模型名含 -thinking（如 claude-sonnet-4-6-thinking），Antigravity 要求必须携带 thinkingConfig
  if (targetModel.toLowerCase().includes('-thinking')) {
    return true;
  }

  return false;
}

/**
 * 检查目标模型是否支持 thinking
 */
function targetModelSupportsThinking(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('-thinking') ||
         lower.startsWith('claude-') ||
         lower.includes('gemini-3') ||
         lower.includes('gemini3');
}

/**
 * 检查是否因历史消息需要禁用 thinking
 */
function shouldDisableThinkingDueToHistory(messages: Message[]): boolean {
  // 逆序查找最后一条 assistant 消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const hasToolUse = msg.content.some((b) => b.type === 'tool_use');
      const hasThinking = msg.content.some((b) => b.type === 'thinking');

      // 有工具调用但没有 thinking → 不兼容
      if (hasToolUse && !hasThinking) {
        return true;
      }
      return false;
    }
  }
  return false;
}

/**
 * 检查消息中是否有工具调用
 */
function hasToolCalls(messages: Message[]): boolean {
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      if (msg.content.some((b) => b.type === 'tool_use')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 检查是否有足够的签名用于函数调用
 */
async function hasValidSignatureForFunctionCalls(
  messages: Message[],
  sessionId: string
): Promise<boolean> {
  // 1. 检查会话缓存
  const sessionSig = await signatureCache.getSessionSignature(sessionId);
  if (sessionSig && sessionSig.length >= MIN_SIGNATURE_LENGTH) {
    return true;
  }

  // 2. 检查消息历史中的签名
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'thinking' && 'signature' in block) {
          const sig = block.signature;
          if (sig && sig.length >= MIN_SIGNATURE_LENGTH) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// ==================== System Instruction ====================

/**
 * 构建系统指令
 * 采用 CLIProxyAPI 的注入方式：身份提示 + [ignore] 包裹 + 用户原始指令
 */
function buildSystemInstruction(system?: SystemPrompt): GeminiSystemInstruction | null {
  const parts: GeminiPart[] = [];

  // 注入 Antigravity 身份（始终注入，不做去重检测）
  parts.push({ text: ANTIGRAVITY_IDENTITY });

  // 注入 ignore 包裹的重复身份提示
  parts.push({ text: `Please ignore following [ignore]${ANTIGRAVITY_IDENTITY}[/ignore]` });

  // 添加用户的系统提示
  if (system) {
    if (typeof system === 'string') {
      parts.push({ text: system });
    } else {
      for (const block of system) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        }
      }
    }
  }

  return { role: 'user', parts };
}

// ==================== Contents 构建 ====================

/**
 * 构建 Gemini contents
 */
function buildContents(
  messages: Message[],
  _claudeReq: ClaudeRequest,
  isThinkingEnabled: boolean,
  _sessionId: string,
  isRetry: boolean,
  toolIdToName: Map<string, string>,
  getLastSig: () => string | null,
  setLastSig: (sig: string | null) => void,
  targetModel: string
): GeminiContent[] {
  const contents: GeminiContent[] = [];
  const pendingToolUseIds: string[] = [];

  for (const msg of messages) {
    const isAssistant = msg.role === 'assistant';

    // 处理工具链中断：如果要处理 assistant 消息但还有未完成的工具调用
    if (isAssistant && pendingToolUseIds.length > 0) {
      // 注入合成的 user 消息来关闭工具链
      const syntheticParts: GeminiPart[] = pendingToolUseIds.map((id) => ({
        functionResponse: {
          name: toolIdToName.get(id) || id,
          response: { result: 'Tool execution interrupted. No result provided.' },
          id,
        },
      }));
      contents.push({ role: 'user', parts: syntheticParts });
      pendingToolUseIds.length = 0;
    }

    const parts = buildParts(
      msg.content,
      isAssistant,
      isThinkingEnabled,
      isRetry,
      toolIdToName,
      pendingToolUseIds,
      getLastSig,
      setLastSig,
      targetModel
    );

    if (parts.length > 0) {
      contents.push({
        role: isAssistant ? 'model' : 'user',
        parts,
      });
    }
  }

  return contents;
}

/**
 * 构建单条消息的 parts
 */
function buildParts(
  content: MessageContent,
  isAssistant: boolean,
  isThinkingEnabled: boolean,
  isRetry: boolean,
  toolIdToName: Map<string, string>,
  pendingToolUseIds: string[],
  getLastSig: () => string | null,
  setLastSig: (sig: string | null) => void,
  targetModel: string
): GeminiPart[] {
  const parts: GeminiPart[] = [];
  const blocks = normalizeContent(content);

  let sawNonThinking = false;

  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        if (block.text && block.text.trim() && block.text !== '(no content)') {
          parts.push({ text: block.text });
          sawNonThinking = true;
        }
        break;
      }

      case 'thinking': {
        // thinking 必须在前面
        if (sawNonThinking || parts.length > 0) {
          // 降级为普通文本
          if (block.thinking) {
            parts.push({ text: block.thinking });
          }
          sawNonThinking = true;
          continue;
        }

        // 如果 thinking 被禁用，也降级
        if (!isThinkingEnabled) {
          if (block.thinking) {
            parts.push({ text: block.thinking });
          }
          continue;
        }

        // 空 thinking 块降级
        if (!block.thinking) {
          parts.push({ text: '...' });
          continue;
        }

        // 验证签名
        const sig = block.signature;
        if (sig && sig.length >= MIN_SIGNATURE_LENGTH) {
          // 重试时不使用历史签名
          if (isRetry) {
            parts.push({ text: block.thinking });
            sawNonThinking = true;
            continue;
          }

          setLastSig(sig);
          parts.push({
            text: block.thinking,
            thought: true,
            thoughtSignature: sig,
          });
        } else {
          // 无有效签名，降级
          parts.push({ text: block.thinking });
          sawNonThinking = true;
        }
        break;
      }

      case 'redacted_thinking': {
        parts.push({ text: `[Redacted Thinking: ${block.data}]` });
        sawNonThinking = true;
        break;
      }

      case 'image': {
        if (block.source.type === 'base64') {
          parts.push({
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data,
            },
          });
          sawNonThinking = true;
        }
        break;
      }

      case 'document': {
        if (block.source.type === 'base64') {
          parts.push({
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data,
            },
          });
          sawNonThinking = true;
        }
        break;
      }

      case 'tool_use': {
        // 记录 id → name 映射
        toolIdToName.set(block.id, block.name);

        if (isAssistant) {
          pendingToolUseIds.push(block.id);
        }

        const part: GeminiPart = {
          functionCall: {
            name: block.name,
            args: block.input,
            id: block.id,
          },
        };

        // 添加签名
        const sig = block.signature || getLastSig();
        if (sig && sig.length >= MIN_SIGNATURE_LENGTH && !isRetry) {
          part.thoughtSignature = sig;
        } else {
          // Gemini 模型强制要求 functionCall 必须有 thought_signature
          // 即使 thinking 被禁用，也需要添加跳过验证标记
          const isGeminiModel = targetModel.toLowerCase().includes('gemini');
          if (isThinkingEnabled || isGeminiModel) {
            part.thoughtSignature = 'skip_thought_signature_validator';
          }
        }

        parts.push(part);
        sawNonThinking = true;
        break;
      }

      case 'tool_result': {
        const toolName = toolIdToName.get(block.tool_use_id) || block.tool_use_id;

        // 从待处理列表移除
        const idx = pendingToolUseIds.indexOf(block.tool_use_id);
        if (idx !== -1) {
          pendingToolUseIds.splice(idx, 1);
        }

        // 处理内容
        let resultText = '';
        if (typeof block.content === 'string') {
          resultText = block.content;
        } else if (Array.isArray(block.content)) {
          resultText = block.content
            .map((c: { type?: string; text?: string }) => {
              if (c.type === 'text' && c.text) return c.text;
              if (c.type === 'image') return '[image omitted to save context]';
              return '';
            })
            .filter(Boolean)
            .join('\n');
        } else {
          resultText = JSON.stringify(block.content);
        }

        // 截断过长的结果
        const MAX_TOOL_RESULT_CHARS = 200000;
        if (resultText.length > MAX_TOOL_RESULT_CHARS) {
          resultText = resultText.substring(0, MAX_TOOL_RESULT_CHARS) + '\n...[truncated output]';
        }

        // 空结果处理
        if (!resultText.trim()) {
          resultText = block.is_error
            ? 'Tool execution failed with no output.'
            : 'Command executed successfully.';
        }

        const part: GeminiPart = {
          functionResponse: {
            name: toolName,
            response: { result: resultText },
            id: block.tool_use_id,
          },
        };

        // 回填签名
        const lastSig = getLastSig();
        if (lastSig && lastSig.length >= MIN_SIGNATURE_LENGTH) {
          part.thoughtSignature = lastSig;
        }

        parts.push(part);
        break;
      }

      case 'server_tool_use':
      case 'web_search_tool_result':
        // 这些 block 不应由客户端发回
        continue;
    }
  }

  return parts;
}

// ==================== Tools 构建 ====================

/**
 * 构建 Gemini tools
 */
function buildTools(tools?: Tool[]): GeminiTool[] | null {
  if (!tools || tools.length === 0) {
    return null;
  }

  const functionDeclarations = [];
  let hasGoogleSearch = false;

  for (const tool of tools) {
    // 检查是否是 web search 工具
    if (
      tool.type?.startsWith('web_search') ||
      tool.name === 'web_search' ||
      tool.name === 'google_search'
    ) {
      hasGoogleSearch = true;
      continue;
    }

    // 普通工具
    if (tool.name && tool.input_schema) {
      const cleanedSchema = cleanJsonSchema(JSON.parse(JSON.stringify(tool.input_schema)));
      functionDeclarations.push({
        name: tool.name,
        description: tool.description,
        parameters: cleanedSchema,
      });
    }
  }

  const result: GeminiTool[] = [];

  if (functionDeclarations.length > 0) {
    result.push({ functionDeclarations });
  }

  if (hasGoogleSearch) {
    result.push({ googleSearch: {} });
  }

  return result.length > 0 ? result : null;
}

/**
 * 清理 JSON Schema 中不支持的字段
 */
function cleanJsonSchema(schema: unknown): unknown {
  if (schema === null || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(cleanJsonSchema);
  }

  const result: Record<string, unknown> = {};
  const obj = schema as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    // 跳过需要移除的字段
    if (SCHEMA_FIELDS_TO_REMOVE.includes(key as typeof SCHEMA_FIELDS_TO_REMOVE[number])) {
      continue;
    }

    // 递归清理
    result[key] = cleanJsonSchema(value);
  }

  // 展开 $ref 引用（简化处理：这里只是移除，完整实现需要解析引用）
  delete result.$ref;
  delete result.$defs;
  delete result.definitions;

  return result;
}

// ==================== Generation Config ====================

/**
 * 检测目标模型是否是 Gemini 3 系列
 */
function isGemini3Model(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('gemini-3') || lower.includes('gemini3');
}

/**
 * 构建生成配置
 */
function buildGenerationConfig(
  req: ClaudeRequest,
  isThinkingEnabled: boolean,
  targetModel: string
): GeminiGenerationConfig {
  const config: GeminiGenerationConfig = {};

  if (req.max_tokens) {
    config.maxOutputTokens = req.max_tokens;
  }

  if (req.temperature !== undefined) {
    config.temperature = req.temperature;
  }

  if (req.top_p !== undefined) {
    config.topP = req.top_p;
  }

  if (req.top_k !== undefined) {
    config.topK = req.top_k;
  }

  // Thinking 配置
  if (isThinkingEnabled) {
    const effort = resolveEffort(req);

    // Gemini 3 系列使用 thinkingLevel，其他使用 thinkingBudget
    if (isGemini3Model(targetModel)) {
      // Gemini 3 thinkingLevel 只支持 'low' | 'medium' | 'high'，max 映射为 'high'
      const thinkingLevel = effort === 'max' ? 'high' : effort;
      config.thinkingConfig = {
        includeThoughts: true,
        thinkingLevel,
      };
    } else {
      config.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: resolveBudgetTokens(req),
      };
    }
  }

  return config;
}

// ==================== 工具函数 ====================

/**
 * 标准化消息内容为 ContentBlock 数组
 */
function normalizeContent(content: MessageContent): ContentBlock[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content;
}

// ==================== 模型 Slot 提取 ====================

/**
 * 将我们的内部模型名规范化为 Antigravity 实际接受的模型名。
 * Antigravity 对 Sonnet/Haiku 等 Claude 模型只暴露不带 -thinking 的版本，
 * thinking 通过 thinkingConfig 控制；Opus 例外，它只有 -thinking 变体。
 * Gemini Pro 的 "preview" 是内部逻辑别名，上游 v1internal API 只接受 "high" 物理模型名。
 */
function resolveAntigravityModelName(targetModel: string): string {
  const lower = targetModel.toLowerCase();
  if (lower.includes('claude') && lower.endsWith('-thinking') && !lower.includes('opus')) {
    return targetModel.slice(0, -'-thinking'.length);
  }
  // Gemini Pro preview → high（与 Antigravity Manager common_utils.rs 一致）
  if (lower === 'gemini-3.1-pro-preview') return 'gemini-3.1-pro-high';
  if (lower === 'gemini-3-pro-preview') return 'gemini-3.1-pro-high';
  return targetModel;
}

/**
 * 从模型名称提取 slot (opus/sonnet/haiku)
 */
export function extractModelSlot(model: string): ModelSlot {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('haiku')) return 'haiku';
  return 'sonnet'; // 默认
}

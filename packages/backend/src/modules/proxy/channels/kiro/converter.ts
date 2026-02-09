/**
 * Claude → Kiro 请求转换器
 *
 * 核心功能：
 * 1. 消息转换：Claude messages → Kiro history + currentMessage
 * 2. System Prompt：注入到第一条用户消息
 * 3. 工具转换：Claude tools → Kiro toolSpecification 格式
 * 4. 工具结果：tool_result → Kiro toolResults
 * 5. 图片转换：image source → Kiro images 格式
 * 6. 模型 ID 映射：claude-xxx → CLAUDE_XXX_V1_0
 * 7. Thinking 支持：自动注入 thinking 标签
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ClaudeRequest,
  Message,
  MessageContent,
  ContentBlock,
  Tool,
  SystemPrompt,
} from '../../types.js';
import { resolveEffort, resolveBudgetTokens } from '../../types.js';
import type {
  KiroRequest,
  KiroHistoryMessage,
  KiroUserInputMessage,
  KiroAssistantResponseMessage,
  KiroTool,
  KiroToolResult,
  KiroImage,
  KiroToolUse,
} from './models.js';
import {
  CLAUDE_TO_KIRO_MODEL_MAP,
  generateThinkingTags,
  MAX_TOOL_NAME_LENGTH,
  MAX_TOOL_DESCRIPTION_LENGTH,
  EMPTY_CONTENT_PLACEHOLDER,
} from './models.js';
import { logger } from '../../../../lib/logger.js';

// ==================== 公共接口 ====================

export interface KiroConvertOptions {
  conversationId?: string;
  enableThinking?: boolean;
  targetModel?: string;
}

export interface KiroConvertResult {
  body: KiroRequest;
  kiroModelId: string;
}

/**
 * 将 Claude 请求转换为 Kiro 格式
 */
export function convertClaudeToKiro(
  claudeReq: ClaudeRequest,
  options: KiroConvertOptions = {}
): KiroConvertResult {
  const { conversationId = uuidv4(), targetModel } = options;

  // 从请求中读取 thinking 配置
  // 如果 thinking.type !== 'disabled'（包括 'enabled'、'adaptive' 或未设置），则启用 thinking
  const thinkingConfig = claudeReq.thinking;
  const enableThinking = !thinkingConfig || thinkingConfig.type !== 'disabled';
  const effort = resolveEffort(claudeReq);
  const thinkingBudgetTokens = resolveBudgetTokens(claudeReq);

  // 1. 映射模型 ID（优先使用映射配置中的 targetModel）
  const kiroModelId = targetModel || mapModelId(claudeReq.model);

  // 2. 提取 system prompt
  const systemPrompt = extractSystemPrompt(claudeReq.system);

  // 3. 转换工具
  const kiroTools = convertTools(claudeReq.tools);

  // 3.1 预处理消息（assistant 结尾补 Continue、工具结果兼容）
  const normalizedMessages = normalizeMessages(claudeReq.messages, kiroTools);

  // 4. 构建历史消息和当前消息
  const { history, currentMessage, toolResults } = buildMessages(
    normalizedMessages,
    systemPrompt,
    kiroModelId,
    kiroTools,
    enableThinking,
    thinkingBudgetTokens
  );

  // 5. 构建请求体（参考 kiro-gateway，不需要 agentContinuationId 和 agentTaskType）
  const body: KiroRequest = {
    conversationState: {
      chatTriggerType: 'MANUAL',
      conversationId,
      currentMessage: {
        userInputMessage: currentMessage,
      },
      history,
    },
    // 注意：AWS SSO OIDC 用户不需要 profileArn，会导致 403
    // 这里不设置 profileArn
  };

  // 6. 添加工具结果到当前消息（userInputMessageContext 已在 buildMessages 中初始化）
  if (toolResults.length > 0) {
    body.conversationState.currentMessage.userInputMessage.userInputMessageContext!.toolResults = toolResults;
  }

  // 7. 更新工具定义（如果有工具的话）
  if (kiroTools.length > 0) {
    body.conversationState.currentMessage.userInputMessage.userInputMessageContext!.tools = kiroTools;
  }

  // 详细日志（调试用）
  logger.info(
    {
      claudeModel: claudeReq.model,
      kiroModelId,
      historyLength: history.length,
      toolsCount: kiroTools.length,
      hasToolResults: toolResults.length > 0,
      enableThinking,
      effort,
      thinkingBudgetTokens,
    },
    'Converted Claude request to Kiro format'
  );


  return { body, kiroModelId };
}

// ==================== 模型映射 ====================

/**
 * 将 Claude 模型 ID 映射为 Kiro 模型 ID
 */
function mapModelId(claudeModel: string): string {
  const normalizedModel = claudeModel.toLowerCase().trim();

  // 直接匹配
  if (CLAUDE_TO_KIRO_MODEL_MAP[normalizedModel]) {
    return CLAUDE_TO_KIRO_MODEL_MAP[normalizedModel];
  }

  // 模糊匹配
  if (normalizedModel.includes('opus-4.6') || normalizedModel.includes('opus-4-6')) {
    return 'claude-opus-4.6';
  }
  if (normalizedModel.includes('opus-4.5') || normalizedModel.includes('opus-4-5') || normalizedModel.includes('opus')) {
    return 'claude-opus-4.5';
  }
  if (normalizedModel.includes('sonnet-4.5') || normalizedModel.includes('sonnet-4-5')) {
    return 'claude-sonnet-4.5';
  }
  if (normalizedModel.includes('sonnet-4') || normalizedModel.includes('sonnet')) {
    return 'claude-sonnet-4';
  }
  if (normalizedModel.includes('haiku-4.5') || normalizedModel.includes('haiku-4-5') || normalizedModel.includes('haiku')) {
    return 'claude-haiku-4.5';
  }

  // 默认使用 Sonnet 4
  logger.warn({ claudeModel }, 'Unknown model, defaulting to claude-sonnet-4');
  return 'claude-sonnet-4';
}

// ==================== System Prompt ====================

/**
 * 提取 system prompt 为字符串
 */
function extractSystemPrompt(system?: SystemPrompt): string {
  if (!system) return '';

  if (typeof system === 'string') {
    return system;
  }

  // SystemBlock[] 格式
  return system
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');
}

// ==================== 消息预处理 ====================

function normalizeMessages(messages: Message[], tools: KiroTool[]): Message[] {
  const normalized: Message[] = messages.map((msg) => ({ ...msg, content: msg.content }));

  // 如果最后一条是 assistant，追加 Continue 作为当前 user 消息
  if (normalized.length > 0 && normalized[normalized.length - 1].role === 'assistant') {
    normalized.push({ role: 'user', content: 'Continue' });
  }

  // 无 tools：将所有 tool_use/tool_result 转为文本
  if (tools.length === 0) {
    return normalized.map((msg) => ({
      ...msg,
      content: convertToolBlocksToText(msg.content, { toolUse: true, toolResult: true }),
    }));
  }

  // 有 tools：仅处理缺少 preceding tool_use 的 tool_result
  const processed: Message[] = [];
  for (const msg of normalized) {
    if (msg.role === 'user' && hasToolResultBlock(msg.content)) {
      const prev = processed[processed.length - 1];
      const hasPrevToolUse = prev && prev.role === 'assistant' && hasToolUseBlock(prev.content);
      if (!hasPrevToolUse) {
        processed.push({
          ...msg,
          content: convertToolBlocksToText(msg.content, { toolUse: false, toolResult: true }),
        });
        continue;
      }
    }
    processed.push(msg);
  }

  return processed;
}

function hasToolUseBlock(content: MessageContent): boolean {
  if (typeof content === 'string') return false;
  return content.some((block) => block.type === 'tool_use');
}

function hasToolResultBlock(content: MessageContent): boolean {
  if (typeof content === 'string') return false;
  return content.some((block) => block.type === 'tool_result');
}

function convertToolBlocksToText(
  content: MessageContent,
  options: { toolUse: boolean; toolResult: boolean }
): MessageContent {
  if (typeof content === 'string') {
    return content;
  }

  const blocks: ContentBlock[] = [];
  for (const block of content) {
    if (options.toolUse && block.type === 'tool_use') {
      const toolText = formatToolUseText(block);
      if (toolText) {
        blocks.push({ type: 'text', text: toolText });
      }
      continue;
    }
    if (options.toolResult && block.type === 'tool_result') {
      const resultText = formatToolResultText(block);
      if (resultText) {
        blocks.push({ type: 'text', text: resultText });
      }
      continue;
    }
    blocks.push(block);
  }

  return blocks;
}

function formatToolUseText(block: ContentBlock & { type: 'tool_use' }): string {
  const inputText = typeof block.input === 'string'
    ? block.input
    : JSON.stringify(block.input ?? {});
  const name = block.name || 'tool';
  return `[Tool Call (${name})]\n${inputText || ''}`.trim();
}

function formatToolResultText(block: ContentBlock & { type: 'tool_result' }): string {
  const contentText = toolResultContentToText(block.content, block.is_error, true);
  const label = block.tool_use_id ? `[Tool Result (${block.tool_use_id})]` : '[Tool Result]';
  return `${label}\n${contentText}`.trim();
}

// ==================== 消息构建 ====================

interface BuildMessagesResult {
  history: KiroHistoryMessage[];
  currentMessage: KiroUserInputMessage;
  toolResults: KiroToolResult[];
}

/**
 * 构建 Kiro 消息历史和当前消息
 */
function buildMessages(
  messages: Message[],
  systemPrompt: string,
  modelId: string,
  tools: KiroTool[],
  enableThinking: boolean,
  thinkingBudgetTokens?: number
): BuildMessagesResult {
  const history: KiroHistoryMessage[] = [];
  const toolResults: KiroToolResult[] = [];
  let lastUserContent = '';
  let lastUserImages: KiroImage[] = [];

  // 处理除最后一条消息外的所有消息
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLast = i === messages.length - 1;

    if (msg.role === 'user') {
      const { content, images, results } = processUserMessage(msg.content);

      if (isLast) {
        // 最后一条用户消息作为 currentMessage
        lastUserContent = content;
        lastUserImages = images;
        toolResults.push(...results);
      } else {
        // 添加到历史
        // 注意：history 中的 userInputMessage 只包含 toolResults，不包含 tools！
        // tools 只在 currentMessage 中传递（参考 kiro-gateway）
        const userInputMessage: KiroUserInputMessage = {
          content: content || EMPTY_CONTENT_PLACEHOLDER,
          modelId,
          origin: 'AI_EDITOR',
        };
        if (images.length > 0) {
          userInputMessage.images = images;
        }
        if (results.length > 0) {
          userInputMessage.userInputMessageContext = { toolResults: results };
        }
        history.push({ userInputMessage });
      }
    } else if (msg.role === 'assistant') {
      const { content, toolUses } = processAssistantMessage(msg.content);
      // 注意：Kiro API 的 assistantResponseMessage 不需要 messageId 字段！
      const assistantResponseMessage: KiroAssistantResponseMessage = {
        content: content || EMPTY_CONTENT_PLACEHOLDER,
      };
      if (toolUses.length > 0) {
        assistantResponseMessage.toolUses = toolUses;
      }
      history.push({ assistantResponseMessage });
    }
  }

  // 构建当前消息
  let currentContent = lastUserContent;

  // 重要：如果 content 为空，需要根据场景设置占位符
  // - 如果有 toolResults，说明这是工具结果消息，不应该用 "Continue"
  // - 否则使用 "Continue"（参考 kiro-gateway）
  if (!currentContent) {
    if (toolResults.length > 0) {
      // 工具结果消息：使用更明确的提示，避免 AI 误解为 "继续做事"
      currentContent = '(Tool results provided above)';
    } else {
      currentContent = 'Continue';
    }
  }

  // 注入 system prompt（优先注入到第一条历史 user，否则注入到 current）
  if (systemPrompt) {
    const firstUserIndex = history.findIndex((entry) => 'userInputMessage' in entry);
    if (firstUserIndex !== -1) {
      const firstUserEntry = history[firstUserIndex] as { userInputMessage: KiroUserInputMessage };
      firstUserEntry.userInputMessage.content = `${systemPrompt}\n\n${firstUserEntry.userInputMessage.content || EMPTY_CONTENT_PLACEHOLDER}`;
    } else {
      currentContent = `${systemPrompt}\n\n${currentContent}`;
    }
  }

  // 注入 thinking 标签（使用请求中的 budget_tokens 或默认值）
  if (enableThinking) {
    const thinkingTags = generateThinkingTags(thinkingBudgetTokens);
    currentContent = `${thinkingTags}\n\n${currentContent}`;
  }

  const currentMessage: KiroUserInputMessage = {
    content: currentContent,
    modelId,
    origin: 'AI_EDITOR',
    // 始终包含 userInputMessageContext，即使 tools 为空
    userInputMessageContext: {
      tools: tools.length > 0 ? tools : [],
    },
  };

  if (lastUserImages.length > 0) {
    currentMessage.images = lastUserImages;
  }

  return { history, currentMessage, toolResults };
}

// ==================== 用户消息处理 ====================

interface ProcessUserResult {
  content: string;
  images: KiroImage[];
  results: KiroToolResult[];
}

/**
 * 处理用户消息内容
 */
function processUserMessage(content: MessageContent): ProcessUserResult {
  if (typeof content === 'string') {
    return { content, images: [], results: [] };
  }

  const textParts: string[] = [];
  const images: KiroImage[] = [];
  const results: KiroToolResult[] = [];

  for (const block of content) {
    switch (block.type) {
      case 'text':
        textParts.push(block.text);
        break;

      case 'image':
        if (block.source.type === 'base64') {
          const format = mapMediaTypeToFormat(block.source.media_type);
          if (format) {
            images.push({
              format,
              source: { bytes: block.source.data },
            });
          }
        }
        break;

      case 'document':
        // 文档作为 base64 图片处理
        if (block.source.type === 'base64') {
          const format = mapMediaTypeToFormat(block.source.media_type);
          if (format) {
            images.push({
              format,
              source: { bytes: block.source.data },
            });
          }
        }
        break;

      case 'tool_result':
        results.push(convertToolResult(block));
        break;
    }
  }

  return {
    content: textParts.join('\n'),
    images,
    results,
  };
}

function toolResultContentToText(
  content: unknown,
  isError?: boolean,
  forTextConversion = false
): string {
  let text = '';

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((item: unknown) => {
        if (typeof item === 'object' && item !== null) {
          const typedItem = item as { type?: string; text?: string };
          if (typedItem.type === 'text' && typedItem.text) {
            return typedItem.text;
          }
          if (typedItem.type === 'image') {
            return '[image omitted to save context]';
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  } else if (content) {
    text = JSON.stringify(content);
  }

  if (!text.trim()) {
    if (forTextConversion) {
      return '(empty result)';
    }
    return isError
      ? 'Tool execution failed with no output.'
      : 'Command executed successfully.';
  }

  return text;
}

/**
 * 转换 tool_result 为 Kiro 格式
 *
 * Kiro 格式: {"content": [{"text": "..."}], "status": "success", "toolUseId": "..."}
 * 注意：content 是数组，不是对象！
 */
function convertToolResult(block: ContentBlock & { type: 'tool_result' }): KiroToolResult {
  const text = toolResultContentToText(block.content, block.is_error);

  return {
    toolUseId: block.tool_use_id,
    content: [{ text }],  // content 是数组！
    status: block.is_error ? 'error' : 'success',
  };
}

// ==================== Assistant 消息处理 ====================

interface ProcessAssistantResult {
  content: string;
  toolUses: KiroToolUse[];
}

/**
 * 处理 assistant 消息内容
 */
function processAssistantMessage(content: MessageContent): ProcessAssistantResult {
  if (typeof content === 'string') {
    return { content, toolUses: [] };
  }

  const textParts: string[] = [];
  const toolUses: KiroToolUse[] = [];

  for (const block of content) {
    switch (block.type) {
      case 'text':
        // 过滤空文本
        if (block.text && block.text.trim() && block.text !== '(no content)') {
          textParts.push(block.text);
        }
        break;

      case 'thinking':
        // Thinking 内容不放入历史（Kiro 会自动处理）
        break;

      case 'redacted_thinking':
        // 忽略脱敏的 thinking
        break;

      case 'tool_use':
        // 注意：Kiro API 的 toolUses.input 应该是对象，不是 JSON 字符串！
        toolUses.push({
          toolUseId: block.id,
          name: truncateToolName(block.name),
          input: block.input ?? {},
        });
        break;
    }
  }

  return {
    content: textParts.join('\n'),
    toolUses,
  };
}

// ==================== 工具转换 ====================

/**
 * 转换 Claude tools 为 Kiro 格式
 */
function convertTools(tools?: Tool[]): KiroTool[] {
  if (!tools || tools.length === 0) {
    return [];
  }

  const kiroTools: KiroTool[] = [];

  for (const tool of tools) {
    // 跳过 web search 工具（Kiro 不支持）
    if (
      tool.type?.startsWith('web_search') ||
      tool.name === 'web_search' ||
      tool.name === 'google_search'
    ) {
      continue;
    }

    if (tool.name && tool.input_schema) {
      // 清理 JSON Schema
      const cleanedSchema = cleanJsonSchema(JSON.parse(JSON.stringify(tool.input_schema)));

      kiroTools.push({
        toolSpecification: {
          name: truncateToolName(tool.name),
          description: truncateDescription(tool.description || ''),
          inputSchema: {
            json: cleanedSchema,
          },
        },
      });
    }
  }

  return kiroTools;
}

/**
 * 截断工具名称
 */
function truncateToolName(name: string): string {
  if (name.length <= MAX_TOOL_NAME_LENGTH) {
    return name;
  }
  const truncated = name.substring(0, MAX_TOOL_NAME_LENGTH);
  logger.warn(
    { originalName: name, truncatedName: truncated, maxLength: MAX_TOOL_NAME_LENGTH },
    'Tool name exceeded max length, truncated'
  );
  return truncated;
}

/**
 * 截断工具描述
 */
function truncateDescription(description: string): string {
  if (description.length <= MAX_TOOL_DESCRIPTION_LENGTH) {
    return description;
  }
  return description.substring(0, MAX_TOOL_DESCRIPTION_LENGTH) + '...';
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
  const fieldsToRemove = [
    '$schema',
    'additionalProperties',
    'format',
    'default',
    'uniqueItems',
    'propertyNames',
    'const',
    'anyOf',
    'oneOf',
    'allOf',
    'exclusiveMinimum',
    'exclusiveMaximum',
    '$ref',
    '$defs',
    'definitions',
  ];

  for (const [key, value] of Object.entries(obj)) {
    if (fieldsToRemove.includes(key)) {
      continue;
    }
    result[key] = cleanJsonSchema(value);
  }

  return result;
}

// ==================== 工具函数 ====================

/**
 * 将 media_type 映射为 Kiro 图片格式
 */
function mapMediaTypeToFormat(mediaType: string): 'png' | 'jpeg' | 'gif' | 'webp' | null {
  const lower = mediaType.toLowerCase();

  if (lower.includes('png')) return 'png';
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpeg';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('webp')) return 'webp';

  return null;
}

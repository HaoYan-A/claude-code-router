/**
 * Claude → OpenAI Responses API 请求转换器
 *
 * 将 Anthropic Claude API 格式转换为 OpenAI Responses API 格式
 */

import type {
  ClaudeRequest,
  Message,
  ContentBlock,
  SystemPrompt,
  Tool,
  EffortLevel,
} from '../../types.js';
import { resolveEffort } from '../../types.js';
import type {
  OpenAIResponsesRequest,
  OpenAIInputItem,
  OpenAIMessageItem,
  OpenAIFunctionCallItem,
  OpenAIFunctionCallOutputItem,
  OpenAITool,
  OpenAIWebSearchTool,
  OpenAIToolChoice,
  OpenAIReasoning,
  OpenAIContentPart,
} from './models.js';

export interface OpenAIConvertOptions {
  targetModel: string;
}

export interface OpenAIConvertResult {
  body: OpenAIResponsesRequest;
  /** original→shortened 工具名映射，用于响应中恢复原始名称 */
  toolNameMap: Map<string, string>;
}

/**
 * 将 Claude API 请求转换为 OpenAI Responses API 请求
 */
export function convertClaudeToOpenAI(
  claudeReq: ClaudeRequest,
  options: OpenAIConvertOptions
): OpenAIConvertResult {
  let toolNameMap = new Map<string, string>();

  const body: OpenAIResponsesRequest = {
    model: options.targetModel,
    input: [], // 先占位，下面设置 toolNameMap 后再转换 messages
    stream: claudeReq.stream ?? true,
  };

  // System prompt → instructions
  const instructions = convertSystemPrompt(claudeReq.system);
  if (instructions) {
    body.instructions = instructions;
  }

  // Tools（含工具名缩短 + web search 映射）
  if (claudeReq.tools && claudeReq.tools.length > 0) {
    const toolsResult = convertTools(claudeReq.tools);
    body.tools = toolsResult.tools;
    toolNameMap = toolsResult.nameMap;

    // 有 function 类型工具时启用并行工具调用
    if (toolsResult.tools.some((t) => t.type === 'function')) {
      body.parallel_tool_calls = true;
    }
  }

  // 转换消息（需要 toolNameMap 来缩短历史消息中的工具名）
  body.input = convertMessages(claudeReq.messages, toolNameMap);

  // Tool choice (从 claudeReq 中提取，如果存在的话)
  const toolChoice = convertToolChoice(claudeReq, toolNameMap);
  if (toolChoice !== undefined) {
    body.tool_choice = toolChoice;
  }

  // max_tokens → max_output_tokens
  if (claudeReq.max_tokens) {
    body.max_output_tokens = claudeReq.max_tokens;
  }

  // temperature（Codex 模型不支持此参数）
  if (claudeReq.temperature !== undefined && !options.targetModel.includes('codex')) {
    body.temperature = claudeReq.temperature;
  }

  // Thinking → Reasoning
  const reasoning = convertThinking(claudeReq);
  if (reasoning) {
    body.reasoning = reasoning;
    // Codex 需要 include 参数来获取推理内容
    body.include = ['reasoning.encrypted_content'];
  }

  return { body, toolNameMap };
}

/**
 * 转换 system prompt
 */
function convertSystemPrompt(system?: SystemPrompt): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  const text = system
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');
  return text || undefined;
}

/**
 * 转换消息列表
 */
function convertMessages(messages: Message[], toolNameMap: Map<string, string>): OpenAIInputItem[] {
  const items: OpenAIInputItem[] = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      items.push({
        role: msg.role,
        content: msg.content,
      } as OpenAIMessageItem);
      continue;
    }

    // 处理 content blocks
    if (msg.role === 'user') {
      convertUserMessage(msg.content as ContentBlock[], items);
    } else if (msg.role === 'assistant') {
      convertAssistantMessage(msg.content as ContentBlock[], items, toolNameMap);
    }
  }

  return items;
}

/**
 * 转换 user 消息
 */
function convertUserMessage(blocks: ContentBlock[], items: OpenAIInputItem[]): void {
  const contentParts: OpenAIContentPart[] = [];
  const functionOutputs: OpenAIFunctionCallOutputItem[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        contentParts.push({ type: 'input_text', text: block.text });
        break;

      case 'image': {
        const mimeType = block.source.media_type || 'image/png';
        const imageUrl = `data:${mimeType};base64,${block.source.data}`;
        contentParts.push({ type: 'input_image', image_url: imageUrl });
        break;
      }

      case 'tool_result': {
        const output = extractToolResultContent(block.content);
        functionOutputs.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output,
        });
        break;
      }

      // 忽略其他类型 (thinking, redacted_thinking 等)
      default:
        break;
    }
  }

  // 先添加 function_call_output（它们需要在 user message 之前）
  for (const fo of functionOutputs) {
    items.push(fo);
  }

  // 添加用户内容（如果有）
  if (contentParts.length === 1 && contentParts[0].type === 'input_text') {
    items.push({
      role: 'user',
      content: contentParts[0].text,
    } as OpenAIMessageItem);
  } else if (contentParts.length > 0) {
    items.push({
      role: 'user',
      content: contentParts,
    } as OpenAIMessageItem);
  }
}

/**
 * 转换 assistant 消息
 */
function convertAssistantMessage(
  blocks: ContentBlock[],
  items: OpenAIInputItem[],
  toolNameMap: Map<string, string>
): void {
  const textParts: string[] = [];
  const functionCalls: OpenAIFunctionCallItem[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        textParts.push(block.text);
        break;

      case 'tool_use': {
        // 使用 toolNameMap 缩短历史消息中的工具名
        const shortenedName = toolNameMap.get(block.name) ?? block.name;
        functionCalls.push({
          type: 'function_call',
          id: `fc_${block.id}`,
          call_id: block.id,
          name: shortenedName,
          arguments: typeof block.input === 'string'
            ? block.input
            : JSON.stringify(block.input ?? {}),
        });
        break;
      }

      // 忽略 thinking, redacted_thinking, signature 等
      default:
        break;
    }
  }

  // 先添加 text 内容
  if (textParts.length > 0) {
    items.push({
      role: 'assistant',
      content: textParts.join('\n'),
    } as OpenAIMessageItem);
  }

  // 再添加 function calls
  for (const fc of functionCalls) {
    items.push(fc);
  }
}

/**
 * 提取 tool_result 的文本内容
 */
function extractToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!content) return '';

  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === 'object' && item !== null) {
          const typed = item as { type?: string; text?: string };
          if (typed.type === 'text' && typed.text) return typed.text;
        }
        if (typeof item === 'string') return item;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return JSON.stringify(content);
}

// ==================== 工具名缩短 ====================

const TOOL_NAME_MAX_LENGTH = 64;

/**
 * 缩短单个工具名以满足 64 字符限制
 * - 如果 ≤ 64 字符，原样返回
 * - 如果以 "mcp__" 开头，取最后一个 "__" 后的部分拼接 "mcp__" 前缀
 * - 否则截断到 64 字符
 */
export function shortenToolName(name: string): string {
  if (name.length <= TOOL_NAME_MAX_LENGTH) return name;

  if (name.startsWith('mcp__')) {
    const lastSep = name.lastIndexOf('__');
    if (lastSep > 4) { // 确保不是开头的 "mcp__"
      const suffix = name.substring(lastSep + 2);
      const shortened = `mcp__${suffix}`;
      if (shortened.length <= TOOL_NAME_MAX_LENGTH) return shortened;
    }
  }

  return name.substring(0, TOOL_NAME_MAX_LENGTH);
}

/**
 * 构建工具名映射表: original → shortened
 * 对所有工具名应用缩短，检测冲突时追加 _1, _2 后缀
 */
export function buildToolNameMap(names: string[]): Map<string, string> {
  const nameMap = new Map<string, string>();
  // 反向索引：shortened → original（用于检测冲突）
  const usedShortNames = new Map<string, string>();

  for (const original of names) {
    let shortened = shortenToolName(original);

    // 检测冲突：缩短后的名称已被另一个原始名使用
    const existing = usedShortNames.get(shortened);
    if (existing && existing !== original) {
      // 追加后缀解决冲突
      let counter = 1;
      let candidate = `${shortened.substring(0, TOOL_NAME_MAX_LENGTH - 2)}_${counter}`;
      while (usedShortNames.has(candidate)) {
        counter++;
        const suffixStr = `_${counter}`;
        candidate = `${shortened.substring(0, TOOL_NAME_MAX_LENGTH - suffixStr.length)}${suffixStr}`;
      }
      shortened = candidate;
    }

    nameMap.set(original, shortened);
    usedShortNames.set(shortened, original);
  }

  return nameMap;
}

/**
 * 转换工具定义（含工具名缩短 + web search 映射）
 */
function convertTools(tools: Tool[]): {
  tools: (OpenAITool | OpenAIWebSearchTool)[];
  nameMap: Map<string, string>;
} {
  const result: (OpenAITool | OpenAIWebSearchTool)[] = [];

  // 收集所有 function 类型工具名用于构建映射表
  const functionToolNames = tools
    .filter((tool) => tool.name && tool.type !== 'web_search_20250305')
    .map((tool) => tool.name!);

  const nameMap = buildToolNameMap(functionToolNames);

  for (const tool of tools) {
    // Web search 工具映射: web_search_20250305 → web_search
    if (tool.type === 'web_search_20250305') {
      result.push({ type: 'web_search' });
      continue;
    }

    // 过滤掉没有 name 的工具（如 server tools）
    if (!tool.name) continue;

    result.push({
      type: 'function' as const,
      name: nameMap.get(tool.name) ?? tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    });
  }

  return { tools: result, nameMap };
}

/**
 * 转换 tool_choice
 */
function convertToolChoice(
  claudeReq: ClaudeRequest,
  toolNameMap: Map<string, string>
): OpenAIToolChoice | undefined {
  // Claude 的 tool_choice 不在标准类型定义中，需要从原始请求提取
  const toolChoice = (claudeReq as unknown as Record<string, unknown>).tool_choice as
    | { type: string; name?: string }
    | undefined;

  if (!toolChoice) return undefined;

  switch (toolChoice.type) {
    case 'auto':
      return 'auto';
    case 'any':
      return 'required';
    case 'none':
      return 'none';
    case 'tool':
      if (toolChoice.name) {
        // 使用缩短后的工具名
        const shortened = toolNameMap.get(toolChoice.name) ?? toolChoice.name;
        return { type: 'function', name: shortened };
      }
      return 'auto';
    default:
      return undefined;
  }
}

/**
 * 将 effort 等级映射到 OpenAI reasoning effort
 */
function mapEffortToOpenAI(effort: EffortLevel): OpenAIReasoning['effort'] {
  switch (effort) {
    case 'low': return 'low';
    case 'medium': return 'medium';
    case 'high': return 'high';
    case 'max': return 'xhigh';
    default: return 'high';
  }
}

/**
 * 转换 thinking → reasoning
 * 支持新格式 (adaptive + output_config.effort) 和旧格式 (enabled + budget_tokens)
 */
function convertThinking(claudeReq: ClaudeRequest): OpenAIReasoning | undefined {
  const thinking = claudeReq.thinking;
  const hasEffort = !!claudeReq.output_config?.effort;

  // 判断是否启用 thinking
  const thinkingEnabled =
    thinking?.type === 'enabled' ||
    thinking?.type === 'adaptive' ||
    hasEffort;

  if (!thinkingEnabled) return undefined;

  // 显式禁用
  if (thinking?.type === 'disabled') return undefined;

  const effort = resolveEffort(claudeReq);

  return {
    effort: mapEffortToOpenAI(effort),
    summary: 'auto',
  };
}

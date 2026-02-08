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
  OpenAIToolChoice,
  OpenAIReasoning,
  OpenAIContentPart,
} from './models.js';

export interface OpenAIConvertOptions {
  targetModel: string;
}

export interface OpenAIConvertResult {
  body: OpenAIResponsesRequest;
}

/**
 * 将 Claude API 请求转换为 OpenAI Responses API 请求
 */
export function convertClaudeToOpenAI(
  claudeReq: ClaudeRequest,
  options: OpenAIConvertOptions
): OpenAIConvertResult {
  const body: OpenAIResponsesRequest = {
    model: options.targetModel,
    input: convertMessages(claudeReq.messages),
    stream: claudeReq.stream ?? true,
  };

  // System prompt → instructions
  const instructions = convertSystemPrompt(claudeReq.system);
  if (instructions) {
    body.instructions = instructions;
  }

  // Tools
  if (claudeReq.tools && claudeReq.tools.length > 0) {
    body.tools = convertTools(claudeReq.tools);
  }

  // Tool choice (从 claudeReq 中提取，如果存在的话)
  const toolChoice = convertToolChoice(claudeReq);
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
  }

  return { body };
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
function convertMessages(messages: Message[]): OpenAIInputItem[] {
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
      convertAssistantMessage(msg.content as ContentBlock[], items);
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
function convertAssistantMessage(blocks: ContentBlock[], items: OpenAIInputItem[]): void {
  const textParts: string[] = [];
  const functionCalls: OpenAIFunctionCallItem[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        textParts.push(block.text);
        break;

      case 'tool_use':
        functionCalls.push({
          type: 'function_call',
          id: `fc_${block.id}`,
          call_id: block.id,
          name: block.name,
          arguments: typeof block.input === 'string'
            ? block.input
            : JSON.stringify(block.input ?? {}),
        });
        break;

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

/**
 * 转换工具定义
 */
function convertTools(tools: Tool[]): OpenAITool[] {
  return tools
    .filter((tool) => tool.name) // 过滤掉没有 name 的工具（如 server tools）
    .map((tool) => ({
      type: 'function' as const,
      name: tool.name!,
      description: tool.description,
      parameters: tool.input_schema,
    }));
}

/**
 * 转换 tool_choice
 */
function convertToolChoice(claudeReq: ClaudeRequest): OpenAIToolChoice | undefined {
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
        return { type: 'function', name: toolChoice.name };
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

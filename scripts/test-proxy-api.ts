/**
 * 代理服务 REST API 集成测试（SSE 流式）
 *
 * 用途：验证 /proxy/v1/messages 端点在不同渠道、不同场景下的 SSE 流式响应正确性
 *
 * 运行方式：
 *   npx tsx scripts/test-proxy-api.ts
 *
 * 可选环境变量：
 *   PROXY_BASE_URL=http://example.com:3000 npx tsx scripts/test-proxy-api.ts
 */

import * as fs from 'fs';

// ===== 配置区 =====

const BASE_URL = process.env.PROXY_BASE_URL || 'http://localhost:3000';

// 渠道名 → API Key 映射，按需添加
const API_KEYS: Record<string, string> = {
  'antigravity-claude': 'ccr_54d80c48cc50dca7e0cea5c30047bb661ea5d7487641f2fe42f34130b4d50833',
  'kiro-claude': 'ccr_c6a6e64a14eb2cc93ad3389bf6cb52eda525201b156daf24d6b29e3aa10cc8cc',
  'antigravity-gemini': 'ccr_ec170e48d38de98f6567dd11017098b854caa9dc185a5950aa325b4001e7d9b8',
  'codex': 'ccr_2a3d7cab82a7d26df41e8f98aa6d8f679c166bb5321da840a09286e244eb31c9',
};

// ===== 类型定义（脚本内独立定义，避免路径依赖） =====

interface ProxyRequestBody {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<ContentBlock>;
  }>;
  max_tokens: number;
  stream: true;
  [key: string]: unknown;
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

// 从 SSE 事件流重建的响应体
interface ResponseContentBlock {
  type: string;
  text?: string;
  // tool_use 字段
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ReconstructedResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: ResponseContentBlock[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface TestScenario {
  name: string;
  description: string;
  apiKeyName: string;
  buildRequest: () => ProxyRequestBody;
  validate?: (body: ReconstructedResponse) => void;
}

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

// ===== SSE 流式请求封装 =====

async function sendStreamingRequest(
  apiKey: string,
  body: ProxyRequestBody
): Promise<{ response: Response; body: ReconstructedResponse }> {
  const url = `${BASE_URL}/proxy/v1/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // 非 200 时直接读取错误 JSON
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  // 解析 SSE 事件流，重建完整响应
  const result = await parseSSEStream(response);
  return { response, body: result };
}

/**
 * 解析 SSE 事件流，从 message_start / content_block_delta / message_delta 中重建完整响应
 */
async function parseSSEStream(response: Response): Promise<ReconstructedResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';

  // 重建状态
  const result: ReconstructedResponse = {
    id: '',
    type: 'message',
    role: 'assistant',
    model: '',
    content: [],
    stop_reason: '',
    usage: { input_tokens: 0, output_tokens: 0 },
  };

  // 当前 content block 索引 → 累积内容
  const textAccumulator: Record<number, string> = {};
  const jsonAccumulator: Record<number, string> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按双换行分割 SSE 事件
      const parts = buffer.split('\n\n');
      // 最后一段可能不完整，留在 buffer
      buffer = parts.pop() || '';

      for (const part of parts) {
        let eventType = '';
        let eventData = '';

        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        if (!eventData) continue;

        try {
          const data = JSON.parse(eventData);

          switch (eventType) {
            case 'message_start': {
              const msg = data.message;
              if (msg) {
                result.id = msg.id || '';
                result.model = msg.model || '';
                result.role = msg.role || 'assistant';
                if (msg.usage) {
                  result.usage.input_tokens = msg.usage.input_tokens || 0;
                }
              }
              break;
            }
            case 'content_block_start': {
              const idx = data.index ?? result.content.length;
              const block = data.content_block;
              if (block) {
                if (block.type === 'tool_use') {
                  result.content[idx] = {
                    type: 'tool_use',
                    id: block.id || '',
                    name: block.name || '',
                    input: {},
                  };
                  jsonAccumulator[idx] = '';
                } else {
                  result.content[idx] = { type: block.type, text: block.text || '' };
                  if (block.type === 'text') {
                    textAccumulator[idx] = block.text || '';
                  }
                }
              }
              break;
            }
            case 'content_block_delta': {
              const idx = data.index ?? 0;
              const delta = data.delta;
              if (delta?.type === 'text_delta' && delta.text) {
                textAccumulator[idx] = (textAccumulator[idx] || '') + delta.text;
                if (result.content[idx]) {
                  result.content[idx].text = textAccumulator[idx];
                }
              } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
                jsonAccumulator[idx] = (jsonAccumulator[idx] || '') + delta.partial_json;
              }
              break;
            }
            case 'content_block_stop': {
              const idx = data.index ?? 0;
              // tool_use block 结束时解析累积的 JSON
              if (result.content[idx]?.type === 'tool_use' && jsonAccumulator[idx]) {
                try {
                  result.content[idx].input = JSON.parse(jsonAccumulator[idx]);
                } catch {
                  // JSON 解析失败保持空对象
                }
              }
              break;
            }
            case 'message_delta': {
              if (data.delta?.stop_reason) {
                result.stop_reason = data.delta.stop_reason;
              }
              if (data.usage) {
                result.usage.output_tokens = data.usage.output_tokens || 0;
              }
              break;
            }
            // content_block_stop, message_stop, ping — 不需要处理
          }
        } catch {
          // 跳过无法解析的事件数据
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

// ===== 断言工具 =====

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 通用响应断言
function assertCommonResponse(body: ReconstructedResponse): void {
  assert(!!body.id, 'Response missing "id"');
  assert(body.type === 'message', `Expected type "message", got "${body.type}"`);
  assert(Array.isArray(body.content) && body.content.length > 0, 'Response "content" should be a non-empty array');
  // input_tokens 某些渠道可能不在 SSE 中返回，仅做 output_tokens 检查
  assert(body.usage?.output_tokens > 0, 'Expected output_tokens > 0');
}

// ===== 场景定义 =====

const IMAGE_PATH = '/Users/haoyan/Downloads/企业微信20260209-133854@2x.png';

function buildSimpleChatRequest(greeting: string): ProxyRequestBody {
  return {
    model: 'claude-sonnet-4-5',
    max_tokens: 256,
    stream: true,
    messages: [
      {
        role: 'user',
        content: `Reply with exactly: "${greeting}" and nothing else.`,
      },
    ],
  };
}

function buildImageRequest(): ProxyRequestBody {
  const imageBuffer = fs.readFileSync(IMAGE_PATH);
  const base64Data = imageBuffer.toString('base64');

  return {
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
    stream: true,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: 'image/png',
              data: base64Data,
            },
          },
          {
            type: 'text' as const,
            text: 'Describe what you see in this image in 1-2 sentences.',
          },
        ],
      },
    ],
  };
}

// 天气工具定义（复用于工具调用场景）
const WEATHER_TOOL = {
  name: 'get_weather',
  description: 'Get the current weather for a given city.',
  input_schema: {
    type: 'object' as const,
    properties: {
      city: { type: 'string' as const, description: 'City name' },
    },
    required: ['city'],
  },
};

function buildToolCallRequest(apiKeyName: string): ProxyRequestBody {
  return {
    model: 'claude-sonnet-4-5',
    max_tokens: 256,
    stream: true,
    tools: [WEATHER_TOOL],
    messages: [
      {
        role: 'user',
        content: 'What is the weather in Beijing today?',
      },
    ],
  };
}

function buildToolResultRequest(apiKeyName: string): ProxyRequestBody {
  return {
    model: 'claude-sonnet-4-5',
    max_tokens: 256,
    stream: true,
    tools: [WEATHER_TOOL],
    messages: [
      {
        role: 'user',
        content: 'What is the weather in Beijing today?',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use' as const,
            id: 'toolu_test_001',
            name: 'get_weather',
            input: { city: 'Beijing' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_test_001',
            content: 'Sunny, 25°C, light breeze.',
          },
        ],
      },
    ],
  };
}

function validateTextResponse(body: ReconstructedResponse): void {
  const textBlock = body.content.find((b) => b.type === 'text');
  assert(!!textBlock, 'Response should contain a text block');
  assert(!!textBlock!.text && textBlock!.text.length > 0, 'Text block should have non-empty text');
}

function validateImageResponse(label: string) {
  return (body: ReconstructedResponse): void => {
    const textBlock = body.content.find((b) => b.type === 'text');
    assert(!!textBlock, 'Response should contain a text block');
    assert(
      !!textBlock!.text && textBlock!.text.length > 10,
      `${label} image recognition response should contain meaningful text (>10 chars)`
    );
  };
}

const TEST_SCENARIOS: TestScenario[] = [
  // Antigravity-Claude
  {
    name: 'antigravity-simple-chat',
    description: 'Antigravity-Claude 文字对话（SSE）',
    apiKeyName: 'antigravity-claude',
    buildRequest: () => buildSimpleChatRequest('Hello from proxy test!'),
    validate: validateTextResponse,
  },
  {
    name: 'antigravity-image',
    description: 'Antigravity-Claude 图片识别（SSE）',
    apiKeyName: 'antigravity-claude',
    buildRequest: buildImageRequest,
    validate: validateImageResponse('Antigravity'),
  },
  // Kiro
  {
    name: 'kiro-simple-chat',
    description: 'Kiro 渠道文字对话（SSE）',
    apiKeyName: 'kiro-claude',
    buildRequest: () => buildSimpleChatRequest('Hello from Kiro proxy test!'),
    validate: validateTextResponse,
  },
  {
    name: 'kiro-image',
    description: 'Kiro 渠道图片识别（SSE）',
    apiKeyName: 'kiro-claude',
    buildRequest: buildImageRequest,
    validate: validateImageResponse('Kiro'),
  },
  // Antigravity-Gemini
  {
    name: 'gemini-simple-chat',
    description: 'Antigravity-Gemini 文字对话（SSE）',
    apiKeyName: 'antigravity-gemini',
    buildRequest: () => buildSimpleChatRequest('Hello from Gemini proxy test!'),
    validate: validateTextResponse,
  },
  {
    name: 'gemini-image',
    description: 'Antigravity-Gemini 图片识别（SSE）',
    apiKeyName: 'antigravity-gemini',
    buildRequest: buildImageRequest,
    validate: validateImageResponse('Gemini'),
  },
  // Codex
  {
    name: 'codex-simple-chat',
    description: 'Codex 渠道文字对话（SSE）',
    apiKeyName: 'codex',
    buildRequest: () => buildSimpleChatRequest('Hello from Codex proxy test!'),
    validate: validateTextResponse,
  },
  {
    name: 'codex-image',
    description: 'Codex 渠道图片识别（SSE）',
    apiKeyName: 'codex',
    buildRequest: buildImageRequest,
    validate: validateImageResponse('Codex'),
  },
  // ===== 工具调用场景 =====
  // Kiro — 工具调用
  {
    name: 'kiro-tool-call',
    description: 'Kiro 工具调用 — AI 应返回 tool_use block',
    apiKeyName: 'kiro-claude',
    buildRequest: () => buildToolCallRequest('kiro-claude'),
    validate: (body) => {
      const toolBlock = body.content.find((b) => b.type === 'tool_use');
      assert(!!toolBlock, 'Response should contain a tool_use block');
      assert(toolBlock!.name === 'get_weather', `Expected tool name "get_weather", got "${toolBlock!.name}"`);
      assert(!!toolBlock!.input, 'tool_use block should have input');
      assert(body.stop_reason === 'tool_use', `Expected stop_reason "tool_use", got "${body.stop_reason}"`);
    },
  },
  // Kiro — 工具结果回复
  {
    name: 'kiro-tool-result',
    description: 'Kiro 工具结果 — AI 应基于天气数据回复文本',
    apiKeyName: 'kiro-claude',
    buildRequest: () => buildToolResultRequest('kiro-claude'),
    validate: (body) => {
      const textBlock = body.content.find((b) => b.type === 'text');
      assert(!!textBlock, 'Response should contain a text block');
      assert(!!textBlock!.text && textBlock!.text.length > 5, 'Response text should be non-trivial');
      assert(body.stop_reason === 'end_turn', `Expected stop_reason "end_turn", got "${body.stop_reason}"`);
    },
  },
  // Antigravity-Claude — 工具调用
  {
    name: 'antigravity-tool-call',
    description: 'Antigravity 工具调用 — AI 应返回 tool_use block',
    apiKeyName: 'antigravity-claude',
    buildRequest: () => buildToolCallRequest('antigravity-claude'),
    validate: (body) => {
      const toolBlock = body.content.find((b) => b.type === 'tool_use');
      assert(!!toolBlock, 'Response should contain a tool_use block');
      assert(toolBlock!.name === 'get_weather', `Expected tool name "get_weather", got "${toolBlock!.name}"`);
      assert(body.stop_reason === 'tool_use', `Expected stop_reason "tool_use", got "${body.stop_reason}"`);
    },
  },
  // Antigravity-Claude — 工具结果回复
  {
    name: 'antigravity-tool-result',
    description: 'Antigravity 工具结果 — AI 应基于天气数据回复文本',
    apiKeyName: 'antigravity-claude',
    buildRequest: () => buildToolResultRequest('antigravity-claude'),
    validate: (body) => {
      const textBlock = body.content.find((b) => b.type === 'text');
      assert(!!textBlock, 'Response should contain a text block');
      assert(!!textBlock!.text && textBlock!.text.length > 5, 'Response text should be non-trivial');
      assert(body.stop_reason === 'end_turn', `Expected stop_reason "end_turn", got "${body.stop_reason}"`);
    },
  },
  // Codex — 工具调用
  {
    name: 'codex-tool-call',
    description: 'Codex 工具调用 — AI 应返回 tool_use block',
    apiKeyName: 'codex',
    buildRequest: () => buildToolCallRequest('codex'),
    validate: (body) => {
      const toolBlock = body.content.find((b) => b.type === 'tool_use');
      assert(!!toolBlock, 'Response should contain a tool_use block');
      assert(toolBlock!.name === 'get_weather', `Expected tool name "get_weather", got "${toolBlock!.name}"`);
      assert(body.stop_reason === 'tool_use', `Expected stop_reason "tool_use", got "${body.stop_reason}"`);
    },
  },
  // Codex — 工具结果回复
  {
    name: 'codex-tool-result',
    description: 'Codex 工具结果 — AI 应基于天气数据回复文本',
    apiKeyName: 'codex',
    buildRequest: () => buildToolResultRequest('codex'),
    validate: (body) => {
      const textBlock = body.content.find((b) => b.type === 'text');
      assert(!!textBlock, 'Response should contain a text block');
      assert(!!textBlock!.text && textBlock!.text.length > 5, 'Response text should be non-trivial');
      assert(body.stop_reason === 'end_turn', `Expected stop_reason "end_turn", got "${body.stop_reason}"`);
    },
  },
  // Gemini — 工具调用
  {
    name: 'gemini-tool-call',
    description: 'Gemini 工具调用 — AI 应返回 tool_use block',
    apiKeyName: 'antigravity-gemini',
    buildRequest: () => buildToolCallRequest('antigravity-gemini'),
    validate: (body) => {
      const toolBlock = body.content.find((b) => b.type === 'tool_use');
      assert(!!toolBlock, 'Response should contain a tool_use block');
      assert(toolBlock!.name === 'get_weather', `Expected tool name "get_weather", got "${toolBlock!.name}"`);
      assert(body.stop_reason === 'tool_use', `Expected stop_reason "tool_use", got "${body.stop_reason}"`);
    },
  },
  // Gemini — 工具结果回复
  {
    name: 'gemini-tool-result',
    description: 'Gemini 工具结果 — AI 应基于天气数据回复文本',
    apiKeyName: 'antigravity-gemini',
    buildRequest: () => buildToolResultRequest('antigravity-gemini'),
    validate: (body) => {
      const textBlock = body.content.find((b) => b.type === 'text');
      assert(!!textBlock, 'Response should contain a text block');
      assert(!!textBlock!.text && textBlock!.text.length > 5, 'Response text should be non-trivial');
      assert(body.stop_reason === 'end_turn', `Expected stop_reason "end_turn", got "${body.stop_reason}"`);
    },
  },
];

// ===== 执行器 =====

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

async function runScenario(scenario: TestScenario): Promise<TestResult> {
  const apiKey = API_KEYS[scenario.apiKeyName];
  if (!apiKey) {
    return {
      name: scenario.name,
      passed: false,
      durationMs: 0,
      error: `API Key "${scenario.apiKeyName}" not configured`,
    };
  }

  const start = Date.now();

  try {
    const requestBody = scenario.buildRequest();
    const { body } = await sendStreamingRequest(apiKey, requestBody);
    const durationMs = Date.now() - start;

    // 通用断言
    assertCommonResponse(body);

    // 场景自定义断言
    if (scenario.validate) {
      scenario.validate(body);
    }

    // 打印详情
    const textBlock = body.content.find((b) => b.type === 'text');
    const toolBlock = body.content.find((b) => b.type === 'tool_use');
    const textPreview = textBlock?.text
      ? truncate(textBlock.text, 80)
      : toolBlock
        ? `[tool_use] ${toolBlock.name}(${JSON.stringify(toolBlock.input)})`
        : '(no text)';

    console.log(`   Response ID : ${body.id}`);
    console.log(`   Model       : ${body.model}`);
    console.log(`   Tokens      : ${body.usage.input_tokens} in / ${body.usage.output_tokens} out`);
    console.log(`   Duration    : ${durationMs}ms`);
    console.log(`   Text        : ${textPreview}`);

    return { name: scenario.name, passed: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    return { name: scenario.name, passed: false, durationMs, error: message };
  }
}

async function main() {
  console.log('========================================');
  console.log(' Proxy API Integration Tests (SSE)');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Scenarios: ${TEST_SCENARIOS.length}`);
  console.log('========================================\n');

  const results: TestResult[] = [];

  for (const scenario of TEST_SCENARIOS) {
    console.log(`-- [${scenario.name}] ${scenario.description}`);

    const result = await runScenario(scenario);
    results.push(result);

    if (result.passed) {
      console.log(`   PASS (${result.durationMs}ms)\n`);
    } else {
      console.log(`   FAIL: ${result.error}\n`);
    }
  }

  // 汇总
  console.log('========================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(` Results: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log('========================================');

  if (failed > 0) {
    console.log('\nFailed scenarios:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
    process.exit(1);
  }

  console.log('\nAll tests passed!');
}

main();

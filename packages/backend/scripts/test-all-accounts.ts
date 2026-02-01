/**
 * 测试所有账号，找到能用的
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 使用流式端点（与 claude-router 一致）
const ANTIGRAVITY_ENDPOINT = 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse';
const USER_AGENT = 'antigravity/1.15.8 darwin/arm64';
const ANTHROPIC_BETA = 'interleaved-thinking-2025-01-24,claude-code-2025-01-24';

// Google OAuth Token 刷新 (Antigravity 客户端)
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${error}`);
  }

  return response.json();
}

async function testAccount(account: any): Promise<{ name: string; status: number; message: string }> {
  // 刷新 token
  let accessToken = account.accessToken;
  const tokenExpired = !account.tokenExpiresAt || account.tokenExpiresAt.getTime() < Date.now() + 60000;

  if (tokenExpired) {
    try {
      const tokenData = await refreshAccessToken(account.refreshToken!);
      accessToken = tokenData.access_token;
      await prisma.thirdPartyAccount.update({
        where: { id: account.id },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || account.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        },
      });
    } catch (error: any) {
      return { name: account.name, status: -1, message: `Token refresh failed: ${error.message}` };
    }
  }

  // project ID 不再需要（新格式不使用）

  // 测试请求 - 使用与 Antigravity Manager 相同的格式
  const testBody = {
    model: 'claude-opus-4-5-thinking',
    request: {
      contents: [{ role: 'user', parts: [{ text: 'Say hi' }] }],
      sessionId: `sid-${Date.now()}`,
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'OFF' },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 64000,
        thinkingConfig: {
          thinkingBudget: 8191,
          includeThoughts: true,
        },
      },
      systemInstruction: {
        role: 'user',
        parts: [
          { text: 'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.\nYou are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.\n**Absolute paths only**\n**Proactiveness**' },
        ],
      },
    },
    requestId: `agent-${Date.now()}`,
    userAgent: 'antigravity',
    requestType: 'agent',
  };

  try {
    const response = await fetch(ANTIGRAVITY_ENDPOINT, {
      method: 'POST',
      headers: {
        Host: 'daily-cloudcode-pa.sandbox.googleapis.com',
        'X-App': 'cli',
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Anthropic-Beta': ANTHROPIC_BETA,
        'X-Stainless-Lang': 'python',
        'X-Stainless-Runtime': 'CPython',
        'X-Stainless-Package-Version': '0.43.0',
        'X-Stainless-Runtime-Version': '3.11.0',
      },
      body: JSON.stringify(testBody),
    });

    if (response.ok) {
      // SSE 流式响应，读取所有 data 块
      const text = await response.text();
      console.log('\n=== RAW SSE RESPONSE ===');
      console.log(text.substring(0, 2000));
      console.log('=== END RAW RESPONSE ===\n');

      // 解析所有 data 块
      const dataLines = text.split('\n').filter(line => line.startsWith('data: '));
      const allParts: string[] = [];

      for (const line of dataLines) {
        const jsonStr = line.replace('data: ', '');
        try {
          const data = JSON.parse(jsonStr);
          const parts = data?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.text) {
              allParts.push(part.thought ? `[THINKING] ${part.text}` : part.text);
            }
          }
        } catch {
          // ignore
        }
      }

      const content = allParts.join(' ').substring(0, 200);
      return { name: account.name, status: 200, message: `SUCCESS! Response: ${content || '(empty)'}` };
    } else {
      const error = await response.text();
      return { name: account.name, status: response.status, message: error.substring(0, 100) };
    }
  } catch (error: any) {
    return { name: account.name, status: -3, message: `Request failed: ${error.message}` };
  }
}

async function main() {
  // 查找所有有配额的账号
  const quotas = await prisma.accountQuota.findMany({
    where: {
      modelName: 'claude-opus-4-5-thinking',
      percentage: { gt: 0 },
    },
    include: { account: true },
    orderBy: { percentage: 'desc' },
  });

  console.log(`Found ${quotas.length} accounts with claude-sonnet-4-5 quota > 0%\n`);

  for (const q of quotas) {
    console.log(`Testing ${q.account.name} (${q.percentage}%)...`);
    const result = await testAccount(q.account);
    console.log(`  -> ${result.status}: ${result.message}\n`);

    if (result.status === 200) {
      console.log('\n🎉 Found working account!');
      break;
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

/**
 * 测试账号配额和 API 调用
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ANTIGRAVITY_ENDPOINT = 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent';
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

async function main() {
  // 查找配额最高的 claude-sonnet-4-5 账号
  const quotas = await prisma.accountQuota.findMany({
    where: {
      modelName: 'claude-sonnet-4-5',
      percentage: { gt: 0 },
    },
    include: {
      account: true,
    },
    orderBy: { percentage: 'desc' },
    take: 3,
  });

  console.log('Top 3 accounts with claude-sonnet-4-5 quota:');
  for (const q of quotas) {
    console.log(`  ${q.account.name}: ${q.percentage}% (token expires: ${q.account.tokenExpiresAt})`);
  }

  if (quotas.length === 0) {
    console.log('No accounts with quota found!');
    return;
  }

  // 选择第二个账号测试（第一个可能配额已用完）
  const testQuota = quotas[1] || quotas[0];
  const account = testQuota.account;

  console.log(`\nTesting account: ${account.name}`);

  // 检查是否需要刷新 token
  let accessToken = account.accessToken;
  const tokenExpired = !account.tokenExpiresAt || account.tokenExpiresAt.getTime() < Date.now() + 60000;

  if (tokenExpired) {
    console.log('Token expired, refreshing...');
    try {
      const tokenData = await refreshAccessToken(account.refreshToken!);
      accessToken = tokenData.access_token;

      // 更新数据库
      await prisma.thirdPartyAccount.update({
        where: { id: account.id },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || account.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        },
      });
      console.log('Token refreshed successfully!');
    } catch (error) {
      console.error('Token refresh failed:', error);
      return;
    }
  }

  console.log(`Access token (first 50 chars): ${accessToken?.substring(0, 50)}...`);

  // 获取 project ID
  const subscriptionRaw = account.subscriptionRaw as { projectId?: string } | null;
  const projectId = subscriptionRaw?.projectId;

  if (!projectId) {
    console.log('No project ID found for this account!');
    return;
  }

  console.log(`Project ID: ${projectId}`);

  // 构建最简单的测试请求
  const testBody = {
    project: projectId,
    requestId: `test-${Date.now()}`,
    request: {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Say hi' }],
        },
      ],
      systemInstruction: {
        role: 'user',
        parts: [{ text: 'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.' }],
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'OFF' },
      ],
      generationConfig: {
        maxOutputTokens: 50,
      },
    },
    model: 'claude-sonnet-4-5',
    userAgent: 'antigravity',
    requestType: 'GENERATE_CONTENT',
  };

  console.log('\nSending test request to Antigravity...');
  console.log('Request body:', JSON.stringify(testBody, null, 2).substring(0, 500) + '...');

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
      },
      body: JSON.stringify(testBody),
    });

    console.log(`\nResponse status: ${response.status}`);
    const responseBody = await response.text();
    console.log('Response body:', responseBody.substring(0, 1000));
  } catch (error) {
    console.error('Request failed:', error);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

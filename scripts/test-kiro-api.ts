/**
 * Kiro API 最小功能测试
 *
 * 用途：验证通过 AWS SSO 缓存文件能否成功调用 Kiro API
 *
 * 运行方式：
 *   npx tsx scripts/test-kiro-api.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ===== 配置 =====
const KIRO_AUTH_TOKEN_PATH = path.join(
  process.env.HOME || '',
  '.aws/sso/cache/kiro-auth-token.json'
);

// ===== 类型定义 =====
interface KiroAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  clientIdHash: string;
  authMethod: string;
  provider: string;
  region: string;
}

interface DeviceRegistration {
  clientId: string;
  clientSecret: string;
  expiresAt: string;
}

interface TokenRefreshResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

// ===== 生成机器指纹（模拟 kiro-gateway） =====
function getMachineFingerprint(): string {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const uniqueString = `${hostname}-${username}-kiro-gateway`;
  return crypto.createHash('sha256').update(uniqueString).digest('hex');
}

// ===== 构建 Kiro API 请求头（关键！） =====
function getKiroHeaders(accessToken: string): Record<string, string> {
  const fingerprint = getMachineFingerprint();

  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': `aws-sdk-js/1.0.27 ua/2.1 os/darwin#24.0.0 lang/js md/nodejs#22.0.0 api/codewhispererstreaming#1.0.27 m/E KiroIDE-0.7.45-${fingerprint}`,
    'x-amz-user-agent': `aws-sdk-js/1.0.27 KiroIDE-0.7.45-${fingerprint}`,
    'x-amzn-codewhisperer-optout': 'true',
    'x-amzn-kiro-agent-mode': 'vibe',
    'amz-sdk-invocation-id': crypto.randomUUID(),
    'amz-sdk-request': 'attempt=1; max=3',
  };
}

// ===== 工具函数 =====
function loadKiroAuthToken(): KiroAuthToken {
  const content = fs.readFileSync(KIRO_AUTH_TOKEN_PATH, 'utf-8');
  return JSON.parse(content);
}

function loadDeviceRegistration(clientIdHash: string): DeviceRegistration {
  const deviceRegPath = path.join(
    process.env.HOME || '',
    `.aws/sso/cache/${clientIdHash}.json`
  );
  const content = fs.readFileSync(deviceRegPath, 'utf-8');
  return JSON.parse(content);
}

function isTokenExpired(expiresAt: string): boolean {
  const expiresDate = new Date(expiresAt);
  const now = new Date();
  // 提前 5 分钟判断过期
  return now.getTime() > expiresDate.getTime() - 5 * 60 * 1000;
}

// ===== Token 刷新 =====
async function refreshToken(
  authToken: KiroAuthToken,
  deviceReg: DeviceRegistration
): Promise<string> {
  console.log('🔄 Token 已过期或即将过期，正在刷新...');

  const url = `https://oidc.${authToken.region}.amazonaws.com/token`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grantType: 'refresh_token',
      clientId: deviceReg.clientId,
      clientSecret: deviceReg.clientSecret,
      refreshToken: authToken.refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token 刷新失败: ${response.status} - ${errorText}`);
  }

  const data: TokenRefreshResponse = await response.json();
  console.log('✅ Token 刷新成功');

  // 更新本地缓存文件
  const updatedToken: KiroAuthToken = {
    ...authToken,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || authToken.refreshToken,
    expiresAt: new Date(Date.now() + data.expiresIn * 1000).toISOString(),
  };

  fs.writeFileSync(KIRO_AUTH_TOKEN_PATH, JSON.stringify(updatedToken, null, 2));
  console.log('💾 已更新本地 Token 缓存');

  return data.accessToken;
}

// ===== API 调用 =====
async function listModels(accessToken: string, region: string): Promise<void> {
  console.log('\n📋 获取可用模型列表...');

  // 关键：需要 origin 参数
  const url = `https://q.${region}.amazonaws.com/ListAvailableModels?origin=AI_EDITOR`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getKiroHeaders(accessToken),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`获取模型列表失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('✅ 可用模型:');

  if (data.models && Array.isArray(data.models)) {
    data.models.forEach((model: { modelId: string }) => {
      console.log(`   - ${model.modelId}`);
    });
  } else {
    console.log('   (无法解析模型列表)');
    console.log(JSON.stringify(data, null, 2));
  }
}

async function sendChatMessage(accessToken: string, region: string): Promise<void> {
  console.log('\n💬 测试对话 API (generateAssistantResponse)...');

  const url = `https://q.${region}.amazonaws.com/generateAssistantResponse`;

  // 构建 Kiro API 请求体 - 参考 kiro-gateway 的格式
  const requestBody = {
    conversationState: {
      chatTriggerType: 'MANUAL',
      conversationId: `test-${Date.now()}`,
      currentMessage: {
        userInputMessage: {
          content: 'Hello! Please respond with a short greeting in one sentence.',
          modelId: 'claude-sonnet-4',  // 使用具体的模型
          origin: 'AI_EDITOR',
        },
      },
    },
  };

  const headers = getKiroHeaders(accessToken);
  headers['Accept'] = 'application/vnd.amazon.eventstream';

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`对话请求失败: ${response.status} - ${errorText}`);
  }

  console.log('✅ 对话 API 响应成功 (SSE 流)');

  // 读取流式响应
  const reader = response.body?.getReader();
  if (!reader) {
    console.log('   (无法读取响应流)');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let contentText = '';

  console.log('\n📝 AI 响应:');
  process.stdout.write('   ');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 简单解析 SSE 事件中的文本内容
      // Kiro API 返回的是 AWS EventStream 格式，这里做简化处理
      const textMatch = buffer.match(/"text":"([^"]+)"/g);
      if (textMatch) {
        textMatch.forEach(match => {
          const text = match.replace(/"text":"/, '').replace(/"$/, '');
          if (!contentText.includes(text)) {
            contentText += text;
            process.stdout.write(text);
          }
        });
      }
    }
    console.log('\n');
  } finally {
    reader.releaseLock();
  }
}

// ===== 主函数 =====
async function main() {
  console.log('🚀 Kiro API 最小功能测试\n');
  console.log('='.repeat(50));

  try {
    // 1. 加载认证信息
    console.log('\n📂 加载认证信息...');
    const authToken = loadKiroAuthToken();
    console.log(`   - Region: ${authToken.region}`);
    console.log(`   - Provider: ${authToken.provider}`);
    console.log(`   - Auth Method: ${authToken.authMethod}`);
    console.log(`   - Expires At: ${authToken.expiresAt}`);

    const deviceReg = loadDeviceRegistration(authToken.clientIdHash);
    console.log(`   - Client ID: ${deviceReg.clientId.substring(0, 20)}...`);

    // 2. 检查 Token 是否过期
    let accessToken = authToken.accessToken;
    if (isTokenExpired(authToken.expiresAt)) {
      accessToken = await refreshToken(authToken, deviceReg);
    } else {
      console.log('✅ Token 有效，无需刷新');
    }

    // 3. 测试 API 调用
    await listModels(accessToken, authToken.region);
    await sendChatMessage(accessToken, authToken.region);

    console.log('='.repeat(50));
    console.log('🎉 所有测试通过！Kiro API 授权验证成功\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

main();

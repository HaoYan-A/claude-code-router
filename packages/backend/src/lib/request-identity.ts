/**
 * 请求身份伪装模块
 *
 * 参照 Antigravity-Manager 的 constants.rs + version.rs，实现动态 Header 生成。
 * 核心能力：
 * 1. 动态 User-Agent 构建（匹配 TLS 指纹的 Chrome 版本）
 * 2. 客户端身份 Header 注入
 * 3. 版本检测策略
 */

import * as os from 'os';
import * as crypto from 'crypto';

// 已知稳定版本号（兜底值）
const KNOWN_STABLE = {
  version: '1.16.5',
  electron: '39.2.3',
  chrome: '132.0.6834.160',
  nodeVersion: '22.11.0',
};

// 平台映射
const PLATFORM_MAP: Record<string, string> = {
  darwin: 'Macintosh; Intel Mac OS X 10_15_7',
  win32: 'Windows NT 10.0; Win64; x64',
  linux: 'X11; Linux x86_64',
};

/**
 * 构建动态 User-Agent
 * 格式: Mozilla/5.0 (platform) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.160 Electron/39.2.3 Safari/537.36
 */
export function buildUserAgent(customUA?: string): string {
  if (customUA) return customUA;

  const platform = PLATFORM_MAP[process.platform] || PLATFORM_MAP.linux;

  return [
    `Mozilla/5.0 (${platform})`,
    'AppleWebKit/537.36 (KHTML, like Gecko)',
    `Chrome/${KNOWN_STABLE.chrome}`,
    `Electron/${KNOWN_STABLE.electron}`,
    'Safari/537.36',
  ].join(' ');
}

/**
 * 构建 Antigravity 风格的简短 User-Agent
 * 格式: antigravity/{version} {os}/{arch}
 */
export function buildAntigravityUA(): string {
  const osName = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch;
  return `antigravity/${KNOWN_STABLE.version} ${osName}/${arch}`;
}

/**
 * 获取客户端身份 Header
 * 模拟 Antigravity 客户端的身份标识
 */
export function getIdentityHeaders(): Record<string, string> {
  return {
    'x-client-name': 'antigravity',
    'x-client-version': KNOWN_STABLE.version,
    'x-machine-id': getMachineId(),
    'x-vscode-sessionid': getProcessSessionId(),
    'x-goog-api-client': `gl-node/${KNOWN_STABLE.nodeVersion} fire/0.8.6 grpc/1.10.x`,
  };
}

// 缓存 machine ID
let cachedMachineId: string | undefined;

/**
 * 获取持久化 Machine ID
 * 基于 hostname + username 的稳定哈希（重启不变）
 */
export function getMachineId(): string {
  if (cachedMachineId) return cachedMachineId;

  const hostname = os.hostname();
  const username = os.userInfo().username;
  const raw = `${hostname}-${username}-antigravity-router`;
  cachedMachineId = crypto.createHash('sha256').update(raw).digest('hex');
  return cachedMachineId;
}

// 进程级 Session ID（每次启动生成）
let processSessionId: string | undefined;

/**
 * 获取进程级 Session ID
 * 每次进程启动时生成，整个生命周期内不变
 */
export function getProcessSessionId(): string {
  if (!processSessionId) {
    processSessionId = `${crypto.randomUUID()}${Date.now()}`;
  }
  return processSessionId;
}

/**
 * 获取已知稳定版本信息
 */
export function getKnownStableVersions() {
  return { ...KNOWN_STABLE };
}

/**
 * 请求身份模块
 *
 * 构建与真实 Antigravity 客户端一致的 User-Agent。
 * 基于抓包真实 Antigravity 1.18.4 客户端的请求格式。
 */

// 已知稳定版本号（兜底值）
// 从 https://antigravity-auto-updater-*.run.app 获取最新稳定版
const KNOWN_STABLE = {
  version: '1.18.4',
};

/**
 * 构建 Antigravity 短格式 User-Agent
 * 格式: antigravity/${version} ${os}/${arch}
 * 示例: antigravity/1.18.4 darwin/arm64
 */
export function buildAntigravityUA(): string {
  const os = process.platform;   // darwin / linux / win32
  const arch = process.arch;     // arm64 / x64
  return `antigravity/${KNOWN_STABLE.version} ${os}/${arch}`;
}

/**
 * 获取已知稳定版本信息
 */
export function getKnownStableVersions() {
  return { ...KNOWN_STABLE };
}

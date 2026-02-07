/**
 * 平台与模型配置（硬编码）
 * 平台支持的模型列表通过代码配置维护，不存数据库
 */

export const PLATFORM_MODELS = {
  antigravity: {
    name: 'Antigravity',
    models: [
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku' },
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'claude-opus-4', name: 'Claude Opus 4' },
    ],
  },
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex' },
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini' },
    ],
  },
} as const;

export type PlatformType = keyof typeof PLATFORM_MODELS;

export type PlatformModel = {
  id: string;
  name: string;
};

/**
 * 获取指定平台支持的模型列表
 */
export function getPlatformModels(platform: PlatformType): readonly PlatformModel[] {
  return PLATFORM_MODELS[platform]?.models ?? [];
}

/**
 * 获取所有平台及其支持的模型
 */
export function getAllPlatformModels(): Record<PlatformType, readonly PlatformModel[]> {
  const result: Record<string, readonly PlatformModel[]> = {};
  for (const [platform, config] of Object.entries(PLATFORM_MODELS)) {
    result[platform] = config.models;
  }
  return result as Record<PlatformType, readonly PlatformModel[]>;
}

/**
 * 检查平台是否支持指定模型
 */
export function isPlatformModelSupported(platform: PlatformType, modelId: string): boolean {
  const models = PLATFORM_MODELS[platform]?.models ?? [];
  return models.some((m) => m.id === modelId);
}

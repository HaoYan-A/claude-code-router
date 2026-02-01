export const PLATFORMS = {
  antigravity: {
    id: 'antigravity',
    name: 'Antigravity',
    models: [
      { id: 'claude-opus-4-5-thinking', name: 'Claude Opus 4.5 Thinking' },
      { id: 'claude-sonnet-4-5-thinking', name: 'Claude Sonnet 4.5 Thinking' },
      { id: 'gemini-3-pro-high', name: 'Gemini 3 Pro' },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
    ],
  },
  kiro: {
    id: 'kiro',
    name: 'Kiro',
    models: [
      { id: 'claude-opus-4.5', name: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5' },
    ],
  },
} as const;

export type PlatformId = keyof typeof PLATFORMS;
export type ClaudeModelSlot = (typeof CLAUDE_MODEL_SLOTS)[number];

export const CLAUDE_MODEL_SLOTS = ['opus', 'sonnet', 'haiku'] as const;

export const DEFAULT_MODEL_MAPPINGS: Record<
  ClaudeModelSlot,
  { platform: PlatformId; model: string }
> = {
  opus: { platform: 'antigravity', model: 'claude-opus-4-5-thinking' },
  sonnet: { platform: 'antigravity', model: 'claude-sonnet-4-5-thinking' },
  haiku: { platform: 'antigravity', model: 'gemini-3-flash' },
};

// 模型定价 (每 1M tokens, USD)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'antigravity/claude-opus-4-5-thinking': { input: 15.0, output: 75.0 },
  'antigravity/claude-sonnet-4-5-thinking': { input: 3.0, output: 15.0 },
  'antigravity/gemini-3-pro-high': { input: 1.25, output: 5.0 },
  'antigravity/gemini-3-flash': { input: 0.075, output: 0.3 },
  'kiro/claude-opus-4.5': { input: 15.0, output: 75.0 },
  'kiro/claude-sonnet-4.5': { input: 3.0, output: 15.0 },
  'kiro/claude-haiku-4.5': { input: 0.8, output: 4.0 },
};

export const STATS_TIME_RANGES = ['total', 'month', 'week', 'day'] as const;
export type StatsTimeRange = (typeof STATS_TIME_RANGES)[number];

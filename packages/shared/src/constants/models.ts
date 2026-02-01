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

export const STATS_TIME_RANGES = ['total', 'month', 'week', 'day'] as const;
export type StatsTimeRange = (typeof STATS_TIME_RANGES)[number];

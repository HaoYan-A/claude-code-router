export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'max', 'auto'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const PLATFORMS = {
  antigravity: {
    id: 'antigravity',
    name: 'Antigravity',
    models: [
      { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 Thinking' },
      { id: 'claude-opus-4-5-thinking', name: 'Claude Opus 4.5 Thinking' },
      { id: 'claude-sonnet-4-6-thinking', name: 'Claude Sonnet 4.6 Thinking' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
    ],
  },
  kiro: {
    id: 'kiro',
    name: 'Kiro',
    models: [
      { id: 'claude-opus-4.6', name: 'Claude Opus 4.6' },
      { id: 'claude-opus-4.5', name: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5' },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', reasoningEfforts: ['none', 'low', 'medium', 'high', 'auto'] as const },
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', reasoningEfforts: ['none', 'low', 'medium', 'high', 'auto'] as const },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', reasoningEfforts: ['none', 'medium', 'high', 'auto'] as const },
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
  opus: { platform: 'antigravity', model: 'claude-opus-4-6-thinking' },
  sonnet: { platform: 'antigravity', model: 'claude-sonnet-4-6-thinking' },
  haiku: { platform: 'antigravity', model: 'gemini-3-flash' },
};

export const STATS_TIME_RANGES = ['total', 'month', 'week', 'day'] as const;
export type StatsTimeRange = (typeof STATS_TIME_RANGES)[number];

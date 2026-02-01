export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

export const CLAUDE_API_BASE_URL = 'https://api.anthropic.com';
export const CLAUDE_API_VERSION = '2023-06-01';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const TOKEN_EXPIRY = {
  ACCESS_TOKEN: '15m',
  REFRESH_TOKEN: '7d',
} as const;

export const RATE_LIMIT = {
  WINDOW_MS: 60 * 1000, // 1 minute
  MAX_REQUESTS: 100,
} as const;

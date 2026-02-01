export type RequestStatus = 'success' | 'error' | 'pending';

export interface RequestLog {
  id: string;
  userId: string;
  apiKeyId: string;
  method: string;
  path: string;
  status: RequestStatus;
  statusCode: number | null;
  requestBody: string | null;
  responseBody: string | null;
  errorMessage: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  clientIp: string | null;
  userAgent: string | null;
  model: string | null;
  targetModel: string | null;
  platform: string | null;
  accountId: string | null;
  createdAt: Date;

  // 客户端请求头 (JSON，已脱敏)
  clientHeaders: string | null;

  // 下游请求 (发给 Antigravity)
  upstreamRequestHeaders: string | null;
  upstreamRequestBody: string | null;

  // 下游响应 (Antigravity 返回)
  upstreamResponseHeaders: string | null;
  upstreamResponseBody: string | null;

  // 客户端响应头
  clientResponseHeaders: string | null;

  // 缓存 Token (映射后)
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;

  // 原始 Token (Google 返回，用于对账)
  rawInputTokens: number | null;
  rawOutputTokens: number | null;
  rawCacheTokens: number | null;
}

export interface LogFilter {
  userId?: string;
  apiKeyId?: string;
  status?: RequestStatus;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface PaginatedLogs {
  data: RequestLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

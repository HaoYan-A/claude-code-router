import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  AdminLoginSchema,
  AdminLoginResponseSchema,
  UserResponse,
  UpdateUserSchema,
  ApiKeyWithMappingsResponse,
  ApiKeyWithKeyResponse,
  ApiKeyWithUserResponse,
  CreateApiKeySchema,
  UpdateApiKeySchema,
  PaginatedLogsResponse,
  LogFilterSchema,
  StatsTimeRange,
  ApiKeyUsageStatsResponse,
  ApiKeyDailyUsageResponse,
  QuotaSummaryResponse,
  LeaderboardTimeRange,
  LeaderboardResponse,
  ModelLeaderboardResponse,
} from '@claude-code-router/shared';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// Auth
export function useAdminLogin() {
  return useMutation({
    mutationFn: (data: AdminLoginSchema) =>
      api.post<ApiResponse<AdminLoginResponseSchema>>('/auth/admin/login', data, { skipAuth: true }),
  });
}

// Users
export function useUsers(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['users', page, pageSize],
    queryFn: () =>
      api.get<PaginatedResponse<UserResponse>>(`/users?page=${page}&pageSize=${pageSize}`),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserSchema }) =>
      api.patch<ApiResponse<UserResponse>>(`/users/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<void>>(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

// API Keys
export function useApiKeys(page = 1, pageSize = 20, enabled = true) {
  return useQuery({
    queryKey: ['api-keys', page, pageSize],
    queryFn: () =>
      api.get<PaginatedResponse<ApiKeyWithMappingsResponse>>(
        `/api-keys?page=${page}&pageSize=${pageSize}`
      ),
    enabled,
  });
}

export function useApiKey(id: string) {
  return useQuery({
    queryKey: ['api-keys', id],
    queryFn: () => api.get<ApiResponse<ApiKeyWithMappingsResponse>>(`/api-keys/${id}`),
    enabled: !!id,
  });
}

export function useApiKeyStats(
  id: string,
  timeRange: StatsTimeRange = 'month',
  includeDaily = false,
  enabled = true
) {
  return useQuery({
    queryKey: ['api-keys', id, 'stats', timeRange, includeDaily],
    queryFn: () =>
      api.get<
        ApiResponse<{
          stats: ApiKeyUsageStatsResponse;
          daily?: ApiKeyDailyUsageResponse[];
        }>
      >(`/api-keys/${id}/stats?timeRange=${timeRange}&includeDaily=${includeDaily}`),
    enabled: !!id && enabled,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApiKeySchema) =>
      api.post<ApiResponse<ApiKeyWithKeyResponse>>('/api-keys', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useUpdateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateApiKeySchema }) =>
      api.patch<ApiResponse<ApiKeyWithMappingsResponse>>(`/api-keys/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<void>>(`/api-keys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

// Admin API Keys
export function useAdminApiKeys(page = 1, pageSize = 20, userId?: string, enabled = true) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (userId) params.set('userId', userId);

  return useQuery({
    queryKey: ['admin', 'api-keys', page, pageSize, userId],
    queryFn: () =>
      api.get<PaginatedResponse<ApiKeyWithUserResponse>>(`/api-keys/admin/all?${params}`),
    enabled,
  });
}

export function useAdminApiKeyStats(
  id: string,
  timeRange: StatsTimeRange = 'month',
  includeDaily = false,
  enabled = true
) {
  return useQuery({
    queryKey: ['admin', 'api-keys', id, 'stats', timeRange, includeDaily],
    queryFn: () =>
      api.get<
        ApiResponse<{
          stats: ApiKeyUsageStatsResponse;
          daily?: ApiKeyDailyUsageResponse[];
        }>
      >(`/api-keys/admin/${id}/stats?timeRange=${timeRange}&includeDaily=${includeDaily}`),
    enabled: !!id && enabled,
  });
}

export function useAdminUpdateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateApiKeySchema }) =>
      api.patch<ApiResponse<ApiKeyWithMappingsResponse>>(`/api-keys/admin/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useAdminDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<void>>(`/api-keys/admin/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

// Logs
export function useLogs(filter: LogFilterSchema) {
  return useQuery({
    queryKey: ['logs', filter],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value));
      });
      return api.get<ApiResponse<PaginatedLogsResponse>>(`/logs?${params.toString()}`);
    },
  });
}

export function useLogDetail(id: string | null) {
  return useQuery({
    queryKey: ['logs', id, 'detail'],
    queryFn: () => api.get<ApiResponse<import('@claude-code-router/shared').RequestLog>>(`/logs/${id}`),
    enabled: !!id,
  });
}

export function useLogStats(timeRange: StatsTimeRange = 'total') {
  return useQuery({
    queryKey: ['logs', 'stats', timeRange],
    queryFn: () =>
      api.get<
        ApiResponse<{
          totalRequests: number;
          successRequests: number;
          errorRequests: number;
          totalInputTokens: number;
          totalOutputTokens: number;
          totalCost: number;
        }>
      >(`/logs/stats?timeRange=${timeRange}`),
  });
}

// Quota Summary
export function useQuotaSummary() {
  return useQuery({
    queryKey: ['quota', 'summary'],
    queryFn: () => api.get<ApiResponse<QuotaSummaryResponse>>('/quota/summary'),
    refetchInterval: 60000, // 每分钟刷新
  });
}

// Leaderboard
export function useLeaderboard(timeRange: LeaderboardTimeRange = 'day') {
  return useQuery({
    queryKey: ['leaderboard', timeRange],
    queryFn: () => api.get<ApiResponse<LeaderboardResponse>>(`/logs/leaderboard?timeRange=${timeRange}`),
    staleTime: 60 * 1000, // 1分钟内不重新请求
  });
}

export function useModelLeaderboard(timeRange: LeaderboardTimeRange = 'day') {
  return useQuery({
    queryKey: ['model-leaderboard', timeRange],
    queryFn: () =>
      api.get<ApiResponse<ModelLeaderboardResponse>>(`/logs/model-leaderboard?timeRange=${timeRange}`),
    staleTime: 60 * 1000,
  });
}

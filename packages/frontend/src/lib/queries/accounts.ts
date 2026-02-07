import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type {
  ThirdPartyAccount,
  AccountQuota,
  CreateAccountInput,
  UpdateAccountInput,
  OAuthUrlResponse,
  OAuthExchangeInput,
  AccountListQuery,
  PlatformModelsResponse,
  ImportKiroAccountInput,
  ImportOpenAIAccountInput,
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

// 获取账号列表
export function useAccounts(query?: Partial<AccountListQuery>) {
  const params = new URLSearchParams();
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) params.set(key, String(value));
    });
  }

  return useQuery({
    queryKey: ['accounts', query],
    queryFn: () =>
      api.get<PaginatedResponse<ThirdPartyAccount>>(
        `/accounts${params.toString() ? `?${params.toString()}` : ''}`
      ),
  });
}

// 获取单个账号
export function useAccount(id: string) {
  return useQuery({
    queryKey: ['accounts', id],
    queryFn: () => api.get<ApiResponse<ThirdPartyAccount>>(`/accounts/${id}`),
    enabled: !!id,
  });
}

// 获取账号额度
export function useAccountQuota(id: string) {
  return useQuery({
    queryKey: ['accounts', id, 'quota'],
    queryFn: () => api.get<ApiResponse<AccountQuota[]>>(`/accounts/${id}/quota`),
    enabled: !!id,
  });
}

// 获取平台模型列表
export function usePlatformModels() {
  return useQuery({
    queryKey: ['accounts', 'models'],
    queryFn: () => api.get<ApiResponse<PlatformModelsResponse>>('/accounts/models'),
  });
}

// 获取 OAuth URL
export function useOAuthUrl() {
  return useQuery({
    queryKey: ['accounts', 'oauth-url'],
    queryFn: () => api.get<ApiResponse<OAuthUrlResponse>>('/accounts/antigravity/oauth-url'),
    staleTime: 1000 * 60 * 5, // 5分钟缓存
  });
}

// 创建账号（使用 RefreshToken）
export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAccountInput) =>
      api.post<ApiResponse<ThirdPartyAccount>>('/accounts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// OAuth 交换
export function useOAuthExchange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OAuthExchangeInput) =>
      api.post<ApiResponse<ThirdPartyAccount>>('/accounts/antigravity/exchange', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// 更新账号
export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAccountInput }) =>
      api.patch<ApiResponse<ThirdPartyAccount>>(`/accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// 删除账号
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<void>>(`/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// 刷新单个账号额度
export function useRefreshQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiResponse<AccountQuota[]>>(`/accounts/${id}/quota/refresh`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', id, 'quota'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// 批量刷新所有账号额度
export function useRefreshAllQuotas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ApiResponse<void>>('/accounts/quota/refresh-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// 刷新账号 Token
export function useRefreshToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ApiResponse<ThirdPartyAccount>>(`/accounts/${id}/token/refresh`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', id] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// 导入 Kiro 账号
export function useImportKiroAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportKiroAccountInput) =>
      api.post<ApiResponse<ThirdPartyAccount>>('/accounts/kiro/import', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// 导入 OpenAI 账号
export function useImportOpenAIAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportOpenAIAccountInput) =>
      api.post<ApiResponse<ThirdPartyAccount>>('/accounts/openai/import', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

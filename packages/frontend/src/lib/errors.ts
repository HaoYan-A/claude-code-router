/**
 * 后端 API 错误响应结构
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * API 错误类，封装后端返回的结构化错误信息
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /**
   * 类型守卫：判断是否为 ApiError 实例
   */
  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }

  /**
   * 从后端响应创建 ApiError 实例
   */
  static fromResponse(data: ApiErrorResponse, statusCode?: number): ApiError {
    return new ApiError(
      data.error.code,
      data.error.message,
      data.error.details,
      statusCode
    );
  }
}

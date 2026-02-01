import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas30';
import { z } from 'zod';
import {
  adminLoginSchema,
  adminLoginResponseSchema,
  userLoginResponseSchema,
  refreshTokenSchema,
  updateUserSchema,
  userResponseSchema,
  createApiKeySchema,
  apiKeyResponseSchema,
  apiKeyWithKeyResponseSchema,
  logFilterSchema,
  paginatedLogsResponseSchema,
} from '@claude-code-router/shared';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Auth endpoints
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/admin/login',
  tags: ['Auth'],
  summary: 'Admin login',
  request: {
    body: {
      content: { 'application/json': { schema: adminLoginSchema } },
    },
  },
  responses: {
    200: {
      description: 'Successful login',
      content: { 'application/json': { schema: adminLoginResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/github',
  tags: ['Auth'],
  summary: 'GitHub OAuth login redirect',
  responses: {
    302: {
      description: 'Redirect to GitHub',
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/github/callback',
  tags: ['Auth'],
  summary: 'GitHub OAuth callback',
  responses: {
    302: {
      description: 'Redirect to frontend with tokens',
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: ['Auth'],
  summary: 'Refresh access token',
  request: {
    body: {
      content: { 'application/json': { schema: refreshTokenSchema } },
    },
  },
  responses: {
    200: {
      description: 'Token refreshed',
      content: {
        'application/json': {
          schema: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  tags: ['Auth'],
  summary: 'Get current user',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Current user info',
      content: { 'application/json': { schema: userLoginResponseSchema } },
    },
  },
});

// User endpoints
registry.registerPath({
  method: 'get',
  path: '/api/v1/users',
  tags: ['Users'],
  summary: 'List all users (admin only)',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of users',
      content: { 'application/json': { schema: z.array(userResponseSchema) } },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/users/{id}',
  tags: ['Users'],
  summary: 'Update a user (admin only)',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: { 'application/json': { schema: updateUserSchema } },
    },
  },
  responses: {
    200: {
      description: 'User updated',
      content: { 'application/json': { schema: userResponseSchema } },
    },
  },
});

// API Key endpoints
registry.registerPath({
  method: 'get',
  path: '/api/v1/api-keys',
  tags: ['API Keys'],
  summary: 'List user API keys',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of API keys',
      content: { 'application/json': { schema: z.array(apiKeyResponseSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/api-keys',
  tags: ['API Keys'],
  summary: 'Create a new API key',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: createApiKeySchema } },
    },
  },
  responses: {
    201: {
      description: 'API key created',
      content: { 'application/json': { schema: apiKeyWithKeyResponseSchema } },
    },
  },
});

// Log endpoints
registry.registerPath({
  method: 'get',
  path: '/api/v1/logs',
  tags: ['Logs'],
  summary: 'List request logs',
  security: [{ bearerAuth: [] }],
  request: {
    query: logFilterSchema,
  },
  responses: {
    200: {
      description: 'Paginated logs',
      content: { 'application/json': { schema: paginatedLogsResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/logs/stats',
  tags: ['Logs'],
  summary: 'Get usage statistics',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Usage statistics',
      content: {
        'application/json': {
          schema: z.object({
            totalRequests: z.number(),
            successRequests: z.number(),
            errorRequests: z.number(),
            totalInputTokens: z.number(),
            totalOutputTokens: z.number(),
          }),
        },
      },
    },
  },
});

// Security scheme
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

export function generateOpenAPIDocument(): OpenAPIObject {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Claude Code Router API',
      version: '1.0.0',
      description: 'API for routing Claude API requests with user management and logging',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
  });
}

import { z } from 'zod';
import { userResponseSchema } from './user.schema.js';

export const adminLoginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const adminUserSchema = z.object({
  id: z.literal('admin'),
  role: z.literal('admin'),
  githubUsername: z.literal('admin'),
});

export const adminLoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: adminUserSchema,
});

export const userLoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userResponseSchema,
});

export type AdminLoginSchema = z.infer<typeof adminLoginSchema>;
export type RefreshTokenSchema = z.infer<typeof refreshTokenSchema>;
export type AdminLoginResponseSchema = z.infer<typeof adminLoginResponseSchema>;
export type UserLoginResponseSchema = z.infer<typeof userLoginResponseSchema>;

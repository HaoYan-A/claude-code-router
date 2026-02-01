import { z } from 'zod';

export const userRoleSchema = z.enum(['admin', 'user']);

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: userRoleSchema.optional(),
  isActive: z.boolean().optional(),
});

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  githubId: z.string(),
  githubUsername: z.string(),
  avatarUrl: z.string().nullable(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  role: userRoleSchema,
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type UpdateUserSchema = z.infer<typeof updateUserSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;

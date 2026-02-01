import type { User, Prisma } from '@prisma/client';
import type { UpdateUserSchema, PaginationInput } from '@claude-code-router/shared';
import { prisma } from '../../lib/prisma.js';
import { redis, cacheKeys } from '../../lib/redis.js';

const USER_CACHE_TTL = 300; // 5 minutes

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const cached = await redis.get(cacheKeys.user(id));
    if (cached) {
      return JSON.parse(cached);
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (user) {
      await redis.setex(cacheKeys.user(id), USER_CACHE_TTL, JSON.stringify(user));
    }
    return user;
  }

  async findByGithubId(githubId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { githubId } });
  }

  async findMany(pagination: PaginationInput): Promise<{ data: User[]; total: number }> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);

    return { data, total };
  }

  async update(id: string, input: UpdateUserSchema): Promise<User> {
    const user = await prisma.user.update({
      where: { id },
      data: input as Prisma.UserUpdateInput,
    });

    await redis.del(cacheKeys.user(id));
    return user;
  }

  async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
    await redis.del(cacheKeys.user(id));
  }
}

export const userRepository = new UserRepository();

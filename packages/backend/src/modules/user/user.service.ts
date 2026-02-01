import type { UpdateUserSchema, PaginationInput } from '@claude-code-router/shared';
import { ErrorCodes } from '@claude-code-router/shared';
import { userRepository } from './user.repository.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class UserService {
  async getById(id: string) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, ErrorCodes.USER_NOT_FOUND, 'User not found');
    }
    return user;
  }

  async getAll(pagination: PaginationInput) {
    const { data, total } = await userRepository.findMany(pagination);
    return {
      data,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil(total / pagination.pageSize),
    };
  }

  async update(id: string, input: UpdateUserSchema) {
    await this.getById(id);
    return userRepository.update(id, input);
  }

  async delete(id: string) {
    await this.getById(id);
    await userRepository.delete(id);
  }
}

export const userService = new UserService();

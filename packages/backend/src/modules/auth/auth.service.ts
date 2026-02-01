import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { generateState } from 'arctic';
import type { JwtPayload, AdminLoginResponseSchema, UserLoginResponseSchema } from '@claude-code-router/shared';
import { ErrorCodes } from '@claude-code-router/shared';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { github, getGitHubUser, type GitHubUser } from '../../lib/github.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class AuthService {
  async adminLogin(password: string): Promise<AdminLoginResponseSchema> {
    if (password !== env.ADMIN_PASSWORD) {
      throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'Invalid password');
    }

    const accessToken = this.generateAdminAccessToken();
    const refreshToken = await this.generateRefreshToken(null, true);

    return {
      accessToken,
      refreshToken,
      user: {
        id: 'admin',
        role: 'admin',
        githubUsername: 'admin',
      },
    };
  }

  getGitHubAuthUrl(): { url: string; state: string } {
    const state = generateState();
    const url = github.createAuthorizationURL(state, ['read:user', 'user:email']);
    return { url: url.toString(), state };
  }

  async handleGitHubCallback(code: string): Promise<UserLoginResponseSchema> {
    const tokens = await github.validateAuthorizationCode(code);
    const githubUser = await getGitHubUser(tokens.accessToken());

    const user = await this.findOrCreateUser(githubUser);

    if (!user.isActive) {
      throw new AppError(401, ErrorCodes.USER_INACTIVE, 'User account is inactive');
    }

    const accessToken = this.generateUserAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id, false);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        avatarUrl: user.avatarUrl,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  private async findOrCreateUser(githubUser: GitHubUser) {
    const existingUser = await prisma.user.findUnique({
      where: { githubId: String(githubUser.id) },
    });

    if (existingUser) {
      return prisma.user.update({
        where: { id: existingUser.id },
        data: {
          githubUsername: githubUser.login,
          avatarUrl: githubUser.avatar_url,
          email: githubUser.email,
          name: githubUser.name,
        },
      });
    }

    return prisma.user.create({
      data: {
        githubId: String(githubUser.id),
        githubUsername: githubUser.login,
        avatarUrl: githubUser.avatar_url,
        email: githubUser.email,
        name: githubUser.name,
        role: 'user',
      },
    });
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new AppError(401, ErrorCodes.REFRESH_TOKEN_EXPIRED, 'Refresh token is invalid or expired');
    }

    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    if (storedToken.isAdmin) {
      const newAccessToken = this.generateAdminAccessToken();
      const newRefreshToken = await this.generateRefreshToken(null, true);
      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }

    const user = await prisma.user.findUnique({
      where: { id: storedToken.userId! },
    });

    if (!user || !user.isActive) {
      throw new AppError(401, ErrorCodes.USER_INACTIVE, 'User account is inactive');
    }

    const newAccessToken = this.generateUserAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user.id, false);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(userId: string | null, isAdmin: boolean, refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    if (isAdmin) {
      await prisma.refreshToken.deleteMany({
        where: { isAdmin: true, tokenHash },
      });
    } else {
      await prisma.refreshToken.deleteMany({
        where: { userId, tokenHash },
      });
    }
  }

  async logoutAll(userId: string | null, isAdmin: boolean): Promise<void> {
    if (isAdmin) {
      await prisma.refreshToken.deleteMany({
        where: { isAdmin: true },
      });
    } else {
      await prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }
  }

  async getMe(userId: string, isAdmin: boolean) {
    if (isAdmin) {
      return {
        id: 'admin',
        role: 'admin' as const,
        githubUsername: 'admin',
        isAdmin: true,
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError(404, ErrorCodes.USER_NOT_FOUND, 'User not found');
    }

    return {
      id: user.id,
      githubId: user.githubId,
      githubUsername: user.githubUsername,
      avatarUrl: user.avatarUrl,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isAdmin: false,
    };
  }

  private generateAdminAccessToken(): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: 'admin',
      role: 'admin',
      isAdmin: true,
      githubUsername: 'admin',
    };

    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as string,
    } as jwt.SignOptions);
  }

  private generateUserAccessToken(user: { id: string; role: string; githubUsername: string }): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      role: user.role as 'admin' | 'user',
      isAdmin: false,
      githubUsername: user.githubUsername,
    };

    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as string,
    } as jwt.SignOptions);
  }

  private async generateRefreshToken(userId: string | null, isAdmin: boolean): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(token);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        userId,
        isAdmin,
        tokenHash,
        expiresAt,
      },
    });

    return token;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

export const authService = new AuthService();

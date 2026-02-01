import type { User, UserRole } from './user.js';

export interface AdminLoginInput {
  password: string;
}

export interface AdminLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: 'admin';
    role: 'admin';
    githubUsername: 'admin';
  };
}

export interface UserLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  isAdmin?: boolean;
  githubUsername?: string;
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: string;
  role: UserRole;
  isAdmin: boolean;
  githubUsername?: string;
}

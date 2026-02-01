export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  githubId: string;
  githubUsername: string;
  avatarUrl: string | null;
  email: string | null;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UpdateUserInput = Partial<Pick<User, 'name' | 'role' | 'isActive'>>;

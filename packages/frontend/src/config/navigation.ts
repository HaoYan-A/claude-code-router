import { LayoutDashboard, Users, Key, FileText, Cloud, Book, Lightbulb, LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navigationConfig: NavGroup[] = [
  {
    label: '概览',
    items: [
      { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
    ],
  },
  {
    label: '管理',
    items: [
      { path: '/users', label: '用户', icon: Users, adminOnly: true },
      { path: '/accounts', label: '账户', icon: Cloud, adminOnly: true },
      { path: '/api-keys', label: 'API 密钥', icon: Key },
      { path: '/logs', label: '日志', icon: FileText },
    ],
  },
  {
    label: '帮助',
    items: [
      { path: '/guide', label: '使用指南', icon: Book },
      { path: '/best-practices', label: '最佳实践', icon: Lightbulb },
    ],
  },
];

export const flatNavItems = navigationConfig.flatMap((group) => group.items);

import { LayoutDashboard, Users, Key, FileText, Cloud, LucideIcon } from 'lucide-react';

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
    label: 'Overview',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Management',
    items: [
      { path: '/users', label: 'Users', icon: Users, adminOnly: true },
      { path: '/accounts', label: 'Accounts', icon: Cloud, adminOnly: true },
      { path: '/api-keys', label: 'API Keys', icon: Key },
      { path: '/logs', label: 'Logs', icon: FileText },
    ],
  },
];

export const flatNavItems = navigationConfig.flatMap((group) => group.items);

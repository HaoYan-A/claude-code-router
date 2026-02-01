import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { navigationConfig, NavGroup, NavItem } from '@/config/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NavItemLinkProps {
  item: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
}

function NavItemLink({ item, isActive, isCollapsed }: NavItemLinkProps) {
  const Icon = item.icon;

  const linkContent = (
    <Link
      to={item.path}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        isCollapsed && 'justify-center px-2',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!isCollapsed && <span>{item.label}</span>}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-4">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

interface NavGroupSectionProps {
  group: NavGroup;
  isCollapsed: boolean;
  userRole?: 'admin' | 'user';
}

function NavGroupSection({ group, isCollapsed, userRole }: NavGroupSectionProps) {
  const location = useLocation();

  const filteredItems = group.items.filter(
    (item) => !item.adminOnly || userRole === 'admin'
  );

  if (filteredItems.length === 0) return null;

  return (
    <div className="mb-4">
      {!isCollapsed && (
        <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          {group.label}
        </h3>
      )}
      <nav className="flex flex-col gap-1">
        {filteredItems.map((item) => (
          <NavItemLink
            key={item.path}
            item={item}
            isActive={location.pathname === item.path}
            isCollapsed={isCollapsed}
          />
        ))}
      </nav>
    </div>
  );
}

export function SidebarNav() {
  const { user } = useAuthStore();
  const { isCollapsed } = useSidebarStore();

  return (
    <TooltipProvider>
      <div className="flex-1 overflow-auto px-3 py-4">
        {navigationConfig.map((group) => (
          <NavGroupSection
            key={group.label}
            group={group}
            isCollapsed={isCollapsed}
            userRole={user?.role}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar.store';
import { SidebarNav } from './SidebarNav';
import { SidebarUser } from './SidebarUser';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function Sidebar() {
  const { isCollapsed, toggleCollapsed } = useSidebarStore();

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'flex h-screen flex-col border-r bg-muted/40 transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo + Collapse Button */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!isCollapsed && (
            <h1 className="text-lg font-semibold truncate">Claude Router</h1>
          )}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                className={cn('h-8 w-8 shrink-0', isCollapsed && 'mx-auto')}
              >
                {isCollapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Navigation */}
        <SidebarNav />

        {/* User Area */}
        <SidebarUser />
      </aside>
    </TooltipProvider>
  );
}

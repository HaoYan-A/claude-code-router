import { useNavigate } from 'react-router-dom';
import { LogOut, ChevronsUpDown, Settings } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/auth.store';
import { useSidebarStore } from '@/stores/sidebar.store';
import { cn } from '@/lib/utils';

export function SidebarUser() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { isCollapsed } = useSidebarStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayName = user?.name || user?.githubUsername || 'User';
  const avatarFallback = displayName.slice(0, 2).toUpperCase();

  const avatarContent = (
    <Avatar className="h-8 w-8 shrink-0">
      {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
      <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">
        {avatarFallback}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <TooltipProvider>
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted',
                isCollapsed && 'justify-center'
              )}
            >
              {isCollapsed ? (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>{avatarContent}</TooltipTrigger>
                  <TooltipContent side="right">{displayName}</TooltipContent>
                </Tooltip>
              ) : (
                <>
                  {avatarContent}
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate text-sm font-medium">{displayName}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      @{user?.githubUsername}
                    </div>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isCollapsed ? 'right' : 'top'}
            align={isCollapsed ? 'start' : 'start'}
            className="w-56"
          >
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">
                  @{user?.githubUsername}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}

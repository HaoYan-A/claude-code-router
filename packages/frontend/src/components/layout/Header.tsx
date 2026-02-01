import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { useSidebarStore } from '@/stores/sidebar.store';
import { flatNavItems } from '@/config/navigation';

function getBreadcrumbData(pathname: string) {
  const navItem = flatNavItems.find((item) => item.path === pathname);

  if (navItem) {
    return {
      parent: '仪表盘',
      current: navItem.label,
    };
  }

  // Default fallback
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    const current = segments[segments.length - 1];
    return {
      parent: '仪表盘',
      current: current.charAt(0).toUpperCase() + current.slice(1),
    };
  }

  return {
    parent: null,
    current: '仪表盘',
  };
}

export function Header() {
  const location = useLocation();
  const { toggleMobile } = useSidebarStore();
  const breadcrumb = getBreadcrumbData(location.pathname);

  return (
    <header className="flex h-16 items-center gap-4 border-b bg-background px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={toggleMobile}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumb.parent && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard">{breadcrumb.parent}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{breadcrumb.current}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Separator for visual structure */}
      <Separator orientation="vertical" className="h-6 hidden md:block" />
    </header>
  );
}

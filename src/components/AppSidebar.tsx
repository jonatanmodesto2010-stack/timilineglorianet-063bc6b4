import { Calendar, Settings, Users, LayoutDashboard, BarChart3, Shield } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { APP_NAME, getFullVersion, BUILD_VERSION } from '@/config/version';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const menuItems = [
  { icon: Users, label: 'Clientes', path: '/clients' },
  { icon: Calendar, label: 'Calendário', path: '/calendar' },
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: BarChart3, label: 'Relatórios', path: '/reports' },
  { icon: Settings, label: 'Configurações', path: '/settings' },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { isSuperAdmin } = useSuperAdmin();

  const allItems = [
    ...menuItems,
    ...(isSuperAdmin ? [{ icon: Shield, label: 'Super Admin', path: '/admin' }] : []),
  ];

  const isActive = (path: string) => {
    if (path === '/clients') return location.pathname === '/clients' || location.pathname === '/';
    if (path === '/admin') return location.pathname.startsWith('/admin');
    return location.pathname === path;
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {allItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.path)}
                    isActive={isActive(item.path)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className={`text-xs text-muted-foreground ${collapsed ? 'text-center' : ''}`}>
          {!collapsed ? (
            <>
              <p className="font-semibold mb-1">{APP_NAME}</p>
              <p>{getFullVersion()}</p>
              <p className="text-[10px] opacity-70">Build: {BUILD_VERSION}</p>
            </>
          ) : (
            <p className="font-semibold">v{BUILD_VERSION}</p>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

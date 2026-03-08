import { Calendar, Settings, Users, LayoutDashboard, BarChart3, Shield, BookOpen, CheckCircle2, Zap } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { APP_NAME, APP_VERSION, BUILD_VERSION } from '@/config/version';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { Badge } from '@/components/ui/badge';
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
  { icon: BookOpen, label: 'Manual', path: '/manual' },
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
        {!collapsed ? (
          <div className="rounded-xl border border-border/60 bg-card/50 p-3 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-bold tracking-tight text-foreground">{APP_NAME}</span>
              </div>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-semibold">
                v{APP_VERSION}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-mono">
                Build {BUILD_VERSION}
              </span>
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                <span className="font-medium">Estável</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 py-1">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-[9px] font-mono text-muted-foreground">v{APP_VERSION}</span>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

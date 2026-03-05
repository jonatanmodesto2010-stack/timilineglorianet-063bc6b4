import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, CheckCircle, AlertTriangle, Clock, DollarSign, TrendingUp } from 'lucide-react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { fetchAllPaginated, fetchInChunks } from '@/lib/supabase-helpers';
import { groupTimelinesByClient, calculateOverdueDays, type ClientTimeline } from '@/lib/client-utils';

const Dashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [allTimelines, setAllTimelines] = useState<ClientTimeline[]>([]);
  const [totalOverdueValue, setTotalOverdueValue] = useState(0);
  const [totalOverdueBoletos, setTotalOverdueBoletos] = useState(0);
  const [loading, setLoading] = useState(true);
  const { organizationId } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate('/auth');
    });
  }, [navigate]);

  useEffect(() => {
    if (organizationId) loadData();
  }, [organizationId]);

  const loadData = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const data = await fetchAllPaginated('client_timelines', {
        select: '*',
        eq: [['organization_id', organizationId]],
      });
      setAllTimelines(data || []);

      // Load overdue boletos info
      const timelineIds = (data || []).map((t: any) => t.id);
      if (timelineIds.length > 0) {
        const boletos = await fetchInChunks('client_boletos', 'timeline_id', timelineIds, 'timeline_id, due_date, status, boleto_value');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let overdueVal = 0;
        let overdueCount = 0;
        for (const b of boletos) {
          if (b.status === 'pago' || b.status === 'cancelado') continue;
          const dueDate = new Date(b.due_date);
          dueDate.setHours(0, 0, 0, 0);
          if (today.getTime() > dueDate.getTime()) {
            overdueVal += Number(b.boleto_value) || 0;
            overdueCount++;
          }
        }
        setTotalOverdueValue(overdueVal);
        setTotalOverdueBoletos(overdueCount);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const grouped = groupTimelinesByClient(allTimelines);
    const total = grouped.length;
    const active = grouped.filter(c => c.is_active && c.status === 'active').length;
    const blocked = grouped.filter(c => !c.is_active && c.status !== 'archived' && c.status !== 'completed').length;
    const completed = grouped.filter(c => c.status === 'completed').length;
    const blockRate = total > 0 ? Math.round((blocked / total) * 100) : 0;
    return { total, active, blocked, completed, blockRate };
  }, [allTimelines]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const cards = [
    { label: 'Total de Clientes', value: stats.total, sub: 'clientes únicos', icon: Users, color: 'text-foreground' },
    { label: 'Clientes Ativos', value: stats.active, sub: 'em cobrança ativa', icon: CheckCircle, color: 'text-green-500' },
    { label: 'Bloqueados', value: stats.blocked, sub: 'clientes bloqueados', icon: AlertTriangle, color: 'text-red-500' },
    { label: 'Finalizados', value: stats.completed, sub: 'cobranças finalizadas', icon: Clock, color: 'text-foreground' },
    { label: 'Valor em Atraso', value: formatCurrency(totalOverdueValue), sub: `${totalOverdueBoletos} boletos vencidos`, icon: DollarSign, color: 'text-red-500', isText: true },
    { label: 'Taxa de Bloqueio', value: `${stats.blockRate}%`, sub: 'dos clientes bloqueados', icon: TrendingUp, color: 'text-foreground', isText: true },
  ];

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex flex-1 w-full">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
              <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
              <p className="text-muted-foreground mb-6">Visão geral da organização</p>
            </motion.div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-card border border-border rounded-xl p-6"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground font-medium">{card.label}</span>
                      <card.icon size={20} className="text-muted-foreground" />
                    </div>
                    <div className={`text-3xl font-bold ${card.color}`}>
                      {card.value}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;

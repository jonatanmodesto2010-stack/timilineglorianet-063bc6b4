import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { fetchAllPaginated, fetchInChunks } from '@/lib/supabase-helpers';
import { groupTimelinesByClient, sortClients, calculateOverdueDays, type ClientTimeline } from '@/lib/client-utils';

export const useClients = (organizationId: string | null) => {
  const queryClient = useQueryClient();

  const timelinesQuery = useQuery({
    queryKey: ['client-timelines', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const data = await fetchAllPaginated('client_timelines', {
        select: 'id, client_name, client_id, start_date, is_active, status, created_at, updated_at, organization_id, completed_at, completion_notes, user_id, ixc_filial_id, ixc_filial_name',
        eq: [['organization_id', organizationId]],
        order: ['client_name', { ascending: true }],
      });
      return (data || []) as ClientTimeline[];
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 2,
  });

  const overdueDaysQuery = useQuery({
    queryKey: ['overdue-days', organizationId, timelinesQuery.data?.length],
    queryFn: async () => {
      const timelines = timelinesQuery.data;
      if (!timelines || timelines.length === 0) return new Map<string, number>();

      const timelineIds = timelines.map(t => t.id);
      const boletos = await fetchInChunks('client_boletos', 'timeline_id', timelineIds, 'timeline_id, due_date, status');

      const boletosMap = new Map<string, { due_date: string; status: string }[]>();
      for (const b of boletos) {
        if (!boletosMap.has(b.timeline_id)) boletosMap.set(b.timeline_id, []);
        boletosMap.get(b.timeline_id)!.push(b);
      }

      const map = new Map<string, number>();
      for (const t of timelines) {
        const clientBoletos = boletosMap.get(t.id) || [];
        const days = calculateOverdueDays(clientBoletos);
        if (days > 0) map.set(t.id, days);
      }
      return map;
    },
    enabled: !!timelinesQuery.data && timelinesQuery.data.length > 0,
    staleTime: 1000 * 60 * 2,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['client-timelines', organizationId] });
    queryClient.invalidateQueries({ queryKey: ['overdue-days', organizationId] });
  }, [queryClient, organizationId]);

  return {
    allTimelines: timelinesQuery.data || [],
    overdueDaysMap: overdueDaysQuery.data || new Map<string, number>(),
    loading: timelinesQuery.isLoading,
    refresh,
  };
};

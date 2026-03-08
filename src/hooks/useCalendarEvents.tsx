import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseClient } from '@/lib/supabase-client';

export interface CalendarEvent {
  id: string;
  client_name: string;
  event_date: string;
  event_time?: string;
  description: string | null;
  status: string;
  icon: string;
}

export const useCalendarEvents = (organizationId: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['calendar-events', organizationId],
    queryFn: async (): Promise<CalendarEvent[]> => {
      if (!organizationId) return [];

      const { data: timelines } = await supabaseClient
        .from('client_timelines')
        .select('id, client_name')
        .eq('organization_id', organizationId);

      if (!timelines || timelines.length === 0) return [];

      const timelineIds = timelines.map(t => t.id);
      const { data: lines } = await supabaseClient
        .from('timeline_lines')
        .select('id, timeline_id')
        .in('timeline_id', timelineIds);

      if (!lines || lines.length === 0) return [];

      const lineIds = lines.map(l => l.id);
      const { data: eventsData } = await supabaseClient
        .from('timeline_events')
        .select('id, line_id, event_date, event_time, description, status, icon')
        .in('line_id', lineIds);

      return (eventsData || []).map(event => {
        const line = lines.find(l => l.id === event.line_id);
        const timeline = timelines.find(t => t.id === line?.timeline_id);
        return {
          id: event.id,
          client_name: timeline?.client_name || 'Cliente',
          event_date: event.event_date,
          event_time: event.event_time ?? undefined,
          description: event.description,
          status: event.status,
          icon: event.icon,
        };
      });
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 2,
  });

  // Realtime subscription to invalidate cache
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel('calendar-events-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timeline_events' }, () => {
        queryClient.invalidateQueries({ queryKey: ['calendar-events', organizationId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_timelines' }, () => {
        queryClient.invalidateQueries({ queryKey: ['calendar-events', organizationId] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organizationId, queryClient]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['calendar-events', organizationId] });
  }, [queryClient, organizationId]);

  return {
    events: query.data || [],
    loading: query.isLoading,
    refresh,
  };
};

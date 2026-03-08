import { useState, useMemo, memo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Search, Clock, Grid3x3, CalendarDays } from 'lucide-react';
import { useCalendarEvents, type CalendarEvent } from '@/hooks/useCalendarEvents';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface CalendarPanelProps {
  organizationId: string | null;
  onClientClick?: (clientName: string) => void;
}

export const CalendarPanel = memo(({ organizationId, onClientClick }: CalendarPanelProps) => {
  const { events, loading } = useCalendarEvents(organizationId);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientSearch, setClientSearch] = useState<string>('');
  const [iconsFilter, setIconsFilter] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'today' | 'month' | 'week'>('week');

  const today = new Date();
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return { daysInMonth: lastDay.getDate(), startingDayOfWeek: firstDay.getDay() };
  };

  const getWeekDays = (date: Date) => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesStatus = statusFilter === 'all' || event.status === statusFilter;
      const matchesClient = clientSearch === '' || event.client_name.toLowerCase().includes(clientSearch.toLowerCase());
      const matchesIcon = iconsFilter.length === 0 || iconsFilter.includes(event.icon);
      return matchesStatus && matchesClient && matchesIcon;
    });
  }, [events, statusFilter, clientSearch, iconsFilter]);

  const getEventsForDay = useMemo(() => {
    const eventsByDate = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) {
      const existing = eventsByDate.get(event.event_date) || [];
      existing.push(event);
      eventsByDate.set(event.event_date, existing);
    }
    return (day: number, month?: number) => {
      const targetMonth = month !== undefined ? month : currentDate.getMonth() + 1;
      const dateStr = `${String(day).padStart(2, '0')}/${String(targetMonth).padStart(2, '0')}`;
      return eventsByDate.get(dateStr) || [];
    };
  }, [filteredEvents, currentDate]);

  const monthlyStats = useMemo(() => {
    const stats = { total: filteredEvents.length, created: 0, resolved: 0, no_response: 0 };
    filteredEvents.forEach(event => {
      if (event.status === 'created') stats.created++;
      else if (event.status === 'resolved') stats.resolved++;
      else if (event.status === 'no_response') stats.no_response++;
    });
    return stats;
  }, [filteredEvents]);

  const hasNoResponseStatus = useMemo(() => {
    const clientSet = new Set<string>();
    events.forEach(e => { if (e.status === 'no_response') clientSet.add(e.client_name); });
    return (clientName: string) => clientSet.has(clientName);
  }, [events]);

  const getStatusCounts = (dayEvents: CalendarEvent[]) => {
    const counts = { created: 0, resolved: 0, no_response: 0 };
    dayEvents.forEach(event => {
      if (event.status === 'created') counts.created++;
      else if (event.status === 'resolved') counts.resolved++;
      else if (event.status === 'no_response') counts.no_response++;
    });
    return counts;
  };

  const goToToday = () => setCurrentDate(new Date());
  const previousMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  const previousWeek = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
  const nextWeek = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));

  const handleEventClick = (clientName: string) => {
    onClientClick?.(clientName);
  };

  const handleDayClick = (day: number) => {
    setSelectedDay(day);
    setIsModalOpen(true);
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-4" />
        <div className="flex-1 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <h2 className="text-xl font-bold text-foreground mb-3">Calendário de Eventos</h2>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-card border border-border rounded-lg p-2 text-center">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-bold">{monthlyStats.total}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 text-center">
          <div className="text-xs text-muted-foreground">📝 Criados</div>
          <div className="text-lg font-bold">{monthlyStats.created}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 text-center">
          <div className="text-xs text-muted-foreground">✅ Respondeu</div>
          <div className="text-lg font-bold">{monthlyStats.resolved}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 text-center">
          <div className="text-xs text-muted-foreground">🚫 Não Resp.</div>
          <div className="text-lg font-bold text-destructive">{monthlyStats.no_response}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-3 mb-3">
        <div className="flex gap-2 mb-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <Input
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="created">📝 Criados</SelectItem>
              <SelectItem value="resolved">✅ Respondeu</SelectItem>
              <SelectItem value="no_response">🚫 Não Resp.</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['💬', '📅', '📄', '📞', '✅', '🤝', '⚠️', '🧰'].map(icon => (
            <button
              key={icon}
              onClick={() => setIconsFilter(prev => prev.includes(icon) ? prev.filter(i => i !== icon) : [...prev, icon])}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all hover:scale-110',
                iconsFilter.includes(icon) ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-muted hover:bg-muted/80'
              )}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Area */}
      <div className="flex-1 bg-card border border-border rounded-xl p-4 overflow-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Button variant={viewMode === 'today' ? 'default' : 'outline'} onClick={() => setViewMode('today')} size="sm" className="gap-1.5">
            <Clock size={14} /> Hoje
          </Button>
          <Button variant={viewMode === 'week' ? 'default' : 'outline'} onClick={() => setViewMode('week')} size="sm" className="gap-1.5">
            <CalendarDays size={14} /> Semana
          </Button>
          <Button variant={viewMode === 'month' ? 'default' : 'outline'} onClick={() => setViewMode('month')} size="sm" className="gap-1.5">
            <Grid3x3 size={14} /> Mês
          </Button>
        </div>

        {viewMode !== 'today' && (
          <div className="flex items-center justify-between mb-4">
            <button onClick={viewMode === 'month' ? previousMonth : previousWeek} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-foreground">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h3>
              <Button onClick={goToToday} variant="outline" size="sm" className="text-xs h-7">
                Ir para Hoje
              </Button>
            </div>
            <button onClick={viewMode === 'month' ? nextMonth : nextWeek} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Today View */}
        {viewMode === 'today' && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-foreground text-center mb-4">
              Eventos de Hoje - {format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}
            </h3>
            {(() => {
              const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
              const todayEvents = filteredEvents
                .filter(event => event.event_date === todayStr)
                .sort((a, b) => {
                  if (!a.event_time) return 1;
                  if (!b.event_time) return -1;
                  return a.event_time.localeCompare(b.event_time);
                });

              if (todayEvents.length === 0) {
                return (
                  <div className="text-center py-12 text-muted-foreground">
                    <CalendarIcon size={40} className="mx-auto mb-3 opacity-50" />
                    <p>Nenhum evento para hoje</p>
                  </div>
                );
              }

              return todayEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => handleEventClick(event.client_name)}
                  className="p-4 border-l-4 rounded-lg cursor-pointer transition-all hover:shadow-md bg-card border-border"
                  style={{
                    borderLeftColor: event.status === 'created' ? 'hsl(var(--primary))' : event.status === 'resolved' ? '#10b981' : '#ef4444'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{event.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {event.event_time && (
                          <span className="text-sm font-bold text-primary flex items-center gap-1">
                            <Clock size={12} /> {event.event_time}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-foreground truncate">{event.client_name}</span>
                      </div>
                      {event.description && <p className="text-xs text-muted-foreground truncate">{event.description}</p>}
                    </div>
                    <Badge variant={event.status === 'resolved' ? 'default' : event.status === 'no_response' ? 'destructive' : 'secondary'} className="text-xs">
                      {event.status === 'created' && '📝'}
                      {event.status === 'resolved' && '✅'}
                      {event.status === 'no_response' && '🚫'}
                    </Badge>
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {/* Month View */}
        {viewMode === 'month' && (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {dayNames.map(day => (
                <div key={day} className="text-center font-semibold text-muted-foreground py-1 text-sm">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, index) => {
                const day = index + 1;
                const dayEvents = getEventsForDay(day);
                const statusCounts = getStatusCounts(dayEvents);
                const isToday = day === today.getDate() && currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();

                return (
                  <div
                    key={day}
                    onClick={() => dayEvents.length > 0 && handleDayClick(day)}
                    className={cn(
                      'aspect-square border rounded-lg p-1 text-xs transition-colors',
                      isToday ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted',
                      dayEvents.length > 0 && 'cursor-pointer'
                    )}
                  >
                    <div className={cn('font-semibold mb-0.5', isToday ? 'text-primary' : 'text-foreground')}>{day}</div>
                    {dayEvents.length > 0 && (
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 1).map(event => (
                          <div key={event.id} className="text-[10px] p-0.5 bg-primary/20 rounded truncate">
                            <span className="mr-0.5">{event.icon}</span>
                            <span className={cn('font-medium', hasNoResponseStatus(event.client_name) && 'text-destructive')}>
                              {event.client_name}
                            </span>
                          </div>
                        ))}
                        {dayEvents.length > 1 && (
                          <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 1} mais</div>
                        )}
                        <div className="flex gap-0.5">
                          {statusCounts.created > 0 && <Badge variant="secondary" className="text-[8px] px-0.5 py-0 h-3">📝{statusCounts.created}</Badge>}
                          {statusCounts.resolved > 0 && <Badge variant="secondary" className="text-[8px] px-0.5 py-0 h-3">✅{statusCounts.resolved}</Badge>}
                          {statusCounts.no_response > 0 && <Badge variant="destructive" className="text-[8px] px-0.5 py-0 h-3">🚫{statusCounts.no_response}</Badge>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Week View */}
        {viewMode === 'week' && (
          <div className="grid grid-cols-7 gap-2">
            {getWeekDays(currentDate).map((weekDay, index) => {
              const day = weekDay.getDate();
              const month = weekDay.getMonth();
              const year = weekDay.getFullYear();
              const dayEvents = getEventsForDay(day, month + 1);
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

              return (
                <div key={index} className="space-y-1.5">
                  <div className={cn(
                    'text-center p-1.5 rounded-lg',
                    isToday ? 'bg-primary text-primary-foreground font-bold' : 'bg-muted'
                  )}>
                    <div className="text-xs">{dayNames[weekDay.getDay()]}</div>
                    <div className="text-base">{day}</div>
                  </div>
                  <div className="space-y-1.5 min-h-[150px]">
                    {dayEvents.map(event => (
                      <div
                        key={event.id}
                        onClick={() => handleEventClick(event.client_name)}
                        className="p-1.5 border border-border rounded-lg bg-card hover:bg-muted transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-sm">{event.icon}</span>
                          <div className="flex-1 min-w-0">
                            {event.event_time && <div className="text-[10px] font-bold text-primary">{event.event_time}</div>}
                            <span className={cn(
                              'text-[10px] font-semibold truncate block',
                              hasNoResponseStatus(event.client_name) ? 'text-destructive' : 'text-foreground'
                            )}>
                              {event.client_name}
                            </span>
                          </div>
                        </div>
                        {event.description && <p className="text-[10px] text-muted-foreground line-clamp-1">{event.description}</p>}
                        <Badge
                          variant={event.status === 'resolved' ? 'default' : event.status === 'no_response' ? 'destructive' : 'secondary'}
                          className="text-[8px] h-3 mt-0.5"
                        >
                          {event.status === 'created' && '📝'}
                          {event.status === 'resolved' && '✅'}
                          {event.status === 'no_response' && '🚫'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Legend */}
      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500 rounded-full" /> Criados</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full" /> Respondeu</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full" /> Não Respondeu</div>
      </div>

      {/* Day Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Eventos do dia {selectedDay} de {monthNames[currentDate.getMonth()]}
            </DialogTitle>
          </DialogHeader>
          {selectedDay && (
            <div className="space-y-3 mt-4">
              {getEventsForDay(selectedDay).map(event => (
                <div
                  key={event.id}
                  onClick={() => handleEventClick(event.client_name)}
                  className="p-4 border border-border rounded-lg bg-card hover:bg-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{event.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          {event.event_time && (
                            <div className="text-sm font-bold text-primary mb-1 flex items-center gap-1">
                              <Clock size={14} /> {event.event_time}
                            </div>
                          )}
                          <h4 className={cn('font-semibold', hasNoResponseStatus(event.client_name) && 'text-destructive')}>
                            {event.client_name}
                          </h4>
                        </div>
                        <Badge variant={event.status === 'resolved' ? 'default' : event.status === 'no_response' ? 'destructive' : 'secondary'}>
                          {event.status === 'created' && '📝 Criado'}
                          {event.status === 'resolved' && '✅ Respondeu'}
                          {event.status === 'no_response' && '🚫 Não Respondeu'}
                        </Badge>
                      </div>
                      {event.description && <p className="text-sm text-muted-foreground mb-2">{event.description}</p>}
                      <p className="text-xs text-muted-foreground italic">Clique para ver a timeline do cliente</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

CalendarPanel.displayName = 'CalendarPanel';

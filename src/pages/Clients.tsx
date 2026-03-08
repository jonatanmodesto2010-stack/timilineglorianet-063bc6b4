import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, History, TrendingUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Lock, Building2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { ClientDashboardModal } from '@/components/ClientDashboardModal';
import { ClientSearchFilters } from '@/components/ClientSearchFilters';
import { CalendarPanel } from '@/components/CalendarPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { supabaseClient } from '@/lib/supabase-client';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useClients } from '@/hooks/useClients';
import { groupTimelinesByClient, sortClients, type GroupedClient } from '@/lib/client-utils';
import type { User } from '@supabase/supabase-js';
import { ClientTimelineDialog } from '@/components/ClientTimelineDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVirtualizer } from '@tanstack/react-virtual';
import React from 'react';

const ITEMS_PER_PAGE = 50;

// Memoized client row component
const ClientRow = React.memo(({ 
  client, 
  overdueDaysMap, 
  onOpenModal, 
  onOpenTimeline 
}: { 
  client: GroupedClient;
  overdueDaysMap: Map<string, number>;
  onOpenModal: (client: GroupedClient) => void;
  onOpenTimeline: (client: GroupedClient) => void;
}) => {
  const overdueDays = overdueDaysMap.get(client.primaryTimeline.id) || 0;
  const isBlocked = !client.is_active && client.status !== 'archived' && client.status !== 'completed';
  const isOverdue = client.is_active && client.status === 'active' && overdueDays > 0;
  const isInactive = client.status === 'archived';
  const isCompleted = client.status === 'completed';

  let cardStyle = 'bg-card border border-border';
  if (isBlocked) cardStyle = 'bg-red-500/10 border border-red-500/30';
  else if (isOverdue) cardStyle = 'bg-yellow-500/10 border border-yellow-500/30';
  else if (isInactive || isCompleted) cardStyle = 'bg-muted border border-border opacity-70';

  return (
    <div
      className={`w-full rounded-lg p-3 flex items-center gap-3 transition-colors hover:opacity-90 cursor-pointer ${cardStyle}`}
      onClick={() => onOpenModal(client)}
    >
      <div className="flex-1 min-w-0">
        <h3 className="text-card-foreground font-bold text-sm uppercase tracking-wide truncate">
          {client.client_name}
        </h3>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {overdueDays > 0 && (
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${isBlocked ? 'bg-red-500 text-white' : isOverdue ? 'bg-yellow-500 text-black' : 'bg-green-500 text-white'}`}>
            {overdueDays}d
          </div>
        )}

        {isBlocked && (
          <div className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full flex items-center gap-1 font-semibold border border-red-500/30">
            <Lock size={11} />
            BLOQ
          </div>
        )}

        {isInactive && (
          <div className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">
            Inativo
          </div>
        )}

        {isCompleted && (
          <div className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">
            Finalizado
          </div>
        )}

        <Button
          variant="outline"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onOpenTimeline(client);
          }}
          className="border-green-500/30 hover:bg-green-500/10 text-green-400 hover:text-green-300 h-8 w-8"
          title="Ver Timeline"
        >
          <TrendingUp className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
});

ClientRow.displayName = 'ClientRow';

const Clients = () => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const { organizationId } = useUserRole();
  const { allTimelines, overdueDaysMap, loading, refresh: refreshClients } = useClients(organizationId);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({
    client_name: '',
    client_id: '',
    start_date: new Date().toISOString().split('T')[0],
  });
  const [showClientTimelineDialog, setShowClientTimelineDialog] = useState(false);
  const [clientForTimeline, setClientForTimeline] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filialFilter, setFilialFilter] = useState('all');
  const navigate = useNavigate();
  const { toast } = useToast();
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
      else navigate('/auth');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) setUser(session.user);
      else navigate('/auth');
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Extract unique filiais
  const filiais = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of allTimelines) {
      if (t.ixc_filial_id && t.ixc_filial_name) {
        map.set(t.ixc_filial_id, t.ixc_filial_name);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allTimelines]);

  // Group and sort clients
  const groupedClients = useMemo(() => {
    const grouped = groupTimelinesByClient(allTimelines);
    return sortClients(grouped, overdueDaysMap);
  }, [allTimelines, overdueDaysMap]);

  // Apply search/status/filial filters
  const filteredClients = useMemo(() => {
    let results = groupedClients;

    if (filialFilter !== 'all') {
      results = results.filter(c => c.primaryTimeline.ixc_filial_id === filialFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      results = results.filter(c => 
        c.client_name.toLowerCase().includes(term) ||
        (c.client_id && c.client_id.toLowerCase().includes(term))
      );
    }

    if (statusFilter === 'active') {
      results = results.filter(c => c.is_active && c.status === 'active');
    } else if (statusFilter === 'blocked') {
      results = results.filter(c => !c.is_active && c.status !== 'archived' && c.status !== 'completed');
    } else if (statusFilter === 'overdue') {
      results = results.filter(c => c.is_active && c.status === 'active' && (overdueDaysMap.get(c.primaryTimeline.id) || 0) > 0);
    } else if (statusFilter === 'inactive') {
      results = results.filter(c => c.status === 'archived');
    } else if (statusFilter === 'completed') {
      results = results.filter(c => c.status === 'completed');
    }

    return results;
  }, [groupedClients, searchTerm, statusFilter, overdueDaysMap, filialFilter]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, filialFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredClients.length);
  const paginatedClients = useMemo(() => filteredClients.slice(startIndex, endIndex), [filteredClients, startIndex, endIndex]);

  // Virtual list
  const virtualizer = useVirtualizer({
    count: paginatedClients.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const handleOpenModal = useCallback((client: GroupedClient) => {
    setSelectedClient(client.primaryTimeline);
    setModalOpen(true);
  }, []);

  const handleOpenTimelineDialog = useCallback((client: GroupedClient) => {
    setClientForTimeline(client.primaryTimeline);
    setShowClientTimelineDialog(true);
  }, []);

  const handleSaveClient = useCallback(async (updatedData: any) => {
    if (!selectedClient) return;
    try {
      const { error } = await supabaseClient.from('client_timelines').update(updatedData).eq('id', selectedClient.id);
      if (error) throw error;
      refreshClients();
      toast({ title: 'Cliente atualizado', description: 'As informações foram atualizadas com sucesso.' });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      throw error;
    }
  }, [selectedClient, refreshClients, toast]);

  const handleCreateClient = useCallback(async () => {
    if (!organizationId) return;
    const clientNameTrimmed = newClientData.client_name.trim();
    if (!clientNameTrimmed) {
      toast({ title: 'Nome obrigatório', description: 'Por favor, insira o nome do cliente.', variant: 'destructive' });
      return;
    }

    try {
      const { data: existing } = await supabaseClient
        .from('client_timelines').select('id').eq('organization_id', organizationId).ilike('client_name', clientNameTrimmed);
      if (existing && existing.length > 0) {
        toast({ title: 'Nome duplicado', description: `Já existe um cliente com o nome "${clientNameTrimmed}".`, variant: 'destructive' });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabaseClient
        .from('client_timelines')
        .insert({
          client_name: clientNameTrimmed,
          client_id: newClientData.client_id.trim() || null,
          start_date: newClientData.start_date,
          is_active: true,
          status: 'active',
          organization_id: organizationId,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      refreshClients();
      setNewClientModalOpen(false);
      toast({ title: 'Cliente criado', description: `Cliente "${clientNameTrimmed}" foi adicionado com sucesso.` });
      if (data) { setSelectedClient(data); setModalOpen(true); }
      setNewClientData({ client_name: '', client_id: '', start_date: new Date().toISOString().split('T')[0] });
    } catch (error: any) {
      toast({ title: 'Erro ao criar cliente', description: error.message, variant: 'destructive' });
    }
  }, [organizationId, newClientData, refreshClients, toast]);

  const handleFilterChange = useCallback((filters: any) => {
    setSearchTerm(filters.searchTerm || '');
    setStatusFilter(filters.statusFilter || 'all');
  }, []);

  const handleCalendarClientClick = useCallback((name: string) => {
    setSearchTerm(name);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col w-full bg-background">
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex flex-1 w-full overflow-hidden">
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main className="flex-1 p-4 overflow-hidden">
            <div className="h-full flex flex-col lg:flex-row gap-4">
              <div className="lg:w-[35%] flex flex-col">
                <div className="h-9 w-48 bg-muted animate-pulse rounded mb-4" />
                <div className="flex flex-col gap-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              </div>
              <div className="lg:w-[65%] hidden lg:block">
                <div className="h-8 w-48 bg-muted animate-pulse rounded mb-4" />
                <div className="h-96 bg-muted animate-pulse rounded-xl" />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const clientsContent = (
    <div className="flex flex-col min-w-0 overflow-hidden h-full">
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-2xl font-bold text-foreground">Clientes</h2>
          {filiais.length > 0 && (
            <Select value={filialFilter} onValueChange={setFilialFilter}>
              <SelectTrigger className="w-[220px] h-9">
                <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Todas filiais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas filiais</SelectItem>
                {filiais.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <ClientSearchFilters 
          onFilterChange={handleFilterChange}
          organizationId={organizationId}
          pageName="clients"
        />

        {/* Pagination Controls */}
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Primeira página">
              <ChevronsLeft size={16} />
            </button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Página anterior">
              <ChevronLeft size={16} />
            </button>
            <button onClick={refreshClients} className="p-1.5 rounded hover:bg-muted transition-colors" title="Atualizar">
              <RefreshCw size={16} />
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Próxima página">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Última página">
              <ChevronsRight size={16} />
            </button>
            <span className="text-sm text-muted-foreground ml-2">
              {filteredClients.length > 0 ? startIndex + 1 : 0} - {endIndex} / {filteredClients.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/history')}
              className="px-4 py-2 bg-primary/10 text-primary rounded-lg font-semibold hover:bg-primary/20 transition-all flex items-center gap-2 whitespace-nowrap text-sm"
            >
              <History size={16} />
              Histórico
            </button>

            <button
              onClick={() => setNewClientModalOpen(true)}
              className="px-4 py-2 bg-gradient-primary text-primary-foreground rounded-lg font-semibold hover:bg-gradient-hover transition-all flex items-center gap-2 whitespace-nowrap text-sm"
            >
              <Plus size={16} />
              Novo Cliente
            </button>
          </div>
        </div>

        {/* Client List - Virtualized */}
        <div ref={parentRef} className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          {paginatedClients.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p>Nenhum cliente encontrado</p>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const client = paginatedClients[virtualRow.index];
                return (
                  <div
                    key={client.primaryTimeline.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="pr-1 pb-2"
                  >
                    <ClientRow
                      client={client}
                      overdueDaysMap={overdueDaysMap}
                      onOpenModal={handleOpenModal}
                      onOpenTimeline={handleOpenTimelineDialog}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const calendarContent = (
    <div className="h-full overflow-hidden flex flex-col">
      <CalendarPanel
        organizationId={organizationId}
        onClientClick={handleCalendarClientClick}
      />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      
      <div className="flex flex-1 w-full overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        <main className="flex-1 p-4 overflow-hidden">
          {isMobile ? (
            <div className="h-full flex flex-col gap-4 overflow-y-auto">
              {clientsContent}
              {calendarContent}
            </div>
          ) : (
            <ResizablePanelGroup
              direction="horizontal"
              className="h-full rounded-lg"
              autoSaveId="clients-calendar-layout"
            >
              <ResizablePanel defaultSize={35} minSize={25}>
                {clientsContent}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={65} minSize={40}>
                {calendarContent}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </main>
      </div>

      {/* New Client Modal */}
      <Dialog open={newClientModalOpen} onOpenChange={setNewClientModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Novo Cliente</DialogTitle>
            <DialogDescription>Preencha as informações básicas do novo cliente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="new-client-name" className="text-sm font-medium">Nome do Cliente *</label>
              <Input
                id="new-client-name"
                placeholder="Ex: João Silva"
                value={newClientData.client_name}
                onChange={(e) => setNewClientData(prev => ({ ...prev, client_name: e.target.value }))}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateClient(); } }}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="new-client-id" className="text-sm font-medium">ID do Cliente</label>
              <Input
                id="new-client-id"
                placeholder="Ex: 00064"
                value={newClientData.client_id}
                onChange={(e) => setNewClientData(prev => ({ ...prev, client_id: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="new-client-date" className="text-sm font-medium">Data de Cadastro</label>
              <Input
                id="new-client-date"
                type="date"
                value={newClientData.start_date}
                onChange={(e) => setNewClientData(prev => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setNewClientModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateClient} className="bg-gradient-primary hover:bg-gradient-hover">Criar Cliente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedClient && (
        <ClientDashboardModal
          client={selectedClient}
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setSelectedClient(null); }}
          onSave={handleSaveClient}
        />
      )}

      {clientForTimeline && (
        <ClientTimelineDialog
          client={clientForTimeline}
          isOpen={showClientTimelineDialog}
          onClose={() => { setShowClientTimelineDialog(false); setClientForTimeline(null); }}
        />
      )}
    </div>
  );
};

export default Clients;

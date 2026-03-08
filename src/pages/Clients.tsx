import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, History, Loader2, TrendingUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Lock, Building2 } from 'lucide-react';
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
import { fetchAllPaginated, fetchInChunks } from '@/lib/supabase-helpers';
import { groupTimelinesByClient, sortClients, calculateOverdueDays, type ClientTimeline, type GroupedClient } from '@/lib/client-utils';
import type { User } from '@supabase/supabase-js';
import { ClientTimelineDialog } from '@/components/ClientTimelineDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ITEMS_PER_PAGE = 30;

const Clients = () => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [allTimelines, setAllTimelines] = useState<ClientTimeline[]>([]);
  const [overdueDaysMap, setOverdueDaysMap] = useState<Map<string, number>>(new Map());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const { organizationId } = useUserRole();
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

  useEffect(() => {
    if (organizationId) loadClients();
  }, [organizationId]);

  const loadClients = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      
      // Fetch ALL timelines bypassing 1000 limit
      const data = await fetchAllPaginated('client_timelines', {
        select: '*',
        eq: [['organization_id', organizationId]],
        order: ['client_name', { ascending: true }],
      });

      setAllTimelines(data || []);

      // Fetch overdue days for all timelines
      await loadOverdueDays(data || []);
    } catch (error: any) {
      console.error('Error loading clients:', error);
      toast({ title: 'Erro ao carregar clientes', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadOverdueDays = async (timelines: ClientTimeline[]) => {
    try {
      const timelineIds = timelines.map(t => t.id);
      if (timelineIds.length === 0) return;

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
      setOverdueDaysMap(map);
    } catch (err) {
      console.error('Error loading overdue days:', err);
    }
  };

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
  const paginatedClients = filteredClients.slice(startIndex, endIndex);

  const handleOpenModal = (client: GroupedClient) => {
    setSelectedClient(client.primaryTimeline);
    setModalOpen(true);
  };

  const handleOpenTimelineDialog = (client: GroupedClient) => {
    setClientForTimeline(client.primaryTimeline);
    setShowClientTimelineDialog(true);
  };

  const handleSaveClient = async (updatedData: any) => {
    if (!selectedClient) return;
    try {
      const { error } = await supabaseClient.from('client_timelines').update(updatedData).eq('id', selectedClient.id);
      if (error) throw error;
      await loadClients();
      toast({ title: 'Cliente atualizado', description: 'As informações foram atualizadas com sucesso.' });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const handleCreateClient = async () => {
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
      await loadClients();
      setNewClientModalOpen(false);
      toast({ title: 'Cliente criado', description: `Cliente "${clientNameTrimmed}" foi adicionado com sucesso.` });
      if (data) { setSelectedClient(data); setModalOpen(true); }
      setNewClientData({ client_name: '', client_id: '', start_date: new Date().toISOString().split('T')[0] });
    } catch (error: any) {
      toast({ title: 'Erro ao criar cliente', description: error.message, variant: 'destructive' });
    }
  };

  const getClientBadgeInfo = (client: GroupedClient) => {
    const overdueDays = overdueDaysMap.get(client.primaryTimeline.id) || 0;
    const isBlocked = !client.is_active && client.status !== 'archived' && client.status !== 'completed';
    const isOverdue = client.is_active && client.status === 'active' && overdueDays > 0;
    const isInactive = client.status === 'archived';
    const isCompleted = client.status === 'completed';

    return { overdueDays, isBlocked, isOverdue, isInactive, isCompleted };
  };

  const getCardStyle = (info: ReturnType<typeof getClientBadgeInfo>) => {
    if (info.isBlocked) return 'bg-red-500/10 border border-red-500/30';
    if (info.isOverdue) return 'bg-yellow-500/10 border border-yellow-500/30';
    if (info.isInactive || info.isCompleted) return 'bg-muted border border-border opacity-70';
    return 'bg-card border border-border';
  };

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
    <div className="min-h-screen flex flex-col w-full bg-background">
      <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      
      <div className="flex flex-1 w-full">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        
        <main className="flex-1 p-4 overflow-hidden">
          <div className="h-full flex flex-col lg:flex-row gap-4">
            {/* Left Column - Client List */}
            <div className="lg:w-[55%] flex flex-col min-w-0 overflow-hidden">
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-4 mb-6">
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
                  onFilterChange={(filters) => {
                    setSearchTerm(filters.searchTerm || '');
                    setStatusFilter(filters.statusFilter || 'all');
                  }}
                  organizationId={organizationId}
                  pageName="clients"
                />

                {/* Pagination Controls */}
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Primeira página">
                      <ChevronsLeft size={16} />
                    </button>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Página anterior">
                      <ChevronLeft size={16} />
                    </button>
                    <button onClick={loadClients} className="p-1.5 rounded hover:bg-muted transition-colors" title="Atualizar">
                      <RefreshCw size={16} />
                    </button>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Próxima página">
                      <ChevronRight size={16} />
                    </button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Última página">
                      <ChevronsRight size={16} />
                    </button>
                    <span className="text-sm text-muted-foreground ml-2">
                      {startIndex + 1} - {endIndex} / {filteredClients.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <motion.button
                      onClick={() => navigate('/history')}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-6 py-2 bg-primary/10 text-primary rounded-lg font-semibold hover:bg-primary/20 transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                      <History size={18} />
                      Histórico
                    </motion.button>

                    <motion.button
                      onClick={() => setNewClientModalOpen(true)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-6 py-2 bg-gradient-primary text-primary-foreground rounded-lg font-semibold hover:bg-gradient-hover transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                      <Plus size={18} />
                      Novo Cliente
                    </motion.button>
                  </div>
                </div>

                {/* Client List - Scrollable */}
                <div className="flex-1 overflow-y-auto min-h-0">
                {paginatedClients.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground">
                    <p>Nenhum cliente encontrado</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 w-full pr-1">
                    {paginatedClients.map((client, index) => {
                      const info = getClientBadgeInfo(client);
                      return (
                        <motion.div
                          key={client.primaryTimeline.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(index * 0.03, 0.3) }}
                          className={`w-full rounded-lg p-4 flex items-center gap-4 transition-colors hover:opacity-90 cursor-pointer ${getCardStyle(info)}`}
                          onClick={() => handleOpenModal(client)}
                        >
                          <div className="flex-1 min-w-0">
                            <h3 className="text-card-foreground font-bold text-base uppercase tracking-wide truncate">
                              {client.client_name}
                            </h3>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Overdue Days Badge */}
                            {info.overdueDays > 0 && (
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${info.isBlocked ? 'bg-red-500 text-white' : info.isOverdue ? 'bg-yellow-500 text-black' : 'bg-green-500 text-white'}`}>
                                {info.overdueDays}d
                              </div>
                            )}

                            {/* Status Badges */}
                            {info.isBlocked && (
                              <div className="px-3 py-1 bg-red-500/20 text-red-400 text-xs rounded-full flex items-center gap-1 font-semibold border border-red-500/30">
                                <Lock size={12} />
                                BLOQUEADO
                              </div>
                            )}

                            {info.isInactive && (
                              <div className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">
                                Inativo
                              </div>
                            )}

                            {info.isCompleted && (
                              <div className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded-full font-semibold">
                                Finalizado
                              </div>
                            )}

                            {/* Timeline Button */}
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTimelineDialog(client);
                              }}
                              className="border-green-500/30 hover:bg-green-500/10 text-green-400 hover:text-green-300"
                              title="Ver Timeline"
                            >
                              <TrendingUp className="w-4 h-4" />
                            </Button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
                </div>
              </motion.div>
            </div>

            {/* Right Column - Full Calendar */}
            <div className="lg:w-[45%] flex-shrink-0 overflow-hidden lg:flex hidden flex-col">
              <CalendarPanel
                organizationId={organizationId}
                onClientClick={(name) => setSearchTerm(name)}
              />
            </div>
          </div>
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

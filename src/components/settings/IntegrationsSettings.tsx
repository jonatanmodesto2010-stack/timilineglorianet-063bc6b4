import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw } from 'lucide-react';

interface Integration {
  id: string;
  integration_type: string;
  api_url: string | null;
  api_token: string | null;
  api_url_contracts: string | null;
  is_active: boolean;
}

export const IntegrationsSettings = () => {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [apiUrlContracts, setApiUrlContracts] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingBoletos, setSyncingBoletos] = useState(false);
  const { organizationId } = useUserRole();
  const { toast } = useToast();

  useEffect(() => {
    if (organizationId) loadIntegration();
  }, [organizationId]);

  const loadIntegration = async () => {
    if (!organizationId) return;
    try {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('integration_type', 'ixc')
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setIntegration(data);
        setApiUrl(data.api_url || '');
        setApiToken(data.api_token || '');
        setApiUrlContracts(data.api_url_contracts || '');
        setIsActive(data.is_active);
      }
    } catch (err: any) {
      console.error('Error loading integration:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      if (integration) {
        const { error } = await supabase
          .from('organization_integrations')
          .update({
            api_url: apiUrl || null,
            api_token: apiToken || null,
            api_url_contracts: apiUrlContracts || null,
            is_active: isActive,
          })
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_integrations')
          .insert({
            organization_id: organizationId,
            integration_type: 'ixc',
            api_url: apiUrl || null,
            api_token: apiToken || null,
            api_url_contracts: apiUrlContracts || null,
            is_active: isActive,
          });
        if (error) throw error;
      }
      await loadIntegration();
      toast({ title: 'Integração salva com sucesso' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiUrl || !apiToken) {
      toast({ title: 'Preencha a URL e o Token', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ixc-sync', {
        body: { action: 'test', api_url: apiUrl, api_token: apiToken },
      });
      if (error) throw error;
      toast({ title: 'Conexão OK', description: 'Conectado ao IXC com sucesso.' });
    } catch (err: any) {
      toast({ title: 'Falha na conexão', description: err.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="h-32 bg-muted animate-pulse rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-xl font-bold mb-1">Integração IXC Provedor</h3>
        <p className="text-sm text-muted-foreground mb-6">Configure a conexão com o sistema IXC para sincronização automática</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Integração Ativa</label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">URL da API</label>
            <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://seu-ixc.com.br/webservice/v1" />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Token da API</label>
            <Input value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="Seu token de autenticação" type="password" />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">URL da API de Contratos (Opcional)</label>
            <Input value={apiUrlContracts} onChange={(e) => setApiUrlContracts(e.target.value)} placeholder="URL alternativa para consultar contratos" />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={handleTestConnection} variant="outline" disabled={testing}>
              {testing && <Loader2 size={16} className="mr-2 animate-spin" />}
              Testar Conexão
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={16} className="mr-2 animate-spin" />}
              Salvar Configurações
            </Button>
          </div>

          {integration && (
            <div className="border-t border-border pt-4 mt-4 space-y-3">
              <h4 className="text-sm font-semibold">Sincronização Manual</h4>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('ixc-sync', {
                        body: { action: 'sync', organization_id: organizationId },
                      });
                      if (error) throw error;
                      const r = data?.results?.[0];
                      toast({
                        title: 'Sincronização concluída',
                        description: `${r?.clients || 0} clientes processados, ${r?.boletos || 0} boletos processados. ${r?.boletos_inserted || 0} novos, ${r?.boletos_updated || 0} atualizados.`,
                      });
                    } catch (err: any) {
                      toast({ title: 'Erro na sincronização', description: err.message, variant: 'destructive' });
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  {syncing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                  Sincronizar Tudo
                </Button>
                <Button
                  variant="outline"
                  disabled={syncingBoletos}
                  onClick={async () => {
                    setSyncingBoletos(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('ixc-sync', {
                        body: { action: 'sync_boletos', organization_id: organizationId },
                      });
                      if (error) throw error;
                      const r = data?.results?.[0];
                      toast({
                        title: 'Boletos sincronizados',
                        description: `${r?.boletos || 0} boletos processados. ${r?.boletos_inserted || 0} novos, ${r?.boletos_updated || 0} atualizados.`,
                      });
                    } catch (err: any) {
                      toast({ title: 'Erro ao sincronizar boletos', description: err.message, variant: 'destructive' });
                    } finally {
                      setSyncingBoletos(false);
                    }
                  }}
                >
                  {syncingBoletos ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                  Sincronizar Boletos
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">A sincronização automática ocorre a cada 10 minutos via cron.</p>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
};

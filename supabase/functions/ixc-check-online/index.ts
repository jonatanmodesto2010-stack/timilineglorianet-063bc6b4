import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function encodeIxcToken(rawToken: string): string {
  if (rawToken.includes(':')) {
    return btoa(rawToken);
  }
  return btoa(`${rawToken}:`);
}

async function ixcGetClient(apiUrl: string, encodedToken: string, clientId: string): Promise<any> {
  // GET individual client record: /cliente/{id}
  const url = `${apiUrl.replace(/\/$/, '')}/cliente/${clientId}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${encodedToken}`,
      'ixcsoft': 'listar',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IXC API error ${res.status}: ${text.substring(0, 200)}`);
  }

  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('ixc-check-online: starting');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { organization_id, client_ids } = body;
    console.log(`org: ${organization_id}, clients count: ${client_ids?.length || 0}`);

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id é obrigatório', online_clients: [] }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
      return new Response(JSON.stringify({ online_clients: [], total_online: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get IXC integration
    const { data: integration, error: intError } = await supabase
      .from('organization_integrations')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('integration_type', 'ixc')
      .eq('is_active', true)
      .single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: 'Integração IXC não encontrada', online_clients: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { api_url, api_token } = integration;
    if (!api_url || !api_token) {
      return new Response(JSON.stringify({ error: 'Credenciais IXC incompletas', online_clients: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const encodedToken = encodeIxcToken(api_token);
    const onlineClientIds: string[] = [];

    // Query each client individually via GET /cliente/{id}
    // Process in batches of 10 for concurrency
    const batchSize = 10;
    for (let i = 0; i < client_ids.length; i += batchSize) {
      const batch = client_ids.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (clientId: string) => {
          try {
            const clientData = await ixcGetClient(api_url, encodedToken, clientId);
            
            // Log first client's full keys to understand structure
            if (i === 0 && batch.indexOf(clientId) === 0) {
              const keys = Object.keys(clientData);
              console.log(`Client ${clientId} KEYS: ${keys.join(',')}`);
              // Log status-related fields
              const statusFields: Record<string, any> = {};
              for (const k of keys) {
                if (k.includes('online') || k.includes('status') || k.includes('ativo') || 
                    k.includes('bloqueado') || k.includes('acesso') || k.includes('conexao') ||
                    k.includes('ativo') || k === 'id') {
                  statusFields[k] = clientData[k];
                }
              }
              console.log(`Client ${clientId} status fields: ${JSON.stringify(statusFields)}`);
            }

            // Check online status - IXC uses various field names
            const online = clientData.online || clientData.status_online || clientData.conexao_online || '';
            const statusAcesso = clientData.status_acesso || clientData.acesso || '';
            
            const isOnline = 
              online === 'S' || online === 's' || online === '1' || online === 1 || online === true ||
              statusAcesso === 'online' || statusAcesso === 'Online' || statusAcesso === 'ONLINE';

            if (isOnline) {
              console.log(`Client ${clientId}: ONLINE`);
              return clientId;
            } else {
              console.log(`Client ${clientId}: OFFLINE (online=${online}, status_acesso=${statusAcesso})`);
              return null;
            }
          } catch (err: any) {
            console.error(`Error checking client ${clientId}: ${err.message}`);
            return null;
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          onlineClientIds.push(result.value);
        }
      }
    }

    console.log(`Final: ${onlineClientIds.length} online out of ${client_ids.length} requested`);

    return new Response(JSON.stringify({ 
      online_clients: onlineClientIds,
      total_online: onlineClientIds.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message, online_clients: [] }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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

async function ixcRequest(apiUrl: string, encodedToken: string, endpoint: string, params: Record<string, any> = {}) {
  const url = `${apiUrl.replace(/\/$/, '')}/${endpoint}`;
  const body = {
    qtype: 'radusuarios.id',
    query: '0',
    oper: '>',
    page: '1',
    rp: '500',
    sortname: 'radusuarios.id',
    sortorder: 'asc',
    ...params,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${encodedToken}`,
      'ixcsoft': 'listar',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IXC API error ${res.status}: ${text.substring(0, 300)}`);
  }

  const data = await res.json();
  return {
    registros: data.registros || [],
    total: parseInt(data.total || '0', 10),
  };
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

    if (!organization_id || !client_ids?.length) {
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

    if (intError || !integration?.api_url || !integration?.api_token) {
      return new Response(JSON.stringify({ error: 'Integração IXC não encontrada', online_clients: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const encodedToken = encodeIxcToken(integration.api_token);
    const onlineClientIds: string[] = [];

    // Query radusuarios for each client_id, checking the 'online' field
    // Process in batches of 10 for concurrency
    const batchSize = 10;
    for (let i = 0; i < client_ids.length; i += batchSize) {
      const batch = client_ids.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (clientId: string) => {
          try {
            const { registros } = await ixcRequest(integration.api_url!, encodedToken, 'radusuarios', {
              qtype: 'radusuarios.id_cliente',
              query: String(clientId),
              oper: '=',
              page: '1',
              rp: '50',
              sortname: 'radusuarios.id',
              sortorder: 'desc',
            });

            // Log first client's fields for debugging
            if (i === 0 && batch.indexOf(clientId) === 0 && registros.length > 0) {
              const sample = registros[0];
              console.log(`Sample radusuarios keys: ${Object.keys(sample).join(',')}`);
              console.log(`Sample: online=${sample.online}, ativo=${sample.ativo}, id_cliente=${sample.id_cliente}`);
            }

            // Check if any radusuarios record for this client has online = 'S'
            for (const r of registros) {
              const online = String(r.online || '').toUpperCase();
              // 'S' = Sim (online), 'SS' can be a default/insert value
              // Active connection: online field is 'S'
              if (online === 'S') {
                console.log(`Client ${clientId}: ONLINE (online=${r.online})`);
                return clientId;
              }
            }

            if (registros.length > 0) {
              console.log(`Client ${clientId}: OFFLINE (online=${registros[0].online})`);
            } else {
              console.log(`Client ${clientId}: NO radusuarios record`);
            }
            return null;
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

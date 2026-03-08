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

async function ixcRequest(apiUrl: string, encodedToken: string, endpoint: string, body: Record<string, any> = {}) {
  const url = `${apiUrl.replace(/\/$/, '')}/${endpoint}`;
  const defaultBody: Record<string, any> = {
    qtype: 'id',
    query: '0',
    oper: '>',
    page: '1',
    rp: '500',
    sortname: 'id',
    sortorder: 'asc',
    ...body,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${encodedToken}`,
      'ixcsoft': 'listar',
    },
    body: JSON.stringify(defaultBody),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IXC API error ${res.status}: ${text.substring(0, 200)}`);
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
    console.log(`org: ${organization_id}, clients: ${JSON.stringify(client_ids)}`);

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id é obrigatório', online_clients: [] }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    // Step 1: First, get a sample radusuarios record for ONE specific client to understand structure
    if (client_ids && client_ids.length > 0) {
      const sampleClientId = client_ids[0];
      console.log(`Checking radusuarios for client_id: ${sampleClientId}`);
      
      try {
        const { registros, total } = await ixcRequest(api_url, encodedToken, 'radusuarios', {
          qtype: 'id_cliente',
          query: String(sampleClientId),
          oper: '=',
          page: '1',
          rp: '10',
        });
        
        console.log(`radusuarios for client ${sampleClientId}: ${registros.length} records (total: ${total})`);
        
        if (registros.length > 0) {
          // Log ALL fields of first record
          const record = registros[0];
          console.log('ALL FIELDS:', JSON.stringify(record));
        }
      } catch (err: any) {
        console.error(`radusuarios query failed: ${err.message}`);
      }
    }

    // Step 2: Query radusuarios for each client_id individually (much faster than scanning all 24k records)
    if (client_ids && Array.isArray(client_ids)) {
      for (const clientId of client_ids) {
        try {
          const { registros } = await ixcRequest(api_url, encodedToken, 'radusuarios', {
            qtype: 'id_cliente',
            query: String(clientId),
            oper: '=',
            page: '1',
            rp: '10',
          });
          
          for (const r of registros) {
            // Check all possible online indicators
            const isOnline = r.online === 'S' || r.online === 's' || 
                             r.online === '1' || r.online === 1 || 
                             r.online === true || r.online === 'sim' ||
                             r.ativo === 'S' || r.ativo === 's';
            
            if (isOnline) {
              onlineClientIds.push(String(clientId));
              break; // Found one online record for this client, enough
            }
          }
        } catch (err: any) {
          console.error(`Error checking client ${clientId}: ${err.message}`);
        }
      }
    }

    console.log(`Result: ${onlineClientIds.length} online clients out of ${client_ids?.length || 0}`);

    return new Response(JSON.stringify({ 
      online_clients: [...new Set(onlineClientIds)],
      total_online: new Set(onlineClientIds).size,
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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function encodeIxcToken(rawToken: string): string {
  if (rawToken.includes(':')) return btoa(rawToken);
  return btoa(`${rawToken}:`);
}

async function ixcPost(apiUrl: string, encodedToken: string, endpoint: string, params: Record<string, any> = {}) {
  const url = `${apiUrl.replace(/\/$/, '')}/${endpoint}`;
  const body = {
    qtype: 'id_cliente',
    query: '0',
    oper: '>',
    page: '1',
    rp: '500',
    sortname: 'id',
    sortorder: 'asc',
    ...params,
  };

  console.log(`IXC request: ${endpoint}, qtype=${body.qtype}, query=${body.query}, oper=${body.oper}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${encodedToken}`,
      'ixcsoft': 'listar',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  
  if (!res.ok || text.startsWith('<')) {
    console.error(`IXC error ${res.status} for ${endpoint}: ${text.substring(0, 200)}`);
    throw new Error(`IXC API error ${res.status}`);
  }

  const data = JSON.parse(text);
  return {
    registros: Array.isArray(data.registros) ? data.registros : [],
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

    const { data: integration } = await supabase
      .from('organization_integrations')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('integration_type', 'ixc')
      .eq('is_active', true)
      .single();

    if (!integration?.api_url || !integration?.api_token) {
      return new Response(JSON.stringify({ error: 'Integração IXC não encontrada', online_clients: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const encodedToken = encodeIxcToken(integration.api_token);
    const requestedIds = new Set(client_ids.map(String));
    const onlineClientIds = new Set<string>();

    // Strategy: paginate through ALL radusuarios records and check 'online' field
    // This avoids per-client queries and handles the IXC API format correctly
    let page = 1;
    const perPage = 500;
    let totalRecords = 0;
    let loggedSample = false;

    while (true) {
      try {
        const { registros, total } = await ixcPost(integration.api_url, encodedToken, 'radusuarios', {
          qtype: 'id',
          query: '0',
          oper: '>',
          page: String(page),
          rp: String(perPage),
          sortname: 'id',
          sortorder: 'asc',
        });

        if (page === 1) {
          totalRecords = total;
          console.log(`radusuarios total: ${total}`);
        }

        if (!registros.length) break;

        // Log sample record to understand structure
        if (!loggedSample && registros.length > 0) {
          loggedSample = true;
          const sample = registros[0];
          const keys = Object.keys(sample);
          console.log(`radusuarios KEYS: ${keys.join(',')}`);
          // Log relevant fields
          const relevant: Record<string, any> = {};
          for (const k of keys) {
            if (k.includes('online') || k.includes('cliente') || k.includes('ativo') || 
                k.includes('status') || k === 'id' || k === 'login') {
              relevant[k] = sample[k];
            }
          }
          console.log(`Sample record: ${JSON.stringify(relevant)}`);
        }

        for (const r of registros) {
          const clientId = String(r.id_cliente || '');
          if (!clientId || !requestedIds.has(clientId)) continue;

          const online = String(r.online || '').toUpperCase();
          if (online === 'S') {
            onlineClientIds.add(clientId);
          }
        }

        if (registros.length < perPage) break;
        page++;
        
        // Safety limit
        if (page > 200) {
          console.log('Safety limit reached at page 200');
          break;
        }
      } catch (err: any) {
        console.error(`Error on page ${page}: ${err.message}`);
        break;
      }
    }

    const result = [...onlineClientIds];
    console.log(`Final: ${result.length} online out of ${client_ids.length} requested (scanned ${totalRecords} radusuarios)`);

    return new Response(JSON.stringify({
      online_clients: result,
      total_online: result.length,
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

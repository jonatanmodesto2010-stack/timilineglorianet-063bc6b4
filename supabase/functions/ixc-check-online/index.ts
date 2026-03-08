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
    const onlineClientIds = new Set<string>();

    // Try multiple radius/connection endpoints to find online status
    const endpointsToTry = [
      'radius_online',
      'radacct', 
      'v_radacct',
      'radpop_pppoe',
      'v_radius_online',
    ];

    let foundEndpoint = false;

    for (const endpoint of endpointsToTry) {
      if (foundEndpoint) break;
      
      try {
        console.log(`Trying endpoint: ${endpoint}`);
        const { registros, total } = await ixcRequest(api_url, encodedToken, endpoint, {
          page: '1',
          rp: '5',
        });
        
        console.log(`${endpoint}: ${registros.length} records (total: ${total})`);
        
        if (registros.length > 0) {
          const keys = Object.keys(registros[0]);
          console.log(`${endpoint} KEYS: ${keys.join(',')}`);
          
          // Check if this is actually a radius/connection table (not financial)
          const hasRadiusFields = keys.some(k => 
            k.includes('login') || k.includes('mac') || k.includes('framedip') || 
            k.includes('nas') || k.includes('acct') || k.includes('calledstation') ||
            k.includes('acctstarttime') || k.includes('acctstoptime')
          );
          
          if (!hasRadiusFields) {
            console.log(`${endpoint}: Not a radius table, skipping`);
            continue;
          }
          
          foundEndpoint = true;
          console.log(`Found radius endpoint: ${endpoint}`);
          
          // Log sample record
          const sample = registros[0];
          const relevantKeys = keys.filter(k => 
            k.includes('cliente') || k.includes('login') || k.includes('online') || 
            k.includes('ativo') || k.includes('status') || k.includes('stop') ||
            k.includes('start') || k === 'id'
          );
          const sampleData: Record<string, any> = {};
          for (const k of relevantKeys) sampleData[k] = sample[k];
          console.log(`Sample: ${JSON.stringify(sampleData)}`);
          
          // Determine how to identify online users
          // For radacct: online = acctstoptime is empty/null
          // For radius_online: all records are online
          const isRadiusOnline = endpoint.includes('online');
          
          if (isRadiusOnline) {
            // All records in radius_online are online connections
            // Need to paginate through all to find matching client_ids
            let page = 1;
            const perPage = 500;
            while (true) {
              const { registros: recs } = await ixcRequest(api_url, encodedToken, endpoint, {
                page: String(page),
                rp: String(perPage),
              });
              
              for (const r of recs) {
                const clientId = String(r.id_cliente || r.cliente_id || '');
                if (clientId) onlineClientIds.add(clientId);
              }
              
              if (recs.length < perPage) break;
              page++;
            }
          } else {
            // For radacct: check each client individually
            // Active connection = acctstoptime is empty
            if (client_ids && Array.isArray(client_ids)) {
              for (const clientId of client_ids) {
                try {
                  // Find the login for this client first
                  const { registros: loginRecs } = await ixcRequest(api_url, encodedToken, endpoint, {
                    qtype: 'id_cliente',
                    query: String(clientId),
                    oper: '=',
                    page: '1',
                    rp: '5',
                    sortname: 'id',
                    sortorder: 'desc', // most recent first
                  });
                  
                  for (const r of loginRecs) {
                    // If acctstoptime is empty, connection is still active
                    const stopTime = r.acctstoptime || r.acct_stop_time || r.data_final || '';
                    if (!stopTime || stopTime === '0000-00-00 00:00:00' || stopTime === '') {
                      onlineClientIds.add(String(clientId));
                      console.log(`Client ${clientId}: ONLINE (active connection found)`);
                      break;
                    }
                  }
                } catch (err: any) {
                  console.error(`Error checking ${endpoint} for client ${clientId}: ${err.message}`);
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.log(`${endpoint} failed: ${err.message.substring(0, 100)}`);
      }
    }

    // If no radius endpoint worked, try checking via login endpoint
    if (!foundEndpoint) {
      console.log('No radius endpoint found, trying login endpoint...');
      try {
        const { registros, total } = await ixcRequest(api_url, encodedToken, 'login', {
          page: '1', rp: '5',
        });
        console.log(`login: ${registros.length} records (total: ${total})`);
        if (registros.length > 0) {
          console.log(`login KEYS: ${Object.keys(registros[0]).join(',')}`);
          const sample: Record<string, any> = {};
          for (const k of Object.keys(registros[0])) {
            if (k.includes('online') || k.includes('cliente') || k.includes('ativo') || k.includes('status') || k === 'id') {
              sample[k] = registros[0][k];
            }
          }
          console.log(`login sample: ${JSON.stringify(sample)}`);
          
          // Check if login has an online field
          if (client_ids && Array.isArray(client_ids)) {
            for (const clientId of client_ids) {
              try {
                const { registros: loginRecs } = await ixcRequest(api_url, encodedToken, 'login', {
                  qtype: 'id_cliente',
                  query: String(clientId),
                  oper: '=',
                  page: '1',
                  rp: '10',
                });
                
                for (const r of loginRecs) {
                  const online = r.online || r.ativo || '';
                  if (online === 'S' || online === 's' || online === '1' || online === 1 || online === true) {
                    onlineClientIds.add(String(clientId));
                    console.log(`Client ${clientId}: ONLINE via login`);
                    break;
                  }
                }
              } catch (err: any) {
                console.error(`Error checking login for client ${clientId}: ${err.message}`);
              }
            }
          }
        }
      } catch (err: any) {
        console.log(`login endpoint failed: ${err.message.substring(0, 100)}`);
      }
    }

    const result = [...onlineClientIds];
    // Filter to requested client_ids if provided
    let filtered = result;
    if (client_ids && Array.isArray(client_ids) && client_ids.length > 0) {
      const filterSet = new Set(client_ids.map(String));
      filtered = result.filter(id => filterSet.has(id));
    }

    console.log(`Final: ${filtered.length} online out of ${client_ids?.length || 0} requested`);

    return new Response(JSON.stringify({ 
      online_clients: filtered,
      total_online: onlineClientIds.size,
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

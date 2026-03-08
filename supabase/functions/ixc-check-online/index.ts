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

async function ixcRequest(apiUrl: string, encodedToken: string, endpoint: string, page = 1, perPage = 500, extraBody: Record<string, any> = {}) {
  const url = `${apiUrl.replace(/\/$/, '')}/${endpoint}`;
  const body: Record<string, any> = {
    qtype: 'id',
    query: '0',
    oper: '>',
    page: String(page),
    rp: String(perPage),
    sortname: 'id',
    sortorder: 'asc',
    ...extraBody,
  };

  console.log(`IXC Request: ${endpoint} page ${page}`);

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
    console.error(`IXC API error ${res.status} for ${endpoint}: ${text.substring(0, 200)}`);
    throw new Error(`IXC API error ${res.status}: ${text}`);
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

    // Auth check (optional - skip if no auth header for testing)
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        console.log('Auth failed, continuing anyway for service calls');
      }
    }

    const body = await req.json();
    const { organization_id, client_ids } = body;
    console.log(`organization_id: ${organization_id}, client_ids: ${JSON.stringify(client_ids)}`);

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
      console.log('No IXC integration found:', intError?.message);
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

    console.log(`IXC API URL: ${api_url}`);
    const encodedToken = encodeIxcToken(api_token);

    // Try multiple approaches to find online clients
    const onlineClientIds: string[] = [];

    // Approach 1: Try radusuarios endpoint with online filter
    try {
      console.log('Trying radusuarios endpoint...');
      let page = 1;
      const perPage = 500;
      let totalFound = 0;

      while (true) {
        const { registros, total } = await ixcRequest(api_url, encodedToken, 'radusuarios', page, perPage);
        
        console.log(`radusuarios page ${page}: ${registros.length} records, total: ${total}`);
        
        // Log sample record to understand structure
        if (page === 1 && registros.length > 0) {
          const sample = registros[0];
          console.log('radusuarios fields:', Object.keys(sample).join(', '));
          // Log online-related fields
          const relevantFields: Record<string, any> = {};
          for (const key of Object.keys(sample)) {
            if (key.includes('online') || key.includes('cliente') || key.includes('ativo') || 
                key.includes('status') || key === 'id') {
              relevantFields[key] = sample[key];
            }
          }
          console.log('Relevant fields sample:', JSON.stringify(relevantFields));
        }
        
        for (const r of registros) {
          const clientId = String(r.id_cliente || '');
          // Check multiple possible field names/values for online status
          const isOnline = r.online === 'S' || r.online === 's' || 
                           r.online === '1' || r.online === 1 || 
                           r.online === true || r.online === 'sim' ||
                           r.ativo === 'S' || r.ativo === 's';
          
          if (clientId && isOnline) {
            onlineClientIds.push(clientId);
          }
        }

        totalFound = total;
        if (registros.length === 0 || registros.length < perPage) break;
        page++;
      }

      console.log(`radusuarios: found ${onlineClientIds.length} online out of ${totalFound} total`);
    } catch (err: any) {
      console.error('radusuarios failed:', err.message);
      
      // Approach 2: Try radius_online endpoint
      try {
        console.log('Trying radius_online endpoint...');
        const { registros, total } = await ixcRequest(api_url, encodedToken, 'radius_online', 1, 500);
        console.log(`radius_online: ${registros.length} records, total: ${total}`);
        
        if (registros.length > 0) {
          console.log('radius_online fields:', Object.keys(registros[0]).join(', '));
          console.log('radius_online sample:', JSON.stringify(registros[0]).substring(0, 500));
        }
        
        for (const r of registros) {
          const clientId = String(r.id_cliente || r.cliente_id || '');
          if (clientId) onlineClientIds.push(clientId);
        }
      } catch (err2: any) {
        console.error('radius_online also failed:', err2.message);
        
        // Approach 3: Try radacct (active connections = no disconnect time)
        try {
          console.log('Trying radacct endpoint...');
          const { registros, total } = await ixcRequest(api_url, encodedToken, 'radacct', 1, 100);
          console.log(`radacct: ${registros.length} records, total: ${total}`);
          
          if (registros.length > 0) {
            console.log('radacct fields:', Object.keys(registros[0]).join(', '));
          }
        } catch (err3: any) {
          console.error('radacct also failed:', err3.message);
        }
      }
    }
    
    // Filter to requested client_ids
    let result = [...new Set(onlineClientIds)];
    if (client_ids && Array.isArray(client_ids) && client_ids.length > 0) {
      const filterSet = new Set(client_ids.map(String));
      result = result.filter(id => filterSet.has(id));
    }

    console.log(`Final result: ${result.length} online clients`);

    return new Response(JSON.stringify({ 
      online_clients: result,
      total_online: new Set(onlineClientIds).size,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error checking online status:', error);
    return new Response(JSON.stringify({ error: error.message, online_clients: [] }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

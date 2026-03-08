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
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { organization_id, client_ids } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id é obrigatório' }), {
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

    // Query radusuarios to find online users
    // radusuarios has id_cliente field that maps to client IDs
    const onlineClientIds: string[] = [];
    let page = 1;
    const perPage = 500;

    while (true) {
      const { registros, total } = await ixcRequest(api_url, encodedToken, 'radusuarios', page, perPage);
      
      for (const r of registros) {
        const clientId = String(r.id_cliente || '');
        // radusuarios: online field = 'S' means online
        if (clientId && r.online === 'S') {
          onlineClientIds.push(clientId);
        }
      }

      if (onlineClientIds.length >= total || registros.length < perPage) break;
      page++;
    }

    // If client_ids provided, filter to only those
    let result = onlineClientIds;
    if (client_ids && Array.isArray(client_ids) && client_ids.length > 0) {
      const filterSet = new Set(client_ids.map(String));
      result = onlineClientIds.filter(id => filterSet.has(id));
    }

    return new Response(JSON.stringify({ 
      online_clients: [...new Set(result)],
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

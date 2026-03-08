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

// Helper: check if sync was cancelled
async function checkCancelled(supabase: any, syncId: string): Promise<boolean> {
  const { data } = await supabase
    .from('integration_sync_log')
    .select('status')
    .eq('id', syncId)
    .single();
  return data?.status === 'cancelled';
}

// Helper: update sync log progress
async function updateSyncLog(supabase: any, syncId: string, updates: Record<string, any>) {
  await supabase
    .from('integration_sync_log')
    .update({ ...updates })
    .eq('id', syncId);
}

async function fetchAllIxcRecordsWithProgress(
  apiUrl: string, token: string, endpoint: string,
  supabase: any, syncId: string,
  extraBody: Record<string, any> = {},
  progressOffset = 0
) {
  const all: any[] = [];
  let page = 1;
  const perPage = 500;

  while (true) {
    // Check cancellation every page
    if (await checkCancelled(supabase, syncId)) {
      throw new Error('CANCELLED');
    }

    const { registros, total } = await ixcRequest(apiUrl, token, endpoint, page, perPage, extraBody);
    all.push(...registros);

    // Update progress
    await updateSyncLog(supabase, syncId, {
      records_processed: progressOffset + all.length,
      total_records: progressOffset + total,
    });

    if (all.length >= total || registros.length < perPage) break;
    page++;
  }

  return all;
}

async function fetchAllIxcRecords(apiUrl: string, token: string, endpoint: string, extraBody: Record<string, any> = {}) {
  const all: any[] = [];
  let page = 1;
  const perPage = 500;

  while (true) {
    const { registros, total } = await ixcRequest(apiUrl, token, endpoint, page, perPage, extraBody);
    all.push(...registros);
    if (all.length >= total || registros.length < perPage) break;
    page++;
  }

  return all;
}

async function fetchFiliais(apiUrl: string, token: string): Promise<Map<string, string>> {
  const filialMap = new Map<string, string>();
  try {
    const filiais = await fetchAllIxcRecords(apiUrl, token, 'filial');
    for (const f of filiais) {
      filialMap.set(String(f.id), f.razao || f.fantasia || `Filial ${f.id}`);
    }
  } catch (e) {
    console.log('Could not fetch filiais:', e.message);
  }
  return filialMap;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Test connection
    if (action === 'test') {
      const { api_url, api_token } = body;
      if (!api_url || !api_token) {
        return new Response(JSON.stringify({ error: 'URL e Token são obrigatórios' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const token = encodeIxcToken(api_token);
      const { total } = await ixcRequest(api_url, token, 'cliente', 1, 1);
      // Count only active clients
      const { total: activeTotal } = await ixcRequest(api_url, token, 'cliente', 1, 1, {
        qtype: 'ativo',
        query: 'S',
        oper: '=',
      });
      return new Response(JSON.stringify({ success: true, total_clients: total, active_clients: activeTotal }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Full sync or boleto sync
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (action !== 'cron') {
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
    }

    // Get organization integrations
    let orgFilter: string | null = body.organization_id || null;

    const intQuery = supabase.from('organization_integrations').select('*').eq('integration_type', 'ixc').eq('is_active', true);
    if (orgFilter) intQuery.eq('organization_id', orgFilter);
    const { data: integrations, error: intError } = await intQuery;
    if (intError) throw intError;

    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhuma integração ativa encontrada' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const integration of integrations) {
      const { organization_id, api_url, api_token, api_url_contracts } = integration;
      if (!api_url || !api_token) continue;

      const token = encodeIxcToken(api_token);
      const orgResult: any = { organization_id, clients: 0, boletos: 0, errors: [] };

      // Create sync log entry
      const syncType = action === 'sync_boletos' ? 'boletos' : action === 'sync_clients' ? 'clients' : action === 'check_blocked' ? 'blocked_check' : 'full';
      const { data: syncLog } = await supabase
        .from('integration_sync_log')
        .insert({
          organization_id,
          sync_type: syncType,
          status: 'running',
          started_at: new Date().toISOString(),
          records_processed: 0,
          total_records: 0,
        })
        .select('id')
        .single();

      const syncId = syncLog?.id;

      try {
        // === SYNC CLIENTS ===
        if (action === 'sync' || action === 'cron' || action === 'sync_all' || action === 'sync_clients' || action === 'check_blocked') {
          // Fetch clients with progress tracking
          const clients = await fetchAllIxcRecordsWithProgress(api_url, token, 'cliente', supabase, syncId);

          // Check cancellation
          if (await checkCancelled(supabase, syncId)) {
            orgResult.errors.push('Sincronização cancelada pelo usuário');
            await updateSyncLog(supabase, syncId, { status: 'cancelled', completed_at: new Date().toISOString() });
            results.push(orgResult);
            continue;
          }

          // Fetch filiais
          const filialMap = await fetchFiliais(api_url, token);

          // Fetch contracts
          const contractsUrl = api_url_contracts || api_url;
          const contractsToken = api_url_contracts ? token : token;
          const contracts = await fetchAllIxcRecords(contractsUrl, contractsToken, 'cliente_contrato');

          // Check cancellation
          if (await checkCancelled(supabase, syncId)) {
            await updateSyncLog(supabase, syncId, { status: 'cancelled', completed_at: new Date().toISOString() });
            results.push(orgResult);
            continue;
          }

          // Fetch blocked clients
          let blockedIds = new Set<string>();
          try {
            const blocked = await fetchAllIxcRecords(api_url, token, 'cliente_bloqueado');
            console.log(`Blocked clients from IXC: ${blocked.length}`);
            if (blocked.length > 0) {
              console.log(`Sample blocked: ${JSON.stringify(blocked[0])}`);
            }
            blockedIds = new Set(blocked.map((b: any) => String(b.id_cliente)));
            console.log(`Blocked IDs set size: ${blockedIds.size}`);
          } catch (e) {
            console.error(`Error fetching blocked: ${e.message}`);
            orgResult.errors.push(`Erro ao buscar bloqueados: ${e.message}`);
          }

          // Build contract map
          const contractMap = new Map<string, { active: boolean; blocked: boolean }>();
          for (const c of contracts) {
            const cid = String(c.id_cliente);
            const isContractActive = c.status === 'A';
            const existing = contractMap.get(cid);
            if (!existing || isContractActive) {
              contractMap.set(cid, {
                active: isContractActive,
                blocked: blockedIds.has(cid),
              });
            }
          }

          // Discover clients from contracts not in main list
          const mainClientIds = new Set(clients.map((c: any) => String(c.id)));
          const contractOnlyIds = new Set<string>();
          for (const c of contracts) {
            const cid = String(c.id_cliente);
            if (!mainClientIds.has(cid)) {
              contractOnlyIds.add(cid);
            }
          }

          // Fetch contract-only clients individually
          for (const cid of contractOnlyIds) {
            try {
              const { registros } = await ixcRequest(api_url, token, 'cliente', 1, 1, {
                qtype: 'id',
                query: cid,
                oper: '=',
              });
              if (registros.length > 0) {
                clients.push(registros[0]);
              }
            } catch (e) {
              console.log(`Could not fetch contract-only client ${cid}:`, e.message);
            }
          }

          // Get existing timelines for this org
          const { data: existingTimelines } = await supabase
            .from('client_timelines')
            .select('id, client_id, client_name, is_active, status, ixc_filial_id')
            .eq('organization_id', organization_id);

          const existingMap = new Map<string, any>();
          for (const t of (existingTimelines || [])) {
            if (t.client_id) existingMap.set(t.client_id, t);
          }

          // Get a user_id for this org
          const { data: orgUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('organization_id', organization_id)
            .in('role', ['owner', 'admin'])
            .limit(1);
          const defaultUserId = orgUsers?.[0]?.user_id;
          if (!defaultUserId) {
            orgResult.errors.push('Nenhum owner/admin encontrado na organização');
            await updateSyncLog(supabase, syncId, { status: 'error', error_message: 'No admin found', completed_at: new Date().toISOString() });
            results.push(orgResult);
            continue;
          }

          // Process clients
          const toInsert: any[] = [];
          const updateIds: string[] = [];
          const updateNames: string[] = [];
          const updateActive: boolean[] = [];
          const updateStatuses: string[] = [];
          const updateFilialIds: string[] = [];
          const updateFilialNames: string[] = [];

          let blockedCount = 0;

          for (const client of clients) {
            const clientIdStr = String(client.id);
            const clientName = client.razao || client.fantasia || `Cliente ${client.id}`;
            const contract = contractMap.get(clientIdStr);
            const isClientActive = client.ativo === 'S';

            const filialId = client.id_filial ? String(client.id_filial) : null;
            const filialName = filialId ? (filialMap.get(filialId) || `Filial ${filialId}`) : null;

            let isActive = true;
            let status = 'active';

            // Priority: blocked check first, then active/inactive
            if (contract?.blocked || blockedIds.has(clientIdStr)) {
              isActive = false;
              status = 'active';
              blockedCount++;
            } else if (!isClientActive) {
              status = 'archived';
              isActive = false;
            } else if (contract) {
              isActive = contract.active;
              status = contract.active ? 'active' : 'archived';
            }

            const existing = existingMap.get(clientIdStr);
            if (existing) {
              if (existing.client_name !== clientName || existing.is_active !== isActive || existing.status !== status || existing.ixc_filial_id !== filialId) {
                updateIds.push(existing.id);
                updateNames.push(clientName);
                updateActive.push(isActive);
                updateStatuses.push(status);
                updateFilialIds.push(filialId || '');
                updateFilialNames.push(filialName || '');
              }
            } else {
              toInsert.push({
                client_id: clientIdStr,
                client_name: clientName,
                is_active: isActive,
                status,
                organization_id,
                user_id: defaultUserId,
                start_date: new Date().toISOString().split('T')[0],
                ixc_filial_id: filialId,
                ixc_filial_name: filialName,
              });
            }
          }

          // Batch insert
          if (toInsert.length > 0) {
            for (let i = 0; i < toInsert.length; i += 200) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const chunk = toInsert.slice(i, i + 200);
              const { error } = await supabase.from('client_timelines').insert(chunk);
              if (error) orgResult.errors.push(`Insert error: ${error.message}`);
            }
          }

          // Batch update
          if (updateIds.length > 0) {
            for (let i = 0; i < updateIds.length; i += 500) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const { error } = await supabase.rpc('batch_upsert_clients', {
                p_ids: updateIds.slice(i, i + 500),
                p_names: updateNames.slice(i, i + 500),
                p_active: updateActive.slice(i, i + 500),
                p_statuses: updateStatuses.slice(i, i + 500),
                p_filial_ids: updateFilialIds.slice(i, i + 500),
                p_filial_names: updateFilialNames.slice(i, i + 500),
              });
              if (error) orgResult.errors.push(`Update error: ${error.message}`);
            }
          }

          orgResult.clients = clients.length;
          orgResult.clients_inserted = toInsert.length;
          orgResult.clients_updated = updateIds.length;
          orgResult.clients_from_contracts = contractOnlyIds.size;
          orgResult.filiais = filialMap.size;
        }

        // === SYNC BOLETOS ===
        if (action === 'sync_boletos' || action === 'sync' || action === 'cron' || action === 'sync_all') {
          if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');

          const currentOffset = orgResult.clients || 0;
          const boletos = await fetchAllIxcRecordsWithProgress(api_url, token, 'fn_areceber', supabase, syncId, {}, currentOffset);

          const { data: timelines } = await supabase
            .from('client_timelines')
            .select('id, client_id')
            .eq('organization_id', organization_id);

          const clientToTimeline = new Map<string, string>();
          for (const t of (timelines || [])) {
            if (t.client_id) clientToTimeline.set(t.client_id, t.id);
          }

          const timelineIds = (timelines || []).map(t => t.id);
          let existingBoletos = new Map<string, any>();
          if (timelineIds.length > 0) {
            for (let i = 0; i < timelineIds.length; i += 200) {
              const chunk = timelineIds.slice(i, i + 200);
              const { data } = await supabase
                .from('client_boletos')
                .select('id, ixc_boleto_id, timeline_id, status, boleto_value, due_date')
                .in('timeline_id', chunk)
                .not('ixc_boleto_id', 'is', null);
              for (const b of (data || [])) {
                if (b.ixc_boleto_id) existingBoletos.set(b.ixc_boleto_id, b);
              }
            }
          }

          const boletosToInsert: any[] = [];
          const boletosToUpdate: { id: string; status: string; boleto_value: number; due_date: string }[] = [];
          let processedCount = 0;

          for (const boleto of boletos) {
            const clientId = String(boleto.id_cliente);
            const timelineId = clientToTimeline.get(clientId);
            if (!timelineId) continue;

            const ixcBoletoId = String(boleto.id);
            const valor = parseFloat(boleto.valor || '0');
            const dataVencimento = boleto.data_vencimento || '';

            let status = 'pendente';
            if (boleto.status === 'R' || boleto.liquidado === 'S') {
              status = 'pago';
            } else if (boleto.status === 'C') {
              status = 'cancelado';
            }

            const existing = existingBoletos.get(ixcBoletoId);
            if (existing) {
              if (existing.status !== status || Number(existing.boleto_value) !== valor || existing.due_date !== dataVencimento) {
                boletosToUpdate.push({ id: existing.id, status, boleto_value: valor, due_date: dataVencimento });
              }
            } else {
              boletosToInsert.push({
                timeline_id: timelineId,
                ixc_boleto_id: ixcBoletoId,
                boleto_value: valor,
                due_date: dataVencimento,
                status,
              });
            }
            processedCount++;
          }

          if (boletosToInsert.length > 0) {
            for (let i = 0; i < boletosToInsert.length; i += 200) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const chunk = boletosToInsert.slice(i, i + 200);
              const { error } = await supabase.from('client_boletos').insert(chunk);
              if (error) orgResult.errors.push(`Boleto insert error: ${error.message}`);
            }
          }

          if (boletosToUpdate.length > 0) {
            for (let i = 0; i < boletosToUpdate.length; i += 500) {
              if (await checkCancelled(supabase, syncId)) throw new Error('CANCELLED');
              const chunk = boletosToUpdate.slice(i, i + 500);
              const { error } = await supabase.rpc('batch_upsert_boletos', {
                p_ids: chunk.map(b => b.id),
                p_values: chunk.map(b => b.boleto_value),
                p_dates: chunk.map(b => b.due_date),
                p_statuses: chunk.map(b => b.status),
              });
              if (error) orgResult.errors.push(`Boleto update error: ${error.message}`);
            }
          }

          orgResult.boletos = processedCount;
          orgResult.boletos_inserted = boletosToInsert.length;
          orgResult.boletos_updated = boletosToUpdate.length;
        }

        // Mark sync as completed
        if (syncId) {
          await updateSyncLog(supabase, syncId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            records_created: (orgResult.clients_inserted || 0) + (orgResult.boletos_inserted || 0),
            records_updated: (orgResult.clients_updated || 0) + (orgResult.boletos_updated || 0),
          });
        }
      } catch (e: any) {
        if (e.message === 'CANCELLED') {
          orgResult.errors.push('Sincronização cancelada pelo usuário');
          if (syncId) {
            await updateSyncLog(supabase, syncId, { status: 'cancelled', completed_at: new Date().toISOString() });
          }
        } else {
          orgResult.errors.push(e.message);
          if (syncId) {
            await updateSyncLog(supabase, syncId, {
              status: 'error',
              error_message: e.message,
              completed_at: new Date().toISOString(),
            });
          }
        }
      }

      results.push(orgResult);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

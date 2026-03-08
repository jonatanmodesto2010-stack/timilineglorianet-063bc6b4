

## Otimização Radical: Clientes em < 2s (atual: 32s)

### Causa raiz

O carregamento atual faz **3 operações sequenciais bloqueantes**:
1. `fetchAllPaginated` faz N queries sequenciais (loop while) para buscar 1600+ clientes
2. `loadOverdueDays` busca TODOS os boletos de 1600+ timelines em chunks de 200 (8+ queries)
3. CalendarWidget faz 3 queries cascata (timelines → lines → events) para TODOS os clientes ativos

Total: ~15-20 requests sequenciais antes de mostrar qualquer coisa.

### Estratégia: Mostrar dados imediatamente, enriquecer depois

#### 1. Carregar apenas a primeira página de clientes (`src/pages/Clients.tsx`)
- Substituir `fetchAllPaginated` por uma query simples com `.range(0, 29)` (30 itens)
- Mostrar os clientes **imediatamente** após a primeira query
- Buscar o **total count** com `{ count: 'exact', head: true }` para paginação
- Implementar **paginação server-side** real em vez de carregar tudo e paginar no frontend

#### 2. Carregar overdue days em background, não bloqueante
- Separar `loadOverdueDays` para rodar **após** os clientes já estarem visíveis
- Buscar boletos apenas para os 30 clientes da página atual (não todos os 1600+)
- Atualizar o `overdueDaysMap` de forma incremental sem bloquear a UI

#### 3. Otimizar CalendarWidget para não bloquear
- CalendarWidget já carrega independentemente, mas faz queries pesadas
- Limitar a busca de events a um range de datas (semana atual) em vez de todos os events
- Usar `.gte('event_date', startDate).lte('event_date', endDate)` no filtro

#### 4. Filtro e busca server-side
- Mover filtros de `searchTerm`, `statusFilter` e `filialFilter` para a query do banco
- Usar `.ilike('client_name', '%term%')` para busca
- Usar `.eq('ixc_filial_id', filialId)` para filtro de filial
- Usar condições de status no servidor em vez de filtrar 1600+ registros no client

### Impacto esperado

| Etapa | Antes | Depois |
|-------|-------|--------|
| Query inicial | 2-4 requests (1000 rows cada) | 1 request (30 rows) |
| Boletos | 8+ requests (todos IDs) | 1 request (30 IDs) |
| CalendarWidget | 3 cascata (todos dados) | 2-3 com filtro de data |
| **Total até render** | **~32s** | **< 2s** |

### Arquivos alterados
- `src/pages/Clients.tsx` — paginação server-side, queries otimizadas, overdue em background
- `src/components/CalendarWidget.tsx` — filtro por range de datas


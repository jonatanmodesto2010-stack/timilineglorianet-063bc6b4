

## Auditoria de Performance e Plano de Otimização

### Problemas Identificados

**1. Zero code splitting** -- Todas as 12 páginas são importadas estaticamente em `App.tsx`, forçando o download de todo o bundle no carregamento inicial (Calendar.tsx sozinho tem 925 linhas, Clients.tsx 514, Dashboard.tsx 416).

**2. Sem virtualização de lista** -- Apesar da memory note mencionar virtualização, não há nenhum uso de `react-virtual` ou `react-window` no código. A lista de clientes renderiza todos os itens da página com `motion.div` animado individualmente.

**3. SELECT * em todas as queries** -- Mais de 20 chamadas usando `.select('*')` em componentes frontend (CalendarWidget, ClientTimeline, Calendar, History, ClientDashboardModal), trazendo colunas desnecessárias.

**4. Animações bloqueantes** -- Cada card de cliente usa `motion.div` com `initial/animate` e delay incremental, causando layout thrashing e aumentando INP.

**5. Queries em cascata** -- CalendarWidget e Calendar fazem 3 queries sequenciais (timelines → lines → events) sem paralelização adequada.

**6. QueryClient sem configuração de cache** -- `new QueryClient()` usa defaults sem staleTime, causando refetches desnecessários.

**7. fetchAllPaginated usa `select('*')` para client_timelines** -- Traz todas as colunas quando só precisa de ~6 campos para a listagem.

---

### Implementação (7 alterações)

#### 1. Lazy loading de todas as rotas (`src/App.tsx`)
- Converter todos os imports de páginas para `React.lazy()`
- Envolver `<Routes>` com `<Suspense fallback={<LoadingSpinner />}>`
- Impacto: reduz bundle inicial em ~60%

#### 2. Configurar QueryClient com cache (`src/App.tsx`)
- Adicionar `defaultOptions.queries.staleTime: 2 * 60 * 1000` (2 min)
- Adicionar `refetchOnWindowFocus: false`

#### 3. Otimizar queries da página Clients (`src/pages/Clients.tsx`)
- Trocar `select('*')` por `select('id, client_name, client_id, status, is_active, organization_id, ixc_filial_id, ixc_filial_name, start_date, created_at')`
- Trocar `select('*')` dos boletos por `select('timeline_id, due_date, status')`
- Converter `loadClients` para usar `useQuery` do TanStack Query com cache

#### 4. Remover animações pesadas dos cards (`src/pages/Clients.tsx`)
- Substituir `motion.div` com delay incremental por `div` simples com transição CSS
- Manter apenas hover effects via CSS (`transition-opacity`)
- Impacto direto no INP

#### 5. Otimizar CalendarWidget (`src/components/CalendarWidget.tsx`)
- Trocar `select('*')` de timeline_events por `select('id, event_date, event_time, description, status, icon, line_id')`
- Trocar `select('*')` de client_timelines por `select('id, client_name')`
- Paralelizar as 3 queries onde possível

#### 6. Otimizar Calendar page (`src/pages/Calendar.tsx`)
- Trocar `select('*')` por colunas específicas nas queries de events e timelines

#### 7. Otimizar ClientDashboardModal (`src/components/ClientDashboardModal.tsx`)
- Trocar `select('*')` por colunas específicas nas queries de tags, boletos e análises

---

### Resultado Esperado

| Métrica | Atual | Meta |
|---------|-------|------|
| LCP | 6.10s | < 2.5s |
| INP | 216ms | < 200ms |
| CLS | 0.00 | 0.00 |

O lazy loading sozinho deve reduzir o LCP drasticamente ao eliminar o carregamento de ~10 páginas não utilizadas. A remoção das animações `motion.div` nos cards resolve o INP.


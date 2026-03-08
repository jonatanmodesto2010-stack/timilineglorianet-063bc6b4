

# Plano: Refatoração SaaS Multi-Tenant

## Visão Geral

Transformar o sistema atual em uma plataforma SaaS multi-tenant com painel Super Admin separado, controle completo de organizações/provedores, RBAC hierárquico e estrutura para planos/assinaturas.

---

## Fase 1 -- Modelagem de Dados (Migrations)

### 1.1 Adicionar campos na tabela `organizations`

```sql
ALTER TABLE organizations ADD COLUMN status text NOT NULL DEFAULT 'active'; -- active, suspended, inactive
ALTER TABLE organizations ADD COLUMN plan text NOT NULL DEFAULT 'basic';     -- basic, pro, enterprise
ALTER TABLE organizations ADD COLUMN max_users integer NOT NULL DEFAULT 5;
ALTER TABLE organizations ADD COLUMN max_clients integer NOT NULL DEFAULT 100;
ALTER TABLE organizations ADD COLUMN logo_url text;
ALTER TABLE organizations ADD COLUMN primary_color text;
ALTER TABLE organizations ADD COLUMN custom_domain text;
ALTER TABLE organizations ADD COLUMN suspended_at timestamptz;
ALTER TABLE organizations ADD COLUMN subscription_expires_at timestamptz;
```

### 1.2 Atualizar RLS de `organizations`

- Permitir Super Admins fazer SELECT, INSERT, UPDATE, DELETE em todas as organizações
- Manter políticas existentes para usuários normais

### 1.3 Remover criação automática de organização no signup

Alterar a function `handle_new_user_complete()` para:
- Manter criação de profile
- **Remover** bloco que cria organização automaticamente para signup comum
- Manter fluxo de `created_by_admin` (já funciona)
- Usuários que fazem signup público ficam sem organização (acesso negado até serem atribuídos)

### 1.4 Atualizar RLS de `super_admins`

- Permitir Super Admins fazer SELECT em `user_roles`, `profiles` e `organizations` sem restrição de org

---

## Fase 2 -- Painel Super Admin

### 2.1 Rota e Layout

- Nova rota `/admin` com layout próprio (sidebar separada do painel do provedor)
- Componente `AdminLayout` com navegação: Organizações, Usuários Globais, Configurações Globais
- Guard: redirecionar para `/` se não for super_admin

### 2.2 Tela de Gestão de Organizações (`/admin/organizations`)

- Lista todas as organizações com: nome, status, plano, total de usuários, total de clientes, data de criação
- Ações: Criar, Editar, Suspender/Ativar, Excluir
- Dialog de criação com campos: nome, plano, max_users, max_clients, email/senha do primeiro admin

### 2.3 Tela de Detalhes da Organização (`/admin/organizations/:id`)

- Editar dados da organização (nome, plano, limites)
- Listar usuários da organização
- Adicionar/remover usuários
- Ver métricas básicas (total clientes, boletos)

### 2.4 Edge Function para criação de organização pelo Super Admin

- Recebe: nome da org, plano, dados do primeiro admin
- Cria organização, cria usuário via admin API, atribui role `owner`
- Usa `SUPABASE_SERVICE_ROLE_KEY` (já configurado nos secrets)

---

## Fase 3 -- Ajustes no Frontend Existente

### 3.1 Auth Page

- **Remover** formulário de cadastro público (só login)
- Manter recuperação de senha
- Signup apenas via Super Admin ou Admin da org

### 3.2 Sidebar e Header

- Condicionar itens do menu ao role do usuário
- Super Admin vê link para `/admin`
- Viewers não veem certos menus

### 3.3 Hook `useUserRole`

- Adicionar verificação de organização ativa (`status = 'active'`)
- Se organização suspensa, mostrar tela de "Organização suspensa"

### 3.4 Revisão de Queries

Todas as queries que filtram por `organization_id` já estão corretas via RLS. Verificar:
- `client_timelines` -- OK
- `client_boletos` -- OK (via join)
- `timeline_events` -- OK (via join)
- `tags`, `collection_rules`, `organization_icons` -- OK
- `client_agreements`, `collection_actions` -- OK

---

## Fase 4 -- RBAC Completo

O RBAC atual (`owner`, `admin`, `member`, `viewer`) já está bem implementado. Ajustes:

- `super_admin` permanece na tabela separada `super_admins` (correto)
- Adicionar verificação de `viewer` nas telas para tornar read-only (desabilitar botões de ação)
- Verificar que `member` pode criar/editar clientes e eventos mas não gerenciar usuários/settings

---

## Fase 5 -- Estrutura para Futuro

### 5.1 White-label

- Campos `logo_url`, `primary_color`, `custom_domain` na tabela `organizations` (adicionados na Fase 1)
- Hook `useOrganizationBranding` para carregar e aplicar tema

### 5.2 Limites por plano

- Verificar `max_users` ao adicionar usuários
- Verificar `max_clients` ao criar clientes
- Função de banco `check_org_limits()` para validação server-side

---

## Arquivos Principais a Criar/Modificar

| Ação | Arquivo |
|------|---------|
| Criar | `src/pages/admin/AdminDashboard.tsx` |
| Criar | `src/pages/admin/AdminOrganizations.tsx` |
| Criar | `src/pages/admin/AdminOrganizationDetail.tsx` |
| Criar | `src/components/admin/AdminLayout.tsx` |
| Criar | `src/components/admin/AdminSidebar.tsx` |
| Criar | `src/components/admin/CreateOrganizationDialog.tsx` |
| Criar | `src/components/admin/OrganizationUsersTable.tsx` |
| Criar | `src/hooks/useOrganizationStatus.tsx` |
| Criar | `supabase/functions/admin-create-organization/index.ts` |
| Modificar | `src/App.tsx` (adicionar rotas /admin/*) |
| Modificar | `src/pages/Auth.tsx` (remover signup público) |
| Modificar | `src/hooks/useUserRole.tsx` (verificar org ativa) |
| Modificar | `src/components/Sidebar.tsx` (link admin) |
| Migration | Campos na tabela organizations |
| Migration | Atualizar `handle_new_user_complete()` |
| Migration | RLS para super admins em organizations |
| Migration | Function `check_org_limits()` |

---

## Ordem de Execução

1. Migrations (schema + functions + RLS)
2. Edge function de criação de org
3. Painel Super Admin (layout + telas)
4. Ajustes Auth (remover signup)
5. Ajustes no frontend existente (org status, viewer restrictions)
6. Testes de isolamento entre tenants


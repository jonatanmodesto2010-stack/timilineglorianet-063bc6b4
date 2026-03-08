

## Plano: Integrações por Organização (Super Admin)

### Objetivo
Mover o gerenciamento de integrações para o painel Super Admin, dentro do detalhe de cada organização. Cada organização poderá ter uma integração com um sistema específico (IXC, SGP, MK Solutions, Radius, etc.).

### Alterações

#### 1. Migration SQL — RLS para Super Admin em `organization_integrations`
Adicionar política para que Super Admins possam gerenciar integrações de qualquer organização:
```sql
CREATE POLICY "Super admins can manage all integrations"
ON public.organization_integrations FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));
```

#### 2. Novo componente: `src/components/admin/AdminOrgIntegrations.tsx`
- Recebe `organizationId` como prop
- Carrega integrações da organização em `organization_integrations`
- Seletor de tipo de sistema (IXC, SGP, MK Solutions, Radius, Outro)
- Campos: URL da API, Token, URL de Contratos (opcional), Ativo/Inativo
- Botões: Salvar, Testar Conexão, Sincronizar (reutilizando lógica existente do IXC)
- Progresso de sync, histórico — adaptado do `IntegrationsSettings` atual

#### 3. Editar `src/pages/admin/AdminOrganizationDetail.tsx`
- Importar e renderizar `AdminOrgIntegrations` passando o `id` da organização como prop
- Adicionar como um novo Card abaixo dos usuários

#### 4. Editar `src/pages/Settings.tsx`
- Remover a aba "Integrações" e o import de `IntegrationsSettings`
- Integrações ficam exclusivamente no painel Super Admin

### Arquivos
| Ação | Arquivo |
|------|---------|
| Nova migration | `supabase/migrations/...super_admin_integrations.sql` |
| Criar | `src/components/admin/AdminOrgIntegrations.tsx` |
| Editar | `src/pages/admin/AdminOrganizationDetail.tsx` |
| Editar | `src/pages/Settings.tsx` |


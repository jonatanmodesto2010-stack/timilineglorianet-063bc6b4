

## Plano: Alinhar Integrações com o layout do GitHub

### Diferenças identificadas entre o GitHub (`IXCIntegration.tsx`) e o nosso (`AdminOrgIntegrations.tsx`)

A estrutura do GitHub é focada **apenas em IXC** e tem um layout mais limpo com 3 Cards separados. O nosso já suporta múltiplos sistemas mas tem diferenças visuais e funcionais:

| Aspecto | GitHub (referência) | Nosso (atual) |
|---------|---------------------|---------------|
| **Layout** | 3 Cards separados: Config, Sincronização, Histórico | Tudo num único Card + tabela de histórico |
| **Botões de sync** | 3 botões separados: Clientes, Boletos, Tudo + botão Parar dedicado | Apenas "Sincronizar Tudo" e "Sincronizar Boletos" |
| **Botão Diagnóstico Bloqueados** | Presente na imagem | Não existe no nosso |
| **Ícones nos botões** | Users, FileText, RefreshCw, StopCircle (ícones específicos por tipo) | Todos usam RefreshCw |
| **Visibilidade do token** | Botão olho/eye para mostrar/ocultar | Apenas `type="password"` fixo |
| **Textos auxiliares** | Descrições em cada campo (ex: "Apenas o domínio base...") | Sem textos de ajuda |
| **CardDescription** | Descrições nos headers dos Cards | Sem descrições |
| **Badges no histórico** | Badges coloridos com ícones (Sucesso verde, Erro vermelho, Cancelado laranja) | Similar mas pode melhorar |
| **Botão refresh no histórico** | Botão ghost com ícone refresh no header do Card | Não tem |

### Alterações

#### 1. Editar `src/components/admin/AdminOrgIntegrations.tsx`
- **Separar em 3 Cards**: Configuração, Sincronização, Histórico (como no GitHub)
- **Adicionar botão mostrar/ocultar token** (Eye/EyeOff)
- **Adicionar textos auxiliares** nos campos (domínio base, onde encontrar token)
- **Adicionar CardDescription** nos headers
- **Botão "Sincronizar Clientes"** separado com ícone `Users`
- **Botão "Sincronizar Boletos"** com ícone `FileText`
- **Botão "Sincronizar Tudo"** com ícone `RefreshCw`
- **Botão "Parar Sincronização"** dedicado (vermelho, com `StopCircle`)
- **Botão refresh** no header do histórico
- **Manter** suporte a múltiplos sistemas (seletor IXC/SGP/MK/Radius)
- **Manter** a funcionalidade no painel Super Admin (não volta para Settings)

#### 2. Editar `src/pages/Settings.tsx`
- **Restaurar a aba "Integrações"** com o componente `IntegrationsSettings` original para que owners/admins da organização possam **visualizar** suas configurações (como na imagem do usuário mostra a aba Integrações nas configurações normais)

### Arquivos
| Ação | Arquivo |
|------|---------|
| Editar | `src/components/admin/AdminOrgIntegrations.tsx` |
| Editar | `src/pages/Settings.tsx` |


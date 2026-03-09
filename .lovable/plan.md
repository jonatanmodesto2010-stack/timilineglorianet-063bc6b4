

# Diagnóstico: Nenhum cliente aparecendo

## Problema Identificado

O filtro de status está configurado como **"Bloqueados"**, mas **não existem clientes bloqueados** na sua organização.

### Dados do Banco:
| Status | is_active | Quantidade |
|--------|-----------|------------|
| active | true | **867** |
| archived | false | **766** |
| **blocked** | - | **0** |

### Logs de Sincronização (mais recente):
```
Classification: 867 active, 0 blocked (endpoint: 0, contract: 0, client_field: 0), 766 archived
```

A sincronização IXC **não detectou nenhum cliente bloqueado** em nenhuma das três fontes:
- Endpoint `cliente_bloqueado`: 0
- Campo nos contratos: 0  
- Campo `bloqueado` no cliente: 0

---

## Soluções

### Solução Imediata
Altere o filtro de **"Bloqueados"** para **"Todos"** ou **"Ativos"** para visualizar os 1.633 clientes.

### Investigação da Sincronização
Os clientes bloqueados no IXC podem não estar sendo detectados por uma das razões:
1. O usuário da API não tem permissão no endpoint `cliente_bloqueado`
2. Os clientes têm o acesso bloqueado mas o campo `bloqueado` não está marcado como "S"
3. Não existem clientes com bloqueio ativo no IXC

### Para Investigar a API do IXC
Posso adicionar uma funcionalidade de diagnóstico que consulta diretamente os campos de bloqueio da API do IXC para verificar quais clientes estão realmente bloqueados e por quê não estão sendo sincronizados.

---

## Resumo Técnico

O código de sincronização define um cliente como "bloqueado" se qualquer uma dessas condições for verdadeira:
- `blockedIds.has(clientId)` - Presente no endpoint cliente_bloqueado
- `contract.blocked === true` - Contrato com status BA/BM  
- `client.bloqueado === 'S'` - Campo bloqueado no cliente

A API está retornando 0 para todas essas verificações, indicando que o IXC não tem registros de bloqueio ou a API não está retornando esses dados.


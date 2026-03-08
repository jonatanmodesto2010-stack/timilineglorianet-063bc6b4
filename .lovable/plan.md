

## Adicionar filtro de filial na página de Clientes

### O que será feito
Adicionar um seletor de filial (dropdown) na página de Clientes, ao lado do título "Clientes", usando o mesmo padrão já implementado no Dashboard. Ao selecionar uma filial, a listagem mostrará apenas os clientes daquela filial.

### Alterações

**Arquivo:** `src/pages/Clients.tsx`

1. **Importar** `Building2` do lucide-react e `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` dos componentes UI
2. **Novo estado:** `filialFilter` (string, default `'all'`)
3. **Novo useMemo `filiais`:** extrair filiais únicas de `allTimelines` (mesmo padrão do Dashboard)
4. **Modificar `filteredClients`:** aplicar filtro de filial antes dos filtros de busca/status existentes
5. **Resetar página** ao mudar filial (adicionar `filialFilter` ao useEffect que reseta `currentPage`)
6. **UI:** Adicionar o dropdown de filial ao lado do título "Clientes", exibido apenas quando há filiais disponíveis. Usar ícone `Building2` e texto "Todas filiais" como placeholder

### Posicionamento na UI
O seletor ficará na mesma linha do título "Clientes", alinhado à direita do título, similar ao screenshot de referência.


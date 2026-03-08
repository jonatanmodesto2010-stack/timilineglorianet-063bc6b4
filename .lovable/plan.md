

## Plano: Converter Boletos de Cards para Layout de Tabela

A seção "Boletos e Vencimentos" atualmente usa um **grid de cards** (3 colunas). O objetivo é converter para o **layout de tabela horizontal** mostrado na screenshot, com colunas inline editáveis.

### Mudanças no arquivo `src/components/ClientDashboardModal.tsx`

**Substituir** o bloco de grid de cards (linhas ~508-598) por uma tabela com:

| Coluna | Componente | Largura |
|--------|-----------|---------|
| Vencimento | `<Input type="date">` | ~150px |
| Valor (R$) | `<Input type="number">` | ~100px |
| Status | Indicador colorido + `<Select>` dropdown | ~150px |
| Dias Atraso | Badge calculado (ou "-" se pago/cancelado) | ~80px |
| Descrição | `<Input type="text">` | flex |
| Ação | Botão delete (ícone lixeira) | ~40px |

### Detalhes Técnicos

1. **Layout**: Usar componentes `Table, TableHeader, TableBody, TableRow, TableHead, TableCell` já existentes em `src/components/ui/table.tsx`

2. **Status com Select**: Trocar o div estático por um `<Select>` dropdown permitindo alternar entre: Pago, Pendente, Atrasado, Cancelado -- com o indicador colorido (bolinha) ao lado

3. **Dias Atraso**: Coluna calculada dinamicamente:
   - Se status é `pago` ou `cancelado` → mostrar "–"
   - Senão, calcular diferença em dias e mostrar como badge laranja (ex: `19d`)

4. **Botão delete**: Ícone `Trash2` laranja/vermelho no final de cada linha

5. **Container**: Envolver tabela em `max-h-96 overflow-y-auto` para scroll em listas grandes

6. **Seção Total Pendente**: Manter como está (já está correto na screenshot)


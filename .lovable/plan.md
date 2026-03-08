

## Corrigir cor do badge de dias para combinar com a cor do card

O badge circular com os dias de atraso (ex: "56d") está sempre verde, mesmo quando o card é vermelho (bloqueado) ou amarelo (vencido). A correção fará o badge seguir a cor do card.

### Alteração

**Arquivo:** `src/pages/Clients.tsx` (linhas 357-361)

Substituir a cor fixa `bg-green-500` do badge de dias por uma cor dinâmica baseada no status do cliente:

- **Bloqueado (card vermelho):** badge `bg-red-500`
- **Vencido (card amarelo):** badge `bg-yellow-500 text-black`
- **Ativo (card padrão):** badge `bg-green-500`

Criar uma função auxiliar simples para retornar a classe correta do badge baseada no `info`, e aplicar no elemento do badge de dias.


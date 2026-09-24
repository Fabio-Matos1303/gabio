# ADR-006: Gateway financeiro, confirmação e ledger

- Status: aceito
- Data: 2026-09-24

## Contexto

O M3 manipula dados financeiros compartilhados e privados. Reenvios, concorrência, adulteração entre revisão e execução e alterações destrutivas poderiam causar duplicidade, vazamento ou perda de histórico.

## Decisão

Toda mutação financeira passa por um gateway autenticado no PostgreSQL. Clientes mantêm somente leitura sujeita à RLS e não recebem permissões diretas de escrita nas tabelas financeiras. As funções do gateway usam `SECURITY DEFINER`, `search_path` fixo e derivam ator e residência de `auth.uid()`.

Valores monetários são inteiros em centavos (`bigint`) e a moeda do M3 é BRL. A visibilidade pertence à conta e é herdada por lançamentos, orçamentos, recorrências e parcelas. Uma conta privada pertence ao ator e nenhum agregado ou exportação pode revelar seus dados ao outro membro.

## Confirmação vinculada

A preparação valida um comando estrito e grava uma proposta interna com JSON canônico, hash SHA-256, ator, residência e expiração curta. O cliente recebe somente o identificador, hash e resumo necessário para decisão humana.

A confirmação recebe o identificador da proposta, seu hash e um `commandId`. O servidor bloqueia a proposta, verifica ator, residência, validade e uso único, recalcula o hash e executa exatamente o comando armazenado. Proposta, recibo, ledger e auditoria são consumidos ou gravados na mesma transação. Repetir o mesmo `commandId` e conteúdo devolve o recibo; reutilizá-lo para outro conteúdo é rejeitado.

Propostas e recibos não têm leitura ou escrita direta por clientes.

## Ledger e correções

Lançamentos são append-only. Não há comando para editar ou excluir seus campos econômicos. Uma correção cria um ajuste ou estorno vinculado; o original permanece no histórico. Um estorno usa a mesma conta, moeda e valor com direção oposta, exige motivo e só pode ocorrer uma vez. Um estorno não pode ser estornado.

Parcelas distribuem centavos deterministicamente, preservam a soma exata e têm sequência única. Recorrências não alteram ocorrências passadas e protegem cada ocorrência contra duplicação. Orçamentos são comparados ao ledger visível no período, considerando estornos na data em que ocorrerem.

## Exportação e restauração

Exportações JSON e CSV contêm somente dados visíveis ao solicitante. JSON inclui versão de schema e valores monetários serializados sem perda. CSV neutraliza células interpretáveis como fórmulas.

Restauração operacional ocorre apenas em banco local ou ambiente isolado, com schema validado, transação única e RLS ativa. Restauração em ambiente compartilhado ou produção exige aprovação humana.

## Consequências

- Operações financeiras exigem conexão e confirmação explícita; não são executadas silenciosamente pela fila offline.
- Dados financeiros privados não são enviados a provedores externos de IA.
- A complexidade adicional de proposta e recibo é aceita para garantir intenção, idempotência e auditabilidade.
- O PostgreSQL permanece como única fonte de verdade.

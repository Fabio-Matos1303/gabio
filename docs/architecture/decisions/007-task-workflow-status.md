# ADR-007: Estado de tarefa em andamento

- Status: aceito
- Data: 2026-09-27

## Contexto

O quadro de tarefas precisa distinguir itens ainda não iniciados daqueles que já estão sendo executados. O fluxo anterior expunha apenas tarefas abertas, concluídas e canceladas, o que não representava visualmente o andamento da rotina.

## Decisão

O estado `in_progress` passa a integrar o contrato e o tipo `task_status`. O fluxo principal da PWA apresenta três colunas: `open` (A fazer), `in_progress` (Em andamento) e `completed` (Concluídas).

Os comandos permanecem no Command Gateway, com concorrência otimista, idempotência e auditoria. Tarefas abertas e em andamento podem ser editadas e podem transitar entre si ou para concluídas. A conclusão continua sendo o único estado que gera a próxima ocorrência recorrente.

O estado `cancelled` permanece aceito para compatibilidade com registros e clientes anteriores, mas deixa de fazer parte do fluxo principal e não recebe uma coluna no quadro. Registros existentes não são convertidos automaticamente para outro significado.

## Consequências

- A alteração do enum e a atualização da função do gateway são migrations incrementais separadas.
- Clientes devem aceitar `cancelled` ao validar dados legados, mesmo sem oferecer nova ação de cancelamento.
- Uma futura experiência de arquivamento e consulta de itens cancelados exigirá decisão própria.

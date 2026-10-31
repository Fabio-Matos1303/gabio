# ADR-013: Recorrência personalizada de tarefas

- Status: aceito.
- Data: 2026-10-31.

## Contexto

O usuário solicitou criação em modal, intervalos personalizados e dias específicos da semana. O enum legado oferece apenas nenhuma repetição, diária, semanal e mensal. A evolução precisa preservar idempotência, privacidade e conclusão de cada ocorrência pelo gateway.

## Decisão

Acrescentar `custom` ao enum e uma coluna opcional `recurrence_rule` em `tasks`, com representação `recurrenceRule` no contrato. Regras são objetos estritos com cinco campos:

- `frequency`: `daily`, `weekly`, `monthly` ou `yearly`;
- `interval`: inteiro de 1 a 365;
- `weekdays`: dias distintos de 0 (domingo) a 6 (sábado), apenas para frequência semanal; vazio usa o dia da primeira ocorrência;
- `until`: data civil final inclusiva ou `null`;
- `timeZone`: `America/Bahia`, preservando o horário local UTC-03 vigente no produto.

O primeiro prazo precisa corresponder aos dias escolhidos e não pode ultrapassar a data final. Recorrência padrão não aceita regra personalizada. Schema TypeScript e constraint do banco validam a regra; RLS e permissões das tabelas permanecem intactas.

O gateway continua gerando apenas uma próxima ocorrência na conclusão, ligada por `previous_occurrence_id`. A regra é copiada e o replay retorna o recibo existente. Não há geração antecipada, cron, edição de série ou novo serviço externo.

Semanas começam na segunda-feira. Para várias seleções, a próxima ocorrência percorre os dias da semana atual; ao terminar a semana, avança o intervalo de semanas indicado. Assim, a cada duas semanas às segundas e quartas produz segunda, quarta e a segunda da próxima semana elegível.

Meses e anos preservam o horário local e limitam o dia ao último dia do mês de destino. O cálculo continua partindo do prazo da ocorrência concluída, inclusive após esse ajuste, como no comportamento mensal legado. Uma data final alcançada encerra a repetição sem bloquear a conclusão.

## Interface e publicação

O título rápido pode preencher o modal. Adicionar tarefa abre o modal; Criar tarefa valida e envia. Fechar preserva o rascunho; sucesso ou pendência já persistida limpa os campos, evitando um segundo comando para a mesma criação. Falhas de validação permanecem no modal.

Frequências prontas incluem quinzenal (duas semanas), trimestral, semestral e anual. A personalização oferece frequência, intervalo, dias da semana e data final. As opções de edição usam o mesmo componente.

Aplicar primeiro as duas migrations incrementais, com commit do enum antes do uso. Não executar `db push` indiscriminadamente, pois há migrations locais de outras entregas e histórico remoto previamente conciliado de forma manual. Publicar o cliente somente depois de verificar o novo schema e gateway.

Os formatos legados e os recibos existentes continuam aceitos pelo cliente novo. A resposta de tarefas padrão mantém o formato antigo; a regra só é adicionada à resposta de tarefas personalizadas. Clientes antigos não entendem o enum `custom` e precisam atualizar/reabrir a PWA antes de usar tarefas personalizadas. Não reverter o frontend para um cliente sem esse contrato após criar regras personalizadas.

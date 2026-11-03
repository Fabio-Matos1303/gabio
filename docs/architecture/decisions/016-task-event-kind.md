# ADR-016: Classificação de tarefas e eventos

- Data: 2026-11-03.
- Status: implementação solicitada pelo usuário; publicação pendente de aprovação.

## Decisão

Adicionar o tipo `task` ou `event` ao registro atual, sem duplicar o item em `calendar_events`. Itens legados e comandos sem tipo continuam tarefas. A criação e a edição oferecem “Tarefa” e “Evento”. Eventos usam o horário de `dueAt` como início e possuem `eventEndsAt` obrigatório, posterior ao início. Tarefas mantêm o significado de prazo e não possuem fim de evento.

Eventos são exportados ao Google Agenda como intervalos ocupados, sem duração inventada. Tarefas seguem o destino pessoal em Ajustes. Assim, escolher o tipo tem significado funcional e não expõe identificadores ou escolha de conta Google no formulário.

A alteração explícita do tipo pode mover a projeção entre provedores. Conservar vínculos anteriores para limpeza, identificar cada vínculo também pelo provedor e exigir remoção confirmada das cópias anteriores antes de publicar a nova projeção. Preferências alteradas em Ajustes continuam afetando somente tarefas futuras; não modificar o destino por uma edição que preserve o tipo.

Recorrência continua no Gabio. Próximas ocorrências copiam o tipo e, para eventos, preservam a duração. Validação ocorre no contrato, gateway e constraints de banco. Comandos antigos de edição preservam o tipo existente e não podem deixar um evento com intervalo inválido. A criação offline registra os campos na fila existente.

Preservar RLS, propriedade, idempotência, recibos, versões e auditoria. A conversão nunca concede exportação privada nem acesso a dados de outra conta. Nenhuma nova permissão Google ou serviço é necessário além da entrega Tasks já preparada.

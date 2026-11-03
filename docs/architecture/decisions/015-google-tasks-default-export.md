# ADR-015: Google Tarefas como destino padrão

- Data: 2026-11-03.
- Status: implementação autorizada pelo usuário; publicação e ampliação OAuth pendentes de aprovação humana.

## Decisão

Novas tarefas elegíveis recebem uma intenção de exportação por conexão na transação de criação. O padrão é `google_tasks`; somente Ajustes permite escolher `google_calendar` para tarefas posteriores. Vínculos anteriores permanecem em Agenda. Não há migração histórica automática nem escolha de destino nos comandos de tarefa.

Reutilizar credenciais cifradas, leases e outbox existentes. Manter o identificador interno dos vínculos e registrar separadamente a identidade opaca retornada por Tasks. Listas Tasks possuem armazenamento próprio. Toda mutação externa revalida autorização vigente; falta de escopo deixa o trabalho pendente, sem fallback para Agenda.

Inserções sem confirmação ficam bloqueadas para novo POST. Reconciliação utiliza marcador opaco nas notas dentro de lista já gerenciada; ausência ou ambiguidade exige revisão em Ajustes. Nunca adotar lista pelo nome. Reautorizações verificam todos os destinos conhecidos antes de substituir credenciais; falhas preservam a conexão anterior.

O Supabase continua autoridade. Tasks recebe título, dia civil no fuso America/Bahia, estado e notas mínimas com link/marcador. Horário, atribuição, tags e recorrência continuam no Gabio. O fluxo OAuth só solicita escrita em Tasks mediante consentimento explícito e preserva os escopos já concedidos. Leitura externa suprime cópias por identidade persistida.

Novos contratos usam ações versionadas, preservando o status legado de schema estrito. Configurações usam versão esperada e recibo idempotente. Novas tabelas possuem RLS e acesso interno restrito.

## Consequências

Integrações existentes precisam autorizar escrita em Tasks para enviar novas tarefas; eventos anteriores continuam sincronizando. A API Tasks não permite horário de agendamento e seu escopo de escrita abrange todas as tarefas da conta, apesar da restrição interna a vínculos gerenciados. Rollback operacional pausa Tasks sem redirecionar intenções. Não habilitar custos, escopos ou publicar antes da aprovação aplicável.

Plano e critérios: [Google Tarefas](../../product/google-tasks-export-plan.md).

## Complemento: tipo de item

O pedido posterior de permitir Tarefa/Evento na criação e edição é tratado pelo [ADR-016](016-task-event-kind.md). O seletor define o tipo funcional: eventos usam Agenda, enquanto tarefas seguem a preferência em Ajustes. Conversão explícita pode mudar o provedor com limpeza da cópia anterior; edições que preservam o tipo não mudam o destino.

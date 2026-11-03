# Tipo Tarefa ou Evento nos formulários

Data: 2026-11-03.
Versão candidata conjunta: `google-tasks-kinds-2026.11.03.1`.
Status: publicação autorizada em 2026-11-03; migrations e funções publicadas, cliente em publicação. Consentimento individual continua necessário.

## Comportamento

Criação e edição oferecem “Tipo do item”, com Tarefa como padrão. Tarefas usam prazo opcional; eventos exigem início e fim posterior ao início, interpretados no fuso America/Bahia. Dados antigos sem tipo continuam tarefas. A seleção permanece no rascunho e na fila offline existente.

Eventos usam Google Agenda com o intervalo informado e estado ocupado. Tarefas seguem a preferência pessoal de exportação em Ajustes. Alterar o tipo é uma conversão explícita e pode trocar o provedor; o servidor conserva a identidade anterior para removê-la antes de criar a nova cópia. Falha de limpeza deixa a conversão pendente, sem duplicar o item. A conversão não muda privacidade nem concede categorias de exportação.

Mudar de Evento para Tarefa limpa o fim do evento e conserva o início como prazo. Novas ocorrências recorrentes preservam o tipo e a duração de eventos; não são criadas séries nativas no Google. Eventos continuam no fluxo de gestão do Gabio, sem detector novo de conflitos ou agendamento automático.

## Banco e compatibilidade

A migration incremental `202611030003_task_event_kind.sql` depende da migration Tasks `202611030002`. Ela adiciona `kind` e `event_ends_at`, exige intervalo finito para eventos e amplia a unicidade dos vínculos para incluir provedor. Intenções conhecidas são atualizadas na conversão mesmo quando a categoria está pausada; não se cria exportação privada não autorizada.

Comandos antigos sem `kind` preservam o tipo ao editar. A leitura nova usa `list_tasks_page_v2`, SECURITY INVOKER com RLS e execução autenticada. A listagem anterior continua com seu formato e mostra somente tarefas, protegendo clientes PWA antigos com schemas estritos. Esses clientes precisam atualizar o aplicativo para ver eventos. Não prometer compatibilidade visual completa de eventos com versões antigas.

Publicar migration e worker/provider antes do frontend. Não alterar migrations anteriores. Na composição isolada, incluir esta entrega no manifesto `scripts/google-tasks-release-files.json` e usar a versão conjunta acima. Resolver a base de produção conforme o registro da entrega Google; conservar alterações locais de outras entregas. O arquivo local de versão pública não foi sobrescrito.

## Validação

- Banco isolado com todas as migrations e dados sintéticos: testes de intervalo obrigatório/finito, recorrência com duração preservada, replay e versões existentes, conversão com categoria pausada, limpeza entre provedores e RLS de eventos privados.
- Contratos: validação de tipo e intervalo, rejeição de fim anterior/igual ao início e de campos de evento numa tarefa, preservação de updates antigos sem tipo.
- Frontend: testes ponta a ponta do formulário com gateway fictício para criar evento e converter tarefa, incluindo fuso e comando versionado. Tipos, lint dos arquivos alterados e build PWA verificados em cópia isolada Linux.
- Adaptador Calendar: evento ocupado com fim exato e rejeição de intervalo inválido; tarefas continuam eventos transparentes de prazo quando exportadas para Agenda.
- Revisor de segurança independente aprovou o delta após corrigir conversão durante pausa, timestamps infinitos e compatibilidade da listagem. Executou 47 testes Calendar/Tasks e quatro asserções específicas de projeção de evento. Não executou SQL nem ações em produção.
- Totais finais: 359 checks pgTAP (22 específicos desta entrega), 57 testes Google, 28 testes de contratos e 101 testes web aprovados. Tipos, lint dos arquivos frontend/contratos alterados, build PWA e verificação de whitespace passaram. O build mantém o aviso de bundle maior que 500 kB (677,86 kB antes de gzip), sem falha. Funções Edge foram verificadas por tipos estritos e testes; não foi declarado lint Edge.
- Criação e edição com Evento verificadas em Chromium nos quatro viewports: 360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080. Ambos os diálogos ficaram contidos na largura, sem overflow horizontal, com seletor de 48 px e início/fim obrigatórios. Preservados materiais, campos, ações fixas e rolagem do diálogo existente. A explicação do tipo usa texto de cor padrão para legibilidade.
- Evidências sintéticas: `test-results/task-kind-layout.json` e capturas `task-kind-create-*.png` / `task-kind-edit-*.png`. Não foram feitos nova auditoria numérica de contraste, leitor de tela, zoom de texto, Safari/iOS ou aparelho físico. Não houve novo consentimento OAuth, teste com conta real, aplicação de migration ou publicação em produção.

Referências: [ADR-016](../architecture/decisions/016-task-event-kind.md) e [exportação Google Tarefas](google-tasks-export.md).

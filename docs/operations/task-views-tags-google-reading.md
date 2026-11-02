# Calendário, filtros, tags e leitura Google

- Versão candidata: `task-views-tags-google-read-2026.11.02.1`.
- Status: publicação, migrations e escopos aprovados pelo usuário em 2026-11-02. Migrations aplicadas e verificadas; servidor google-calendar versão 4 ACTIVE. Publicação do cliente em andamento; configuração Google Cloud depende de sessão administrativa.
- Decisão: [ADR-014](../architecture/decisions/014-task-views-tags-google-reading.md).

## Comportamento

Em Tarefas, alternar Kanban/Calendário sem perder busca, filtros e ordenação. O calendário mostra as seis semanas da grade, lista completa do dia e seção Sem data ou prazo. Eventos do Google Agenda aparecem apenas no calendário. Google Tasks aparece também no quadro, em A fazer/Concluídas, somente para consulta. O dia programado do Google Tasks não recebe horário artificial nem o indicador de prazo atrasado do Gabio.

Busca por título sem distinguir acentos/caixa; filtros de status, período, responsável, visibilidade, recorrência, origem, listas/calendários e tags. Responsável/recorrência/atraso indicam explicitamente seu alcance Gabio. Presets Hoje, Atrasadas, Próximos 7 dias, Sem prazo e Sem responsável. Ordenar por criação, prazo nos dois sentidos, atualização e título; sem prazo ao final e desempate estável. O mês restringe a grade, não o kanban.

Tags: múltiplas por tarefa, sugestões por escopo, renomeação e exclusão do catálogo com confirmação; tarefas recorrentes copiam vínculos na transação de conclusão. Tags compartilhadas são da casa; privadas permanecem do proprietário. Ao mudar visibilidade, remover os vínculos explicitamente e salvar antes de escolher tags do novo escopo. Filtros Qualquer uma/Todas/Sem tags. Tarefas antigas e comandos antigos sem tags continuam aceitos; respostas de comandos legados mantêm seu formato.

Google Tasks permite tags locais privadas, sem escrita Google. Anotações externas usam último salvamento confirmado como estado atual, com recibos idempotentes; não há mesclagem entre dispositivos. Reconectar/desconectar rotaciona a geração e remove essas anotações, conforme aviso no fluxo de conexão. Nenhum conteúdo externo é persistido em localStorage/IndexedDB. Dados Gabio continuam sujeitos ao snapshot existente por usuário/residência.

## Limites e continuidade da leitura

Leitura externa por ação do usuário e mudança de mês, sem polling automático. Cada lote tem limite de 18 requisições por origem e prazo total de 24 segundos para a coleta; chamadas individuais usam até 6 segundos dentro desse prazo. Retorna estados independentes de sucesso, parcialidade ou erro. Uma consulta indisponível não é apresentada como ausência de tarefas.

Cada usuário pode iniciar um lote a cada 60 segundos, até 120 lotes/dia. A continuação cifrada é vinculada ao ator, geração e mês, expira em 30 minutos e permite carregar páginas seguintes por Carregar mais itens Google. A interface acumula resultados sem duplicação por identidade. Se atingir o limite, aguardar antes de continuar; cursor expirado requer nova atualização. Não prometer leitura instantânea de históricos muito grandes. Google Tasks inclui concluídas, ocultas e atribuídas disponíveis pela API; excluídas não são exibidas. Eventos são consultados no intervalo completo da grade visível, com recorrências expandidas pela API.

Somente os vínculos persistidos de conexão/calendário/evento suprimem as cópias exportadas pelo Gabio. Nomes, datas e propriedades arbitrárias não são usados para deduplicar. Tokens permanecem cifrados no servidor; a conexão e sua geração são revalidadas após a coleta.

## Publicação após aprovação humana

Não usar `db push` indiscriminadamente: o histórico local contém migrations de entregas anteriores conciliadas manualmente. Conferir por metadados que ADR-011 e ADR-013 já estão aplicados, sem consultar tarefas ou dados pessoais.

1. Revisar exclusivamente `202611020001_task_tags.sql` e `202611020002_google_reading.sql`, inclusive seus grants SELECT/RPCs autenticadas e RPCs internas service-only. Aplicar em transações separadas, registrar versões e recarregar schema do PostgREST.
2. Publicar a função `google-calendar` com os módulos compartilhados novos. Manter `GOOGLE_READING_ENABLED=false` enquanto os novos escopos não estiverem aprovados e configurados.
3. Publicar o cliente com a versão candidata, preservando as configurações de backend do ambiente. A exportação existente continua disponível sem leitura; o novo frontend requer as migrations de tags antes de ser publicado.
4. Após aprovação, habilitar Google Tasks API e incluir no consentimento OAuth `tasks.readonly`, `calendar.events.readonly` e `calendar.calendarlist.readonly`, preservando `calendar.app.created` para exportação. Não criar novo custo nem habilitar cobrança automática.
5. Ativar `GOOGLE_READING_ENABLED=true` no servidor. Cada pessoa marca a leitura em Ajustes e conclui seu próprio consentimento. Não autorizar conta real durante desenvolvimento/testes automatizados. Verificar exigências vigentes de consentimento/verificação no Google Cloud antes da ativação.
6. Confirmar versão e disponibilidade em `https://gabio.fabiosmo123.workers.dev/version.json`, HTML e assets. A entrega permanece pendente até essa verificação e a homologação humana da integração real.

Se a leitura falhar, desativar a flag sem afetar as tarefas Gabio. Não reverter o cliente para um que ignore tags após usuários começarem a gerenciá-las. Preservar as migrations incrementais e corrigir problemas por nova migration.

## Evidências e pendências

- Banco isolado criado a partir de schema local sem copiar linhas de usuários: 199 checks pgTAP passaram (39 novos de tags/leitura e 160 de regressão), incluindo RLS, privilégios, recorrência, replay, rotatividade e expurgo da geração externa. A base operacional local e produção não receberam as migrations nesta validação.
- Revisão de segurança por agente distinto: corrigidos privilégios padrão das tabelas e fechamento do editor externo após troca de geração; revisão posterior sem bloqueadores identificados. O revisor executou independentemente os 9 testes do adaptador Google.
- Interface inspecionada em Chromium com dados fictícios, nos viewports 360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080. Grade com 42 dias e sem overflow horizontal; largura mínima dos dias no mobile compacto: 44,45 px; altura mínima: 68 px. Verificados busca preservada entre visões, seção sem data e criação sintética com múltiplas tags.
- Suíte web completa: 78 testes aprovados; contratos/domínio/roteador: 55; integração Google: 43. Lint dos arquivos alterados, tipos do frontend e módulos compartilhados da função, e build de produção aprovados. O build mantém aviso de bundle maior que 500 kB (cerca de 655 kB antes de gzip), sem falha. A primeira execução web na montagem Windows/WSL teve timeout de inicialização de um worker; a repetição completa em cópia isolada no filesystem Linux, sem arquivos de ambiente, passou.
- Contraste medido nos novos controles e tags sobre o fundo composto: mínimo de 10,59:1 para texto e 3,36:1 para bordas essenciais. A medição não substitui uma auditoria de todo o aplicativo.
- Pendentes de homologação: conta Google real, produção, aparelho físico, Safari/iOS, leitor de tela, contraste composto completo, texto ampliado e fallback sem blur.

## Fontes

- [Google Tasks: listagem e paginação](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list).
- [Google Agenda: calendários](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list).
- [Google Agenda: eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).
- [Escopos](https://developers.google.com/workspace/calendar/api/auth).

## Validação da versão isolada para produção

A release foi montada sobre a main dc5c990e5836e787115b9e2ad816a5adcc459895, copiando somente os arquivos do manifesto. A tela de Ajustes preserva a base publicada e recebe apenas o consentimento de leitura, sem incluir o redesenho local de outra entrega. Nessa composição passaram lint completo, tipos, 76 testes web, 55 de pacotes, 43 de integração Google e build/PWA. As duas migrations de 2026-11-02 estão registradas com o SQL exato; RLS e restrições de privilégios foram verificadas remotamente sem ler dados pessoais. O servidor google-calendar versão 4 está ACTIVE e rejeita acesso anônimo com HTTP 401.

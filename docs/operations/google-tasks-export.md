# Exportação padrão para Google Tarefas

Data: 2026-11-03.
Versão candidata: `google-tasks-default-2026.11.03.1`.
Status: publicação autorizada pelo usuário em 2026-11-03; migrations e funções publicadas, cliente em publicação. Consentimento individual permanece necessário.

## Comportamento implementado

Após ativação no servidor, novas tarefas elegíveis usam Google Tarefas por padrão, inclusive sem prazo. Cada conexão pessoal pode escolher Google Agenda somente em Ajustes > Integrações > Google. A preferência é salva explicitamente, com versão esperada e recibo idempotente. Alterações valem para novas tarefas; intenções anteriores mantêm o provedor original. Uma ocorrência recorrente nova segue a preferência vigente na criação.

A intenção é registrada na transação de criação no banco, por conexão e categoria autorizada. Não é possível escolher o destino por comando de tarefa, PWA ou Telegram. Sem conexão, não há exportação nem importação histórica automática depois. Conexões que aguardam reconexão conservam novas intenções. Sem escopo de escrita, o trabalho Tasks permanece pendente e não é enviado para Agenda.

Tasks recebe título, estado, dia civil em America/Bahia quando houver e notas mínimas com link e marcador opaco. A API não recebe horário, tags, atribuição ou recorrência nativa. Ao concluir/abrir novamente, o Gabio atualiza a mesma identidade externa; cancelamento/exclusão remove a cópia. Uma tarefa concluída antes do primeiro envio não gera histórico retroativo. Agenda mantém sua representação de prazo como evento livre de 15 minutos.

A escrita em Tasks exige consentimento explícito para `https://www.googleapis.com/auth/tasks`. A UI informa que esse escopo permite alterar todas as tarefas da conta, enquanto o Gabio limita suas operações às projeções gerenciadas. A autorização preserva configurações salvas, inclui escopos previamente concedidos e verifica acesso aos destinos existentes antes de substituir credenciais. Negar ou falhar não substitui a conexão anterior.

Inserções têm tentativa persistida antes do POST. Resultado desconhecido nunca gera repetição cega. A reconciliação procura um marcador exato em até quatro páginas da lista gerenciada; ausência ou ambiguidade continua bloqueada. Em Ajustes, Sincronizar solicita nova verificação. Recuperar listas exige confirmação explícita e só descarta metadados de listas ainda sem ID confirmado; listas vazias anteriores poderão permanecer no Google. Nenhum ID arbitrário é aceito para adotar uma lista ou tarefa.

Leitura suprime cópias por provedor/lista/ID persistidos. Ao observar confirmação de sincronização ou reconexão em Ajustes, a interface invalida a consulta antiga e descarta respostas em voo. A atualização externa seguinte é manual, respeitando o limite existente. Não há polling nem sincronização Google -> Gabio.

## Validação

- Migration `202611030002_google_tasks_export.sql` aplicada com todas as migrations anteriores em banco novo de QA, copiando somente schema de autenticação e usando identidades sintéticas. Nenhuma linha pessoal foi copiada. A base operacional e produção não foram alteradas.
- 337 checks pgTAP aprovados, incluindo 28 específicos de Tasks: default, privacidade, preferência posterior, replay, versão concorrente, pausa, escopo, reconexão, exclusão concorrente e isolamento do worker legado. Mantidas as regressões de tarefas, finanças, recorrência, tags, convites e leitura.
- 56 testes Google aprovados, incluindo 11 específicos de Tasks: projeção de data civil, timeout, resposta inválida, quota, reconciliação limitada, persistência de identidade e troca de conta.
- Suíte web completa: 99 testes aprovados, além de tipos de cliente e módulos compartilhados, lint do frontend alterado e build PWA em cópia isolada Linux. O build mantém o aviso de bundle maior que 500 kB (675,21 kB antes de gzip), sem falha. O ESLint do repositório ignora funções Edge; elas foram verificadas por tipos estritos e testes, sem declarar lint Edge executado.
- Revisão de segurança por agente distinto: corrigidos isolamento do worker antigo, escopo revalidado no job, tombstone em exclusão concorrente, preservação das preferências atuais no OAuth e bloqueio de upserts até limpeza pendente. Revisor executou independentemente os 11 testes Tasks finais e revisou também a invalidação da leitura e a recuperação de listas, sem bloqueadores após correções.
- Prévia de Ajustes com gateway fictício e requisições externas bloqueadas, nos viewports 360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080. Sem overflow horizontal; seletor com 44 px de altura. Diálogo no mobile contido entre x=19 e x=341, consentimento explícito e botão desabilitado antes da seleção. Escape fecha o diálogo e o foco do seletor foi verificado. Conferidos fundo creme, superfície discreta e contraste visual; sem novo CSS ou mudança na ilha.
- Evidências locais em `test-results/tasks-export-layout.json`, capturas `tasks-export-360.png`, `tasks-export-768.png`, `tasks-export-1366.png`, `tasks-export-1920.png` e logs `*.tasks-qa.log`. O diretório de evidências é ignorado pelo Git.
- Fallback sem blur e preferências de movimento/transparência foram exercitados sem overflow. Não foram feitas nova medição numérica de contraste composto, auditoria com leitor de tela, validação de ampliação de texto, aparelho físico ou Safari/iOS. A prévia isola a seção de integração e não revalida a navegação inferior do app inteiro.

## Publicação após aprovação

O usuário autorizou a publicação em 2026-11-03, após revisão e validação local. As migrations 202611030002 e 202611030003 foram aplicadas em transações separadas, com fonte exata registrada e privilégios verificados. As funções google-calendar e google-calendar-worker foram publicadas. Nenhum novo custo ou cobrança automática foi habilitado.

1. Release isolada composta sobre o commit de produção `d42cabc7cd4ff2b6372b247e1d7308d62bfd8de6`. Os 173 blobs foram conferidos com a árvore GitHub antes da aplicação do manifesto. O arquivo local de versão pública foi preservado; a composição usa `google-tasks-kinds-2026.11.03.1`. O CSS de produção foi mantido, evitando incluir outras alterações visuais locais.
2. Conferir o histórico remoto e aplicar exclusivamente `202611030002_google_tasks_export.sql`, em transação, registrando o SQL exato e recarregando o schema PostgREST. Não usar `db push` indiscriminadamente. A migration deixa o novo roteamento desativado (`activated_at = null`), preservando Agenda durante o rollout.
3. Publicar `google-calendar` e `google-calendar-worker` com os módulos compartilhados do manifesto. Inicialmente manter `GOOGLE_TASKS_WRITE_ENABLED=false`. O worker legado só reivindica trabalhos Agenda; o novo worker recebe a flag explicitamente e não gasta tentativas Tasks enquanto pausado.
4. Publicar frontend compatível e confirmar ações `export_status` e `export_preferences` autenticadas, schemas e ausência de dados sensíveis. Requisições anônimas devem continuar HTTP 401. Confirmar versão, HTML, assets, manifesto e service worker em `https://gabio.fabiosmo123.workers.dev`.
5. Após aprovação do novo escopo, configurar o consentimento existente com `tasks`, preservando escopos anteriores e público atual. Conferir exigências vigentes do Google Cloud e cotas efetivas sem alterar cobrança. Habilitar `GOOGLE_TASKS_WRITE_ENABLED=true` no handler e no worker.
6. Ativar o marco no servidor com `update app_private.google_export_settings set activated_at=clock_timestamp() where singleton and activated_at is null;`. Essa ação muda o destino padrão de novas intenções de todas as conexões para Tasks. Conexões sem autorização passam a mostrar pendência; eventos anteriores continuam funcionando. Registrar o momento da ativação sem consultar conteúdo pessoal.
7. Cada pessoa acessa Ajustes e autoriza escrita em Google Tarefas na própria conta. Homologar o fluxo real com autorização individual, sem dados pessoais em testes/logs. Verificar criação, edição, conclusão, reabertura, tarefa sem prazo, fuso e ausência de cópias duplicadas.

Em incidente, definir `GOOGLE_TASKS_WRITE_ENABLED=false` no worker e handler. As intenções ficam pendentes; não redirecionar para Agenda, não apagar dados e não reverter migrations aplicadas. A preferência pode continuar sendo alterada em Ajustes. Revogação com limpeza real bloqueada deve continuar visível; abandono da limpeza exige a confirmação já existente.

A entrega só pode ser declarada concluída após versão e disponibilidade em produção verificadas e registro das pendências da homologação individual.

Decisão: [ADR-015](../architecture/decisions/015-google-tasks-default-export.md). Plano: [exportação Tasks](../product/google-tasks-export-plan.md).

# Prioridades e apresentação dos cartões

## Escopo em 2026-11-25

Prioridades baixa, média e alta em cartões locais, com edição em modal, indicação
por texto e cor no quadro e filtro Prioridade (Gabio). Criação e tarefas atuais
usam média; itens Google não recebem prioridade inferida. A próxima ocorrência
recorrente copia o nível anterior, além do conteúdo de checklist já existente.

O cartão aberto apresenta tags como etiquetas e metadados como ícone e valor,
sem caixas com rótulo e valor repetidos. A disposição segue o conteúdo no mobile
e no desktop; não há coluna de propriedades. Nomes completos dos controles
permanecem disponíveis para leitores de tela e por tooltip. Os valores abrem os
mesmos editores modais. Referência funcional consultada:
[Trello card back](https://support.atlassian.com/trello/docs/new-card-back/),
mantendo os componentes e cores do design system do Gabio.

Base remota `09f545f50767f6e3a271c4d70e523183cf413af1`. Branch
`codex/task-priorities` na worktree isolada `Gabio-card-modal-release`.
Workspace original preservado. Decisão arquitetural: ADR-019.

O leitor v4 preserva v3 e recibos antigos. A atualização de prioridade usa a fila
existente e RPC próprio, somente para essa propriedade. Valida schema, versão e
estado editável, autorização atual e recibos idempotentes com hash separado do
gateway legado. O achado sobre replay cruzado foi corrigido antes da publicação.

## Validação

- Banco descartável: 16 suítes SQL e 441 asserções aprovadas, incluindo 30 de
  prioridade. Cobrem RLS, usuário anônimo, residência externa, tarefa privada,
  enum inválido, conflito de versão, replay, isolamento do gateway legado,
  auditoria e recorrência.
- Reprodução: `node scripts/test-task-priority-db.cjs`. Usa somente container
  nomeado e descartável, sem conectar a bancos existentes. A imagem Postgres
  contém bootstrap Auth antigo; adiciona apenas a coluna de metadados exigida
  pelos fixtures. O CI remoto valida o stack Supabase completo.
- QA Chromium sintético aprovado em 360×800, 768×1024, 1366×768 e 1920×1080:
  editar e salvar prioridade, filtrar alta e excluir cartões de outros níveis,
  seis editores, ausência de overflow, teclado, foco e Escape. Axe WCAG A/AA sem
  violações. Contraste amostrado, fallback sem blur e texto ampliado de 200% no
  cartão compacto verificados. Capturas dos quatro modais inspecionadas.
- Evidências locais em `test-results/task-card-content`; reprodução com
  `scripts/qa-task-card.cjs` e módulos de QA temporários documentados nas entregas
  anteriores. Dados de usuário não foram usados em testes ou capturas.
- `pnpm verify` completo aprovado: formatação, lint, tipos, 207 testes da
  aplicação e pacotes, 59 testes Google e build PWA. O aviso de bundle acima de
  500 kB permanece. Após o ajuste final de nome acessível, a suíte completa foi
  executada novamente com todos os arquivos estabilizados.
- Revisão independente de SQL, contratos, fila, projeção, filtro e UI concluída
  sem achados abertos. Os achados sobre replay cruzado e correspondência do texto
  visível com o nome acessível de Adicionar tag foram corrigidos e testados.

## Publicação

Versão preparada: `task-card-natural-layout-2026.11.25.1`.
Migration aplicada, cliente publicado e metadados verificados.

Migration canônica: `20261125210842_task_priorities.sql`, com versão atribuída
pelo provedor ao aplicar o SQL já enviado no commit
`6176a63090df0a652ac527855c84d31fcffcdebf`. O nome de desenvolvimento foi
normalizado para a versão do histórico remoto; o conteúdo permanece idêntico,
SHA256 `9145cea0a0827b7c58885181f8baa0e82e407ebde46479249a4090a83bb3fd4b`.
Não foram alteradas migrations de entregas anteriores.

Verificação de metadados confirmou RLS, valor padrão, check de prioridade,
trigger ativo, leitor invoker e ausência de execução anônima nos novos RPCs.
Após a migration, os advisors mantiveram o baseline anterior e acrescentaram
somente o aviso esperado de RPC definer autenticado, protegido pelos controles
descritos acima. Nenhuma tarefa real foi criada, editada ou lida para verificação.
Não foi realizado fluxo autenticado com dados pessoais em produção.

Os advisors anteriores à mudança registraram avisos preexistentes de funções
definer, extensão pg_net em public e proteção de senha, além de tabelas internas
com RLS sem políticas por desenho. Esta entrega não modifica essas configurações.
O RPC de prioridade tem autorização explícita, search_path fixo e execução
revogada para anon; a exposição autenticada é intencional, conforme o padrão
do gateway. Referências de auditoria:
[funções definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
e [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Produção verificada

Implementação: `6176a63090df0a652ac527855c84d31fcffcdebf`.
Commit publicado na main: `446b2fd053a5be9b0ecadc53f5b1b0c52902ab10`, com
o nome canônico da migration. Ambos enviados ao GitHub antes da publicação;
main atualizada com comparação da base esperada e sem force.

URL: https://gabio.fabiosmo123.workers.dev.
`/version.json` confirmou `task-card-natural-layout-2026.11.25.1` e o escopo
`tasks-online-google-reading-card-content`.

HTML, versão, manifesto, service worker, registro PWA, JavaScript
`/assets/index-2xPuP078.js` e CSS `/assets/index-hvm7zsw0.css` responderam HTTP 200. O bundle público contém `list_tasks_page_v4`,
`execute_task_priority_command` e a composição `card-tags-property`.

Checks aprovados no commit publicado: Workers Builds: gabio (produção),
Supabase Preview, application e database-security, com stack Supabase completo.
CI: https://github.com/Fabio-Matos1303/gabio/actions/runs/45701746922.
Build de produção Cloudflare: `c18f3446-e3a0-44b8-89ea-c6751c5eabaa`.

Os containers descartáveis e a prévia sintética desta entrega foram encerrados.
Não houve fluxo autenticado com dados pessoais em produção. O workspace
original e seus trabalhos não relacionados permaneceram preservados.

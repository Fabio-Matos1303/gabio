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
Migration e produção pendentes neste registro.
Não foi realizado fluxo autenticado com dados pessoais em produção.

Os advisors anteriores à mudança registraram avisos preexistentes de funções
definer, extensão pg_net em public e proteção de senha, além de tabelas internas
com RLS sem políticas por desenho. Esta entrega não modifica essas configurações.
O RPC de prioridade tem autorização explícita, search_path fixo e execução
revogada para anon; a exposição autenticada é intencional, conforme o padrão
do gateway. Referências de auditoria:
[funções definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
e [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

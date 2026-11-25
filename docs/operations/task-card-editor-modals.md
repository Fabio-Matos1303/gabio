# Edição dos cartões em modais

## Escopo em 2026-11-25

Título, agendamento (prazo e recorrência), responsável, tags, visibilidade,
observações e checklists abrem editores próprios. O cartão mantém o resumo,
sem formulários abaixo dos botões de propriedades. No celular, os editores
seguem o painel inferior do sistema; no desktop, usam um modal central.

O fechamento preserva o cartão aberto e devolve o foco ao acionador. Rascunhos
alterados exigem confirmação de descarte dentro do modal. Compartilhamento e
exclusão de checklist também usam confirmação interna. Salvar mantém a versão
capturada no início da edição, inclusive após atualização do cartão; conflitos
e ações da fila ficam acessíveis no editor ativo.

Implementação em worktree isolada `Gabio-card-modal-release`, baseada na main
`b78c740478bf61298e12eeb2db48961a898d1fc3`. O workspace original e suas alterações
preexistentes foram preservados. Não houve mudança de schema, RLS, permissões,
OAuth, integrações ou dependências.

## Validação

- `pnpm verify` aprovado: formatação, lint, tipos, 191 testes da aplicação e
  pacotes, 59 testes Google e build PWA. Permanece o aviso de bundle acima de
  500 kB. Não houve teste local de banco nesta alteração exclusivamente de UI.
- QA Chromium com dados exclusivamente sintéticos nos viewports 360×800,
  768×1024, 1366×768 e 1920×1080.
- Os cinco acionadores de propriedades foram verificados em cada viewport:
  editor separado do cartão, ausência de formulário no cartão, geometria sem
  overflow, teclado preso ao editor, Escape e retorno do foco.
- Fluxos de observações, marcação de itens, criação e reordenação de checklist,
  título, resumo e proteção de conclusão exercitados na prévia sintética.
- Axe WCAG A/AA sem violações nos editores e no cartão; fallback visual,
  movimento reduzido, contraste amostrado e ampliação de texto de 200% no cartão
  compacto verificados. A composição do editor de responsável foi inspecionada
  visualmente nas quatro resoluções.
- Revisão independente de segurança concluída sem achados abertos. Os achados
  sobre descarte ao remover tags e restauração de foco foram corrigidos e
  cobertos por regressões.

Evidências locais: `test-results/task-card-content/report.json` e capturas na
mesma pasta, reproduzíveis com `scripts/qa-task-card.cjs`. O script utiliza
Playwright 1.56.1, Axe Core 4.10.3 e PNGJS 7.0.0 instalados somente no diretório
temporário, sem alterar dependências do produto.

## Publicação

Commit publicado: `90348466674febc6fecfc145c1dfb9fad789c20a`.
Enviado ao GitHub na branch `codex/task-card-editor-modals` e publicado na main
com comparação da base esperada, sem force.

URL: https://gabio.fabiosmo123.workers.dev.
`/version.json` confirmou `task-card-editor-modals-2026.11.25.1`, com escopo
`tasks-online-google-reading-card-content`. HTML, versão, manifesto, service
worker, registro PWA e assets responderam HTTP 200. O bundle servido contém
`task-editor-dialog`.

Assets verificados: `/assets/index-DxIh0X3j.js` e
`/assets/index-BMRIdNqZ.css`.

Checks remotos aprovados no commit publicado: Workers Builds: gabio (produção),
Supabase Preview, application e database-security. CI:
https://github.com/Fabio-Matos1303/gabio/actions/runs/45605123863.
O build de produção do Cloudflare foi
`c7556443-d073-45c2-b8b2-fe89d36fd2e5`.

Não foi realizado fluxo autenticado com dados pessoais em produção.

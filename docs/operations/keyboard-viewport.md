# Campos visíveis com teclado virtual

Status: publicação autorizada pelo usuário, release preparada em cópia isolada.

## Problema e correção

Os prints fornecidos mostram a folha de criação de tarefa atrás do teclado.
Os diálogos estavam limitados por `100dvh`, sem acompanhar a área visível
reduzida pelo teclado. Esse comportamento é compatível com a distinção entre
layout viewport e visual viewport descrita na [documentação do Chrome](https://developer.chrome.com/blog/viewport-resize-behavior/).

O hook `useKeyboardViewport`, montado em `App`, acompanha altura e deslocamento
de `VisualViewport`. O CSS compartilhado posiciona e limita todos os diálogos
à área visível. A folha inferior permanece no mobile e a centralização permanece
no tablet e desktop. Na ausência dessa API, usa a altura da janela.

O campo ativo é revelado pela rolagem dos containers internos e, em formulários
de página, pela rolagem da página. Cabeçalho e rodapé dos diálogos entram no
cálculo da área útil. O hook não muda foco, seleção ou valor, não rola a página
bloqueada atrás de um diálogo e não altera o layout durante pinch zoom.
A navegação inferior é ocultada enquanto um campo editável está ativo e há
redução inferior significativa da área visível. Textareas têm altura máxima
adaptativa e rolagem interna para preservar a edição de textos longos.

## Verificação

Todos os dados usados na prévia são fictícios; requisições externas foram
bloqueadas pelo roteiro de QA. Não houve acesso a dados de produção.

- `pnpm --filter @gabio/web test use-keyboard-viewport`: 4 testes passaram,
  cobrindo resize, deslocamento, foco/seleção, cleanup, pinch zoom e fallback.
- `pnpm --filter @gabio/web test`: 16 arquivos e 129 testes passaram. O jsdom
  emitiu avisos de `window.scrollTo` não implementado durante a suíte.
- `pnpm --filter @gabio/web build`: passou, incluindo TypeScript e geração da
  PWA. O bundler emitiu aviso de chunk acima de 500 kB.
- ESLint e Prettier dos arquivos da correção: passaram.
- `scripts/qa-keyboard-viewport.cjs`: passou no Chromium local com
  `VisualViewport` simulado, mantendo o layout viewport original.
- Viewports, nesta ordem: 360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080.
- Fluxos verificados nos quatro tamanhos: criação e campos adicionais,
  título do cartão, observações longas com digitação no final, busca de tarefas,
  busca e edição de tags, nome e itens de checklist e nome de exibição no perfil.
- Abertura/fechamento do teclado, mudança de foco e deslocamento da área visível:
  campos inteiros dentro da área útil, foco preservado, sem overflow horizontal
  e sem erros JavaScript. Nas observações, a digitação no final do texto longo
  também acionou a rolagem interna do textarea.
- Capturas sintéticas e relatório em `test-results/keyboard-viewport/`
  (ignorados pelo Git). Capturas de mobile, tablet, notebook e desktop foram
  inspecionadas visualmente.
- Preservados os tokens, fundo creme, materiais, raio dos controles, folha
  mobile, diálogo central e indicador de foco existentes. A mudança não inclui
  redesenho de telas nem funcionalidades.
- Revisão de segurança por agente distinto: nenhum achado de segurança ou
  privacidade. O achado inicial de textarea excessivamente alto foi corrigido
  e reavaliado.

## Limites e produção

Ainda não foram verificados teclado físico de dispositivo Android/iPad, teclado
flutuante ou dividido, Safari real, fluxo financeiro e autenticação no navegador.
Esses formulários recebem o hook global, mas o QA de navegador acima não os
exercitou. Não foram refeitas medições de contraste nem testes de fallback sem
blur ou de toda a navegação por teclado; o CSS de cores e materiais foi preservado.

O usuário autorizou a publicação em 2026-11-25. A release foi montada na worktree
`Gabio-keyboard-release`, branch `codex/keyboard-viewport`, sobre a main remota
`d2dd28b`. Apenas os deltas do teclado foram aplicados; os editores modais,
prioridades e demais melhorias da base remota foram preservados. O workspace
original e suas alterações anteriores permanecem preservados.

O QA foi adaptado aos editores modais da base remota e passou novamente nos
quatro viewports com os mesmos fluxos e dados sintéticos. A verificação usa
`GABIO_PREVIEW_URL` para selecionar a prévia isolada.

`pnpm verify` completo na release isolada: formatação, lint, tipos, 211 testes da
aplicação e pacotes (142 web e 69 dos pacotes), 59 testes Google e build PWA
aprovados. Permanecem os avisos de bundle acima de 500 kB e de `scrollTo` no
jsdom. A revisão independente da composição isolada não encontrou problemas
de segurança nem alterações alheias. Não houve execução local dos testes SQL
nesta correção exclusivamente de UI; o CI remoto executa o stack completo.

Versão preparada: `keyboard-viewport-2026.11.25.1`. Não há alterações de
permissões, banco, dependências, integrações ou escopos OAuth. A entrega permanece
pendente até verificar a versão e a disponibilidade em produção e enviar o
registro final ao GitHub.

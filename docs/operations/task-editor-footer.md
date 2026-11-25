# Rodapés dos editores de cartões

## Alteração em 2026-11-25

Removido o fundo branco e o comportamento sticky do grupo de ações nos editores
de cartões. Cancelar e Salvar ficam lado a lado no canto inferior direito, nessa
ordem visual e de teclado. O botão principal usa largura do conteúdo. A ação de
excluir checklist permanece antes do rodapé, separada do par Cancelar/Salvar.
O rótulo Tags ganhou 12 px de distância das tags selecionadas.

Base remota: `833487e9496f1430962f501255be4b620f016069`. Entrega na worktree
isolada `Gabio-card-modal-release`, branch `codex/task-editor-footer`.
Sem mudanças de schema, autorização, dependências ou integrações.

## Validação e publicação

- QA Chromium aprovado em 360×800, 768×1024, 1366×768 e 1920×1080, com
  inspeção visual das capturas. O teste verifica geometria dos botões na mesma
  linha, Salvar à direita, alinhamento do grupo e fundo transparente; a distância
  entre legenda e tags selecionadas é medida em cada viewport.
- Fluxos de salvar observações, checklist e título, foco, Escape, navegação por
  teclado, ausência de overflow, Axe WCAG A/AA, contraste amostrado, fallback sem
  blur e texto ampliado de 200% no cartão compacto passaram.
- Revisão independente de segurança sem achados concretos. Cancelar e excluir
  continuam `type="button"`; confirmação de exclusão e envio dos formulários
  permanecem preservados.
- Evidências sintéticas em `test-results/task-card-content`, reproduzíveis com
  `scripts/qa-task-card.cjs` e os módulos temporários de Playwright, Axe e PNGJS
  documentados na entrega anterior.
- `pnpm verify` aprovado: formatação, lint, tipos, 191 testes da aplicação e
  pacotes, 59 testes Google e build PWA. Aviso de bundle acima de 500 kB
  permanece. Não foi executado teste local de banco nesta mudança de UI.

Versão preparada: `task-editor-footer-2026.11.25.1`.
Publicação pendente neste registro inicial.
Os fluxos visuais usam apenas dados sintéticos. Não será realizado fluxo
autenticado com dados pessoais em produção.

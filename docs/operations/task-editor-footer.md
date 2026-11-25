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

## Produção verificada

Commit publicado: `e498bd99204c2a7f50415b3edee6aae86d05c3bc`.
Arquivos enviados na branch da entrega e main atualizada com comparação do SHA
esperado, sem force. Versão `task-editor-footer-2026.11.25.1` confirmada em
https://gabio.fabiosmo123.workers.dev/version.json.

HTML, versão, manifesto, service worker, registro PWA, JavaScript
`/assets/index-C14O6whs.js` e CSS `/assets/index-Dd_CnaKE.css` responderam HTTP 200. O CSS servido contém o rodapé transparente, alinhamento à direita, largura
automática dos botões e margem de 12 px da legenda Tags.

Checks remotos aprovados: Workers Builds: gabio (produção), Supabase Preview,
application e database-security. CI:
https://github.com/Fabio-Matos1303/gabio/actions/runs/45607844921.
Build Cloudflare: `cc1900c9-a28d-4044-b461-8991be6a49e1`.

Os fluxos visuais usam apenas dados sintéticos. Não será realizado fluxo
autenticado com dados pessoais em produção.

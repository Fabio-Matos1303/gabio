# Ações compactas nos cartões

Status em 2026-11-26: implementação validada; publicação autorizada pelo usuário
em 2026-11-26. Verificação de produção em andamento.

Base remota: `9b0754b`. Branch isolada: `codex/clean-card-actions`.
O workspace original e suas alterações preexistentes foram preservados.

Edição de checklist e observações usa caneta, sem repetir o nome da lista
visualmente. Reordenar e remover itens usa setas e lixeira da mesma família
SVG. Nomes acessíveis, tooltips, foco e alvos de 44 × 44 px são preservados.
Títulos longos quebram ao lado da caneta. Comandos, schemas, confirmações,
permissões e modo somente leitura permanecem intactos.

## Validação

- 142 testes da aplicação passaram; a suíte de 14 testes do diálogo também
  passou isoladamente com pool de processos.
- Build da aplicação (TypeScript e Vite/PWA), ESLint dos componentes alterados,
  Prettier dos três arquivos e `git diff --check` aprovados. Permanece o aviso
  anterior de bundle JavaScript acima de 500 kB.
- Prévia exclusivamente sintética, com requisições externas bloqueadas, em
  360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080. Capturas dos quatro tamanhos
  inspecionadas. Sem overflow da página ou do diálogo.
- Roteiro existente de cartões aprovado nos quatro tamanhos: edição de
  propriedades, observações, checkboxes, checklist, ordem, título, confirmação
  de conclusão, teclado, fallback sem blur e ampliação de texto de 200% no
  mobile. Axe sem violações; contraste amostrado aprovado. Algumas verificações
  automáticas de contraste no vidro exigiram amostragem por imagem.
- O roteiro existente foi executado a partir de cópia temporária usando a
  porta 5183 e aceitando os valores equivalentes `flex-end` e `flow-end` para
  alinhamento do rodapé no Chromium instalado. Nenhuma mudança no produto foi
  necessária para essa diferença de serialização CSS.
- Verificação adicional nos quatro tamanhos confirmou botões sem texto
  visível, alvos mínimos de 44 px, foco visível após entrada por teclado,
  abertura com Enter, título sintético longo sem sobrepor a caneta e remoção
  do item correto. Evidências locais em `test-results/task-card-content/`.
- Revisão por agente distinto aprovada após corrigir atributos acessíveis
  indevidamente aplicados ao checkbox durante a implementação.
- Não houve alteração de banco, integração, dependências ou autorização.
  Testes de banco e fluxo autenticado de produção não foram executados.

## Publicação autorizada

O usuário autorizou a publicação em 2026-11-26. Versão preparada:
`clean-card-actions-2026.11.26.1`.

Commit enviado à branch da entrega e à main:
`10f5b40411d8cc2fe498dad084731053e4d4404a`.
A árvore remota foi comparada à árvore local validada e é idêntica.

`pnpm verify` completo aprovado: formatação, lint, tipos, 211 testes da aplicação
e pacotes, 59 testes Google e build PWA. Os arquivos do checkout isolado foram
normalizados de CRLF para LF apenas para executar a formatação; essa normalização
não gerou alterações adicionais no conteúdo do commit.

CI remoto aprovado: application e database-security, incluindo o stack completo
do banco e seus testes SQL. Supabase Preview também aprovado.
CI: https://github.com/Fabio-Matos1303/gabio/actions/runs/45846887809.

O primeiro check Workers Builds concluído aponta para a prévia da branch.
A verificação pública ainda retorna a versão anterior; este registro de checks
é enviado à main para acompanhar a publicação de produção. A entrega permanece
pendente até confirmar versão e recursos servidos na URL pública.

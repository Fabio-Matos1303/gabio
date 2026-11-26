# Cabeçalho compacto do cartão

Status em 2026-11-26: publicada e verificada em produção, sob a autorização
de publicação mantida nesta conversa.

Base remota: `a46f2c9ebdf9430d8d4984df99702a7721c83cd5`.
Branch da entrega: `codex/clean-card-heading`, na cópia isolada existente.

O cartão deixa de exibir o título genérico da janela. O título da tarefa
continua visível no conteúdo; o nome do diálogo permanece disponível para
leitores de tela por `aria-labelledby` e título visualmente oculto. O cabeçalho
fica compacto, sem divisor, com o botão de fechar de 44 × 44 px à direita.
Os editores secundários mantêm seus títulos visíveis e o comportamento padrão.

## Validação

- 20 testes existentes dos diálogos passaram; ESLint dos componentes alterados,
  Prettier dos arquivos da entrega e build TypeScript/Vite/PWA aprovados.
  Permanece o aviso anterior de bundle acima de 500 kB.
- Prévia sintética com tráfego externo bloqueado em 360 × 800, 768 × 1024,
  1366 × 768 e 1920 × 1080, começando pelo mobile compacto. Capturas dos quatro
  tamanhos inspecionadas visualmente.
- Verificados nome acessível, ocultação visual do título, cabeçalho de 52 px,
  fechar por botão e Escape, retorno de foco e alvo de toque de 44 px.
- Roteiro completo dos cartões aprovado nos quatro viewports, incluindo
  editores, observações, checklists, reordenação, confirmações, teclado,
  fallback sem blur, contraste amostrado e texto de 200% no mobile.
  Axe sem violações; nenhuma rolagem horizontal da página ou do diálogo.
- Revisão por agente distinto aprovada sem achados de segurança ou
  acessibilidade. Nenhuma alteração em dados, comandos, autorização, banco,
  dependências ou integrações.
- Não foram refeitas localmente a suíte inteira da aplicação, os testes Google
  nem os testes SQL. O CI remoto executa os checks completos.
- Evidências locais: `test-results/task-card-content/report.json` e capturas
  `*-clean-heading.png`. Nenhum dado pessoal usado na validação.

## Produção

Commit publicado: `d5d3a8022603bfaeb61ed06a40553545c6df3f0d`.
Árvore remota idêntica à árvore local validada. Atualização da main por
comparação da base esperada e sem force. Versão:
`clean-card-heading-2026.11.26.1`.

CI remoto: application e database-security aprovados; o segundo executou o
stack completo do banco e os testes SQL. A aplicação executou os checks
completos, incluindo 211 testes da aplicação/pacotes e 59 testes Google.
CI: https://github.com/Fabio-Matos1303/gabio/actions/runs/45848299176.

O Supabase Preview falhou com `unexpected status listing functions 502`.
Essa falha externa foi registrada; não foram alterados código de funções,
permissões ou banco para contorná-la.

URL: https://gabio.fabiosmo123.workers.dev.
Verificação pública em 2026-11-26 às 15:23 UTC (12:23 em America/Bahia):
versão correta e HTTP 200 para HTML, versão, manifesto, service worker,
registro PWA, JavaScript `/assets/index-DvVR0ThR.js` e
CSS `/assets/index-CxhcfcnU.css`.
Os assets servidos contêm o cabeçalho compacto e o título visualmente oculto.
Evidência local: `test-results/task-card-content/production-heading.json`.
Não foi realizado fluxo autenticado com dados pessoais em produção.

Build de produção do Cloudflare: `ba6e071b-caa0-493b-b79e-51dec1fb2a55`.
O registro final é enviado em commit posterior à implementação, na main e
na branch da entrega, conforme AGENTS.md. Alterações anteriores do workspace
original permanecem preservadas.

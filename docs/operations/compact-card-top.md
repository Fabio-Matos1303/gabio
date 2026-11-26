# Conteúdo junto ao topo do cartão

Status em 2026-11-26: publicada e verificada em produção, sob a autorização
mantida nesta conversa.

Base remota: `cda8d02c9c7bedfc2a91828ba87c81b63a3341bd`.
Branch da entrega: `codex/compact-card-top`, na cópia isolada existente.
As novas visualizações de calendário da base remota foram preservadas.

A faixa reservada ao fechamento deixa de ocupar uma linha inteira. O título
da tarefa passa a ser o primeiro conteúdo, a 20 px do topo interno, e o status
fica logo abaixo, sem margens extras. O fechamento ocupa somente o canto
superior direito, com área de 44 × 44 px e fundo opaco para continuar legível
durante a rolagem. O título reserva espaço lateral para não sobrepor o botão.
O scroll-padding protege o foco de teclado sem criar espaço vazio no layout.

## Validação

- 20 testes existentes de TaskCardDialog e TaskDetailsDialog aprovados.
- ESLint do componente alterado, Prettier dos arquivos da entrega, verificação
  de whitespace e build TypeScript/Vite/PWA aprovados. Permanece o aviso
  anterior de bundle acima de 500 kB.
- QA exclusivamente sintético, com requisições externas bloqueadas, em
  360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080, começando pelo mobile.
  Capturas dos quatro tamanhos inspecionadas visualmente.
- Verificados título no topo, status abaixo, título longo sem sobreposição,
  ampliação de texto de 200% no mobile, fechamento de 44 px acessível após
  rolagem, Enter, Escape e restauração do foco.
- Todas as 14 paradas de teclado do cartão foram percorridas nos quatro
  tamanhos, sem controles cobertos pelo fechamento.
- Roteiro existente dos cartões aprovado nos quatro tamanhos: editores,
  observações, checklists, reordenação, confirmações, teclado, fallback sem blur,
  contraste amostrado e texto ampliado. Axe sem violações e nenhum overflow
  horizontal da página ou do diálogo.
- Revisão de segurança por agente distinto sem achados; a preocupação com
  sobreposição durante rolagem foi verificada pelo QA de teclado acima.
- Não houve mudança de dados, permissões, comandos, integrações, banco ou
  dependências. Não foram refeitos localmente os testes SQL, Google ou a suíte
  inteira da aplicação; o CI remoto executa os checks completos.

Evidências locais: `test-results/task-card-content/compact-top.json`,
`report.json` e capturas `*-compact-top.png`. Nenhum dado pessoal usado em QA.

## Produção

Commit publicado: `da938ba408e9590da5f520ef01fab4df075c2958`.
Árvore remota idêntica à árvore local validada. Atualização da main por
comparação da base esperada e sem force. Versão:
`compact-card-top-2026.11.26.1`.

Checks remotos aprovados: application, database-security, Supabase Preview e
Workers Builds: gabio (produção). O CI executou `pnpm verify`, checagem Deno e
os testes SQL com o stack completo do banco.
CI: https://github.com/Fabio-Matos1303/gabio/actions/runs/45850833116.
Build de produção: `5188caa5-73dd-47e1-9ca1-a18fae5c73e5`.

URL: https://gabio.fabiosmo123.workers.dev.
Verificação pública em 2026-11-26 às 15:38 UTC (12:38 em America/Bahia):
versão correta e HTTP 200 para HTML, versão, manifesto, service worker,
registro PWA, JavaScript `/assets/index-DrURRjm4.js` e
CSS `/assets/index-BbV_UUKg.css`.
Os assets servidos contêm o status abaixo do título, o fechamento no canto e
scroll-padding de 60 px para navegação por teclado.
Evidência local: `test-results/task-card-content/production-compact-top.json`.
Não foi realizado fluxo autenticado com dados pessoais em produção.

Este registro final é enviado em commit posterior à implementação, na main e
na branch da entrega, conforme AGENTS.md. O workspace original e suas
alterações preexistentes permanecem preservados.

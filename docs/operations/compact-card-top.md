# Conteúdo junto ao topo do cartão

Status em 2026-11-26: validado; publicação em andamento sob a autorização
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

Versão preparada: `compact-card-top-2026.11.26.1`.
Produção pendente de verificação após o envio do commit.

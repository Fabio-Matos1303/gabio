# Controles essenciais e status no cartão

Status em 2026-11-26: validado; publicação em andamento sob a autorização
mantida nesta conversa.

Base remota: `1c2ad60d91c9ea6c954cb2addf10a0670738a731`.
Branch: `codex/task-controls-status`, na cópia isolada existente. Preservadas
as visualizações de calendário e o material de vidro da base remota.

## Comportamento

- Fechar usa apenas o X, sem fundo circular. O alvo de 44 px e o foco visível
  permanecem; o foco usa o raio dos controles, sem formar um círculo.
- Ações de criação exibem ícone de mais com “Checklist” ou “Item”, mantendo os
  nomes acessíveis completos.
- “Quadro” substitui “Kanban” na interface; o identificador técnico permanece.
  A barra centraliza os grupos horizontalmente, em duas linhas no mobile e uma
  linha a partir de tablet.
- Atualização das tarefas gira o ícone existente, mantendo `aria-busy` e uma
  região de status somente para leitores de tela. Não acrescenta texto visível
  nem desloca a barra. Movimento reduzido desativa a rotação.
- O cartão oferece seletor compacto de status: A fazer, Em andamento e
  Concluída. Concluídas sem recorrência podem voltar para A fazer; ocorrências
  recorrentes concluídas permanecem em consulta. Canceladas legadas continuam
  aceitas, sem nova ação de cancelamento, conforme ADR-007.
- Mudanças de status usam o comando `set_status` existente, com validação por
  schema, versão, fila idempotente e confirmação quando há itens pendentes nas
  checklists. Rascunhos, editores abertos e operações pendentes bloqueiam a ação.
  Nenhuma alteração de autorização, banco, integrações ou dependências.
- A troca confirmada de status não acrescenta banner de sucesso: o próprio
  seletor reflete o resultado. Erros, conflitos, offline e pendências continuam
  exibindo as mensagens existentes.

## Validação

- 75 testes direcionados de App, TaskViews e TaskDetailsDialog aprovados,
  incluindo sete novos casos para atualização, status, confirmação de checklist,
  versão, bloqueios e recorrência.
- ESLint dos componentes/testes alterados, Prettier dos arquivos da entrega,
  whitespace e build TypeScript/Vite/PWA aprovados. Permanecem os avisos anteriores
  de bundle acima de 500 kB e de scrollTo no jsdom.
- QA Chromium sintético nos quatro viewports, começando por 360 × 800, depois
  768 × 1024, 1366 × 768 e 1920 × 1080. Tráfego externo bloqueado; capturas
  inspecionadas visualmente. Nenhum dado pessoal usado.
- Conferidos centralização geométrica, rótulos, X transparente, controle de
  status compacto e fluxos iniciar, voltar, concluir com confirmação e reabrir.
  Preservadas as visualizações Quadro, Semana e Mês, sem overflow da página.
- Leitura sintética atrasada em 1 segundo somente no roteiro de QA confirmou
  rotação e ausência de mudança na posição/altura da barra durante atualização.
  Movimento reduzido desativou a rotação sem ocultar o estado acessível.
- Roteiro completo dos cartões aprovado nos quatro tamanhos: propriedades,
  observações, checklists, reordenação, confirmações, teclado, retorno de foco,
  fallback sem blur, contraste amostrado e texto de 200% no cartão mobile.
  Axe sem violações; nenhum overflow horizontal no diálogo.
- Revisão independente de segurança e acessibilidade aprovada sem achados.
  Não foram refeitos localmente os testes SQL, Google nem a suíte inteira da
  aplicação. O CI remoto executa os checks completos.

Evidências locais: `test-results/task-card-content/minimal-controls.json`,
`report.json` e capturas `*-minimal-toolbar.png` e `*-minimal-card.png`.
As capturas de status posteriores à correção de cascata CSS mostram o seletor
compacto, sem herdar largura e fundo dos campos de formulário.

Versão preparada: `task-controls-status-2026.11.26.1`.
Produção pendente de confirmação após o envio do commit.

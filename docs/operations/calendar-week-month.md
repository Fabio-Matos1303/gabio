# Calendário semanal e mensal

Data: 2026-11-26. Status: publicação autorizada pelo usuário; validação da cópia isolada em andamento.

## Alterações

- Seletor de visualização com Kanban, Semana e Mês, preservando filtros.
- Semana de segunda a domingo em sete colunas, com todas as atividades datadas, navegação de sete dias e retorno a Hoje.
- Títulos compactos no mobile, completos ao abrir a atividade; detalhes do dia abaixo da semana e tarefas sem data acessíveis.
- Mês mantém grade e navegação existentes. Os calendários e os detalhes do dia crescem com a página, sem rolagem interna.
- Metadados neutros dos cartões no calendário usam o token de contraste do design system.

## Validação local

- Testes do frontend: 16 arquivos, 129 testes aprovados antes do novo caso semanal.
- TaskViews: 12 testes aprovados, incluindo o novo caso de navegação semanal na virada do ano, três atividades no mesmo dia, abertura do cartão e preservação do dia ao alternar para Mês.
- Build de produção (inclui TypeScript), ESLint dos dois arquivos TSX e formatação dos três arquivos da alteração aprovados. Build avisa sobre bundle JavaScript acima de 500 kB.
- Chrome headless, somente prévia sintética, com rede externa bloqueada. Semana e Mês em 360×800, 768×1024, 1366×768 e 1920×1080: sete colunas sem corte, sem transbordamento horizontal da página e sem containers do calendário com rolagem interna.
- Axe WCAG A/AA sem violações detectadas nas duas visões nos quatro tamanhos. Checagem de teclado e renderização sem backdrop-filter executadas; não equivalem a auditoria manual completa com leitor de tela.
- Áreas de toque da seleção de visão, seleção de dia e atividades semanais verificadas em 360×800 (mínimo 44×44).
- Screenshots sintéticos e relatório em tmp/calendar-qa (artefatos locais, fora da entrega).
- Revisão estática de segurança por agente distinto: nenhum achado novo. Preservados schema da leitura Google, invalidação por geração, isolamento em memória e ações existentes. Sem alterações de backend, OAuth, permissões ou migrations.

## Pendências

- Publicação autorizada pelo usuário em 2026-11-26. Versão candidata: `calendar-week-month-2026.11.26.1`. Base remota: `ff05c7c1c19a9a6ced8c557c3743a6281842bcb3`.
- Entrega preparada na cópia isolada `Gabio-calendar-release` a partir da main remota atual. Mantidos os recursos remotos mais recentes de prioridade e cartões; nenhum arquivo de trabalho alheio foi transportado.
- Integração Google real, dispositivos físicos e leitor de tela não foram testados; os checks usaram exclusivamente dados fictícios.

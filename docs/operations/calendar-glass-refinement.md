# Refinamento visual do calendário

Data: 2026-11-26. Status: publicação autorizada pelo usuário, em preparação.

Base: `75a5a34522c6b7af8b789a8f8aaa859328a2810b`. Branch isolada: `codex/calendar-glass-refinement`, na worktree `Gabio-calendar-release`.

## Mudança

O print enviado pelo usuário foi inspecionado, junto à referência visual do design system. A visão semanal tinha divisórias de tabela, seleção retangular de toda a coluna e atividades em blocos quase retos.

O refinamento remove as linhas contínuas da semana e concentra a seleção em uma cápsula horizontal com nome do dia e data lado a lado. Por solicitação do usuário, sem sublinhado e sem círculo escuro no número; “Horário de Brasília” foi removido da legenda, preservando o fuso usado nos cálculos. A contagem continua no nome acessível de cada dia. As atividades usam superfícies claras discretamente translúcidas, bordas arredondadas, sombra leve e horário separado do título. O fundo permanece creme e sem decoração. O contêiner principal mantém o vidro compartilhado; os cartões internos não acrescentam blur próprio. A navegação de período também usa cápsula na semana e no mês.

As sete colunas, filtros, detalhes do dia, tarefas sem data, nomes acessíveis e regras de abertura foram preservados. Nenhuma alteração de dados, consultas, comandos, permissões ou backend. Versão candidata: `calendar-glass-2026.11.26.1`.

## Validação

- 12 testes de TaskViews aprovados; TypeScript e build PWA aprovados; ESLint do TSX, Prettier dos arquivos alterados e diff check aprovados. Permanece o aviso de bundle JavaScript superior a 500 kB.
- Chrome headless com fixtures sintéticas e rede externa bloqueada, começando por 360×800 e seguindo para 768×1024, 1366×768 e 1920×1080.
- Semana e mês nos quatro tamanhos: sete colunas sem corte, sem rolagem horizontal da página ou interna do calendário. Axe WCAG A/AA sem violações detectadas nos oito cenários.
- Áreas de toque dos seletores e atividades semanais verificadas em 360×800, com pelo menos 44×44 px. Menor largura medida: 46 px.
- Teclado: seleção do dia com Enter e foco visível de 2 px nos quatro tamanhos.
- Texto base ampliado para 20 px sem transbordamento horizontal. Última ação das tarefas sem data permanece alcançável fora da ilha inferior.
- Preferência de transparência reduzida e simulação de superfícies opacas sem backdrop-filter: renderização capturada e axe sem violações nos quatro tamanhos. Não houve teste em browser fisicamente sem suporte a backdrop-filter.
- Revisão independente de segurança e semântica: nenhum bloqueador. Rótulo visual abreviado usa aria-hidden e mantém o aria-label completo; aria-pressed, guardas de abertura permanecem.
- Evidências ignoradas em `test-results/calendar-qa`, `calendar-refinement-extra.json` e `calendar-refinement-desktop.png`.

Não foram executados testes de banco, integração Google real, leitor de tela ou dispositivos físicos. O usuário autorizou a publicação em 2026-11-26. A composição parte da main atual e preserva o ajuste recente do espaço superior dos cartões. A publicação será registrada após verificar versão, checks e disponibilidade.

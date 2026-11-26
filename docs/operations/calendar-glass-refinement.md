# Refinamento visual do calendário

Data: 2026-11-26. Status: publicado; versão e disponibilidade verificadas em produção.

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

Não foram executados testes locais de banco, integração Google real, leitor de tela ou dispositivos físicos. O CI remoto executou os testes de banco. O usuário autorizou a publicação em 2026-11-26. A composição parte da main atual e preserva o ajuste recente do espaço superior dos cartões. A publicação foi confirmada conforme o registro abaixo.

## Publicação verificada

Publicação autorizada pelo usuário em 2026-11-26. Commit de implementação enviado à main: `4bf72a634b700e13eb0085fa7a0e0258eae0fd8f`. Árvore `751e840bec15e7ff9b33eda52b769198249dc683`, comparada e idêntica à árvore local validada. A base remota atual foi incorporada na cópia isolada, preservando as mudanças anteriores do topo dos cartões.

Na composição final, passaram os 32 testes de TaskViews, TaskCardDialog e TaskDetailsDialog, ESLint do TSX, Prettier dos arquivos da entrega, diff check, TypeScript e build/PWA. Foram repetidos os oito cenários Semana/Mês nos quatro viewports e os quatro cenários de teclado, texto ampliado e fallback opaco, sem violações axe, corte de colunas ou rolagem interna/horizontal. A revisão de segurança e semântica foi feita por agente distinto e não encontrou bloqueadores.

A URL https://gabio.fabiosmo123.workers.dev/version.json confirmou `calendar-glass-2026.11.26.1`, escopo `tasks-online-google-reading-card-content`. HTTP 200 confirmado para HTML, versão, manifesto, service worker, registro da PWA, JavaScript `/assets/index-DAqRe730.js` e CSS `/assets/index-CE_fIFHP.css`. O código servido contém os marcadores da visão semanal, navegação, estilos sem scroll interno e cápsula horizontal. Relatório local ignorado: `test-results/production-verification.json`.

Quatro checks remotos aprovados no commit publicado: `application` (verificação completa e Deno check), `database-security` (stack Supabase e testes SQL), `Supabase Preview` e `Workers Builds: gabio`. CI: https://github.com/Fabio-Matos1303/gabio/actions/runs/45870324947.

Cloudflare build `4f70d68c-03b2-4c9c-87f9-bf595568c347`, versão do Worker `4dc0f53d-a8f6-41c4-b419-b8e8d570a43c`.

A verificação pública usou somente recursos estáticos. Nenhum fluxo autenticado com dados pessoais foi aberto em produção; os testes de interface utilizaram fixtures sintéticas. Nenhuma migration, permissão, escopo OAuth ou custo foi alterado. Este registro final é enviado à main em commit separado após a verificação.

# Calendário semanal e mensal

Data: 2026-11-26. Status: publicado; versão e disponibilidade verificadas em produção.

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

## Validação da cópia isolada

A main avançou durante a preparação para `ff05c7c1c19a9a6ced8c557c3743a6281842bcb3`. A entrega foi reaplicada sobre essa base, preservando a mudança de cabeçalho dos diálogos recém-publicada. O conflito de versão foi resolvido com a nova versão do calendário. O commit enviado é `acfee934d485e8d5eb6b791d91b31dc8866eb960`, árvore `ae7aed2df2ee4d35e63ea237ea1c4d80034f96f5`, idêntica à árvore local validada.

Formatação, lint e tipos completos passaram. Os pacotes passaram em 69 testes. O primeiro teste web completo teve 142 aprovações e uma falha intermitente no prazo de espera de 1 segundo do teste de sincronização de cartões. O caso passou novamente com configuração padrão; o arquivo App completo passou em 42 testes usando configuração temporária ignorada com espera assíncrona de 5 segundos. Não houve alteração do teste ou do código de sincronização. Os 59 testes Google e o build completo passaram.

Após incorporar a última main, passaram os 32 testes de TaskViews, TaskCardDialog e TaskDetailsDialog, novo build/PWA e os oito cenários de calendário/viewport, todos sem violações axe, overflow horizontal ou rolagem interna. Evidências sintéticas: `test-results/calendar-qa` na cópia isolada. Aviso de bundle acima de 500 kB permanece.

A revisão independente da entrega isolada não apontou bloqueadores. Não houve mudança de banco, permissões ou OAuth. A verificação pública consulta apenas recursos estáticos e não abre dados pessoais nem executa comandos autenticados.

## Publicação verificada

O usuário autorizou a publicação em 2026-11-26. Commit de implementação enviado à main: `acfee934d485e8d5eb6b791d91b31dc8866eb960`. A árvore remota é idêntica à árvore local validada.

URL de produção: https://gabio.fabiosmo123.workers.dev. `/version.json` confirmou `calendar-week-month-2026.11.26.1` e o escopo `tasks-online-google-reading-card-content`.

Responderam HTTP 200: HTML, versão, manifesto, service worker, registro da PWA, JavaScript `/assets/index-I5C7vUxJ.js` e CSS `/assets/index-By4sEPny.css`. Os recursos servidos contêm a navegação semanal, a visão semanal e os estilos de crescimento do calendário com a página. Relatório local: `test-results/production-verification.json`.

CI remoto do commit de implementação aprovado: `application` (verificação padrão completa e Deno check), `database-security` (stack Supabase e testes SQL) e `Supabase Preview`. CI: https://github.com/Fabio-Matos1303/gabio/actions/runs/45849120818.

Cloudflare Workers build aprovado: `a02bfa2b-d922-4a76-bcaf-1768c6ed19a5`, versão do Worker `945a7343-39e3-40b8-a1c7-03566894a74c`. A confirmação pública da versão foi realizada após o deploy, sem autenticação e sem consulta ou alteração de tarefas reais. O fluxo autenticado foi testado apenas com fixtures sintéticas. O registro final desta entrega também é enviado à main em commit separado.

# Barra de tarefas e visualização compacta no mobile

Status em 2026-11-26: validado; publicação em andamento sob a autorização
mantida nesta conversa.

Base remota: `bf03cf2a9273758dffd13ca872af1e8c7d149d33`.
Branch: `codex/vertical-task-toolbar`, na cópia isolada existente.

O usuário esclareceu que a centralização pretendida era vertical. As
visualizações voltam à esquerda e as ferramentas à direita. Ambos os grupos
ficam no centro vertical da linha de controles. No mobile compacto,
um seletor nativo exibe somente a visualização atual. Ao tocar, o usuário escolhe
Quadro, Semana ou Mês. Os ícones ficam centrados nos controles, com visualização
e ferramentas em uma linha. Tablet e desktop mantêm as três opções visíveis.

O resumo vazio deixa de reservar uma linha no grid, que acrescentava espaço
inferior e deslocava visualmente os controles. A região de status continua
acessível, incluindo atualização do Google. Contagens, filtros ativos e
parcialidade continuam visíveis quando há informação a apresentar.

## Validação

- 13 testes de TaskViews aprovados, incluindo sincronização entre seletor
  compacto e botões, alternância entre as três visualizações e rejeição de
  valores inválidos pelo schema local.
- ESLint do componente alterado, Prettier dos arquivos da entrega, whitespace
  e build TypeScript/Vite/PWA aprovados. Permanece o aviso anterior de bundle
  acima de 500 kB.
- Prévia exclusivamente sintética, tráfego externo bloqueado, em 360 × 800,
  768 × 1024, 1366 × 768 e 1920 × 1080, começando pelo mobile. Capturas dos
  quatro tamanhos inspecionadas visualmente.
- Medidas confirmaram grupos nas laterais, centros verticais coincidentes
  nos quatro viewports. Ícones
  centrados nos botões e alvos de toque de pelo menos 44 px em todos os tamanhos.
- Quadro, Semana e Mês sem overflow da página. Filtros ativos continuam
  exibindo o resumo; fallback sem blur verificado. Axe sem violações na barra. Seletor e botões compartilham estado; a seleção
  e os filtros são preservados ao trocar a visualização e redimensionar
  entre mobile e tablet. O seletor tem foco visível e alvo de 44 px.
- Revisão independente de segurança aprovada sem achados. Não há alteração
  de comandos, validação, permissões, dados, dependências ou integrações.
- Não foram repetidos localmente os testes de App, SQL, Google ou a suíte
  inteira. O CI remoto executa os checks completos. Não houve medição nova de
  contraste por pixels nem teste de texto ampliado nesta correção de alinhamento.

Evidências locais: `test-results/task-card-content/vertical-toolbar.json` e
capturas `*-vertical-toolbar.png`. O complemento mobile possui evidências em
`mobile-view-selector.json` e capturas `*-mobile-view-selector.png`.

## Publicação inicial de alinhamento

Commit `dcf3c81ada8aea5fa8e27472d20e75066ebbf7b2`, versão
`vertical-task-toolbar-2026.11.26.1`, publicada e verificada na URL de produção
em 2026-11-26. HTML, versão, assets e PWA responderam HTTP 200. Os checks
application, database-security, Supabase Preview e Workers Builds passaram.
CI: https://github.com/Fabio-Matos1303/gabio/actions/runs/45873337709.
Build de produção: `2739e6c6-f7a4-47d5-ab0f-b4bed7488cd3`.
Evidência: `test-results/task-card-content/production-vertical-toolbar.json`.
A publicação do complemento mobile usa essa versão como base.

Versão preparada do complemento: `mobile-view-selector-2026.11.26.1`.
Produção pendente de confirmação após o envio do commit.

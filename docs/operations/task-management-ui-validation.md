# Cartões, tags, filtros e calendário — validação

- Versão candidata: `task-ui-cards-filters-calendar-2026.11.02.1`.
- Base de produção: `fcf71bda4bac0d06eef3bce97813a4e8e881bc91`.
- Estado: implementação e composição isolada preparadas; publicação desta revisão aprovada pelo usuário em 2026-11-02; publicação e verificação em andamento.
- Escopo: primeira entrega do plano de UX, com cartões em modal e revisão visual do calendário. Sem alterações em banco, permissões, OAuth, infraestrutura ou custo.

## Alterações

Criação e edição compartilham TaskCardDialog, com semântica nativa de modal, página subjacente inerte, fechamento por Escape quando não há envio, foco no título e retorno ao acionador. Título do cartão e prévia do calendário abrem o modal. Concluídas são consultáveis sem edição; itens Google permanecem somente leitura, com edição separada das tags locais. O rascunho de criação permanece ao cancelar. Edição cancelada é descartada, como antes.

Tags têm pesquisa no catálogo inteiro do escopo permitido, múltipla seleção, chips removíveis e criação explícita ao salvar a tarefa. Serialização JSON preserva nomes que contêm vírgulas; o parser continua aceitando formulários legados por vírgulas. Limite de 10 tags e regras de privacidade do servidor permanecem aplicáveis. Ao mudar visibilidade, o fluxo atual exige remover vínculos incompatíveis e salvar antes de selecionar tags do outro escopo.

Catálogo acessível pela barra da página, com pesquisa e grupos Da casa/Somente eu. Renomeação e exclusão têm ações próprias; excluir exige uma confirmação separada e informa que as tarefas serão mantidas.

Filtros em painel modal responsivo, chips removíveis, pesquisa de tags/listas/calendários e atalhos Hoje/Atrasadas/Minhas. Alternar Qualquer uma/Todas preserva tags selecionadas; limpar preserva ordenação e visualização. Os filtros continuam em memória; tags homônimas continuam filtradas por nome, abrangendo os escopos visíveis, conforme contrato existente.

Calendário com linhas compartilhadas, marcador circular para hoje, seleção independente, símbolos para tarefa/concluída/compromisso, prévias de itens no tablet/desktop e lista do dia lateral no desktop. No mobile, sete colunas e contagens com seleção do dia. Os previews abrem cartões; +N mais mantém a lista completa do dia acessível. Contagens consideram o intervalo da grade, sem duplicar eventos de vários dias; itens sem data são contados separadamente. Resultados Google parciais têm contagem identificada.

## Verificações realizadas

- Suíte web da composição isolada: 82 testes passaram; no workspace com alterações anteriores de Ajustes, 84 passaram. A composição isolada mantém Ajustes e styles.css de produção.
- TypeScript, lint dos arquivos alterados e build/PWA aprovados. Bundle mantém aviso existente de tamanho acima de 500 kB; build isolado com JavaScript em torno de 659 kB antes de gzip.
- Testes incluem edição por título do cartão, recorrência, rascunho de criação, geração Google, seleção de catálogo além das primeiras 12 opções, nome com vírgula, preservação de seleção/ordenação, preview pendente desabilitado e confirmação de exclusão.
- Contraste calculado nas novas combinações opacas: texto principal 10,36:1 ou mais, texto secundário 6,16:1, texto claro sobre verde 13,21:1; bordas de controles 3,36:1. Não representa auditoria de todas as superfícies translúcidas do aplicativo.
- Revisão de segurança distinta corrigiu dois pontos: bloqueio de tarefas pendentes também no calendário e serialização sem perdas de nomes de tags. Revisão posterior sem bloqueadores identificados; revisor não reexecutou testes.
- Inspeção no navegador com dados fictícios em 360 × 800, 768 × 1024, notebook medido em 1367 × 768 e 1920 × 1080. A escala do navegador/Windows impediu obter exatamente 1366 px pelo controle disponível; o notebook foi conferido com diferença de 1 px.
- Sem overflow horizontal da página nos tamanhos medidos. Área dos dias no mobile compacto: 44 px de largura e 74 px de altura, inclusive com barra de rolagem. Modal com campos roláveis e cabeçalho/rodapé fixos no seu container; foco inicial no título e retorno ao acionador observados. A navegação Tab/Shift+Tab usa contenção explícita no modal, complementando a semântica nativa; Escape respeita o bloqueio de envio.
- Fluxos manuais sintéticos: criação com múltiplas tags e tag nova, seleção e remoção individual de filtro, troca do modo de correspondência mantendo seleção e abertura/edição de tarefa pela grade do calendário.

## Pendências explícitas

Publicar e verificar versão/disponibilidade na URL de produção após aprovação. Não foram feitos testes com dados Google reais, aparelho físico, Safari/iOS, leitor de tela, texto ampliado ou simulação visual sem blur. O uso de cores mantém rótulos e símbolos; auditoria completa de acessibilidade permanece fora desta validação.

Cores personalizadas de tags e visões pessoais persistidas permanecem nas próximas etapas do plano: exigem definir armazenamento/identidade para tags locais Google e contratos com isolamento por usuário. Esta revisão usa os comandos, catálogos e escopos existentes e não implementa essas duas funcionalidades futuras.

## Referências

- [Plano de UX](../product/task-management-ux-review.md).
- [Google Calendar: personalização e cores](https://support.google.com/a/users/answer/9323423?hl=en).
- [Google Calendar: aparência e densidade](https://support.google.com/calendar/answer/15619910?hl=en).
- [Trello: etiquetas](https://support.atlassian.com/trello/docs/adding-labels-to-cards/).
- [Trello: filtros](https://support.atlassian.com/trello/docs/filtering-for-cards-on-a-board/).

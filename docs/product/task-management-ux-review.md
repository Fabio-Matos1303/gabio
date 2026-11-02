# Avaliação de UX da gestão de tarefas

Data: 2026-11-02. Status: primeira etapa implementada, com cartões em modal e revisão visual do calendário; publicação desta revisão pendente. Cores personalizadas e visões persistidas continuam propostas. Veja [a validação](../operations/task-management-ui-validation.md).

## Base e limites

Comparação da documentação oficial atual do Trello com os componentes TaskViews, TaskTagFields, TagManager e as regras de seleção do Gabio. Esta avaliação não é uma nova inspeção visual da sessão autenticada nem um teste de usabilidade com pessoas.

Referências:

- https://support.atlassian.com/trello/docs/adding-labels-to-cards/
- https://support.atlassian.com/trello/docs/filtering-for-cards-on-a-board/

O Trello aproxima a edição de etiquetas do cartão, permite nome e cor e oferece um menu de filtros com combinação de critérios, limpeza e continuidade entre visões. As recomendações abaixo adaptam esses padrões à gestão residencial do Gabio e ao seu design system.

## Diagnóstico

- A entrada por vírgulas exige conhecer a sintaxe; sugestões limitadas às primeiras 12 não substituem busca no catálogo completo.
- O catálogo fica após o quadro/calendário, separado do momento de aplicar uma tag.
- Renomear e excluir compartilham formulário e o botão genérico Aplicar alteração. A exclusão precisa de uma ação própria, com efeito explícito.
- As tags têm a mesma aparência e os filtros não distinguem visualmente nomes iguais de escopos diferentes. Atualmente a seleção usa nomes, não identidades de catálogo.
- A barra reúne troca de visão, busca, cinco atalhos, filtros, ordenação e contagem. Há oportunidade de reduzir a altura e destacar as tarefas no mobile.
- Os filtros ativos são resumidos por contagem, sem remoção individual visível fora do painel.
- As listas de tags, origens e calendários crescem sem busca própria.
- O estado fica em memória: trocar Kanban/Calendário preserva a seleção, sair da tela a descarta.
- Compromissos passam pela seleção e depois são omitidos no Kanban; por isso alguns critérios podem parecer sem efeito. A contagem do calendário também não representa necessariamente somente a grade visível.

## Proposta

### Seleção e gestão de tags

Um seletor reutilizável em criação, edição e Google Tasks: tags selecionadas como chips removíveis, campo Buscar ou criar tag, lista completa pesquisável com checkboxes, marca de seleção e escopo. Sem exigir vírgulas. Criar deve ser ação explícita e reutilizar a normalização/validação do servidor.

Adicionar acesso Gerenciar tags no próprio seletor e no menu da página. Catálogo com busca, separação Da casa/Somente eu e ações individuais Renomear e Excluir. A confirmação de exclusão informa que remove os vínculos do escopo e não exclui tarefas. Não mostrar contagem de uso como total se a consulta cobrir apenas parte dos itens.

Em etapa posterior, permitir uma pequena paleta opcional e semântica neutra, com nome sempre legível. Cor de tag não representa prazo, status ou visibilidade. Cor exige mudança incremental de schema, contratos e segurança; a primeira etapa funciona sem ela.

### Filtros

Barra principal com visão, busca, Filtros com quantidade e Ordenar. Atalhos de maior uso: Minhas, Hoje e Atrasadas, com o alcance Gabio indicado onde se aplica. Demais opções no painel.

Desktop: painel ancorado com altura limitada. Mobile: painel modal com rolagem interna, total de resultados e ação Mostrar resultados acessíveis, sem cobrir ações com a ilha. Aplicação imediata com confirmação de fechamento; fechar não desfaz seleções. Foco gerenciado e retorno ao acionador.

Fora do painel, chips removíveis de critérios ativos e Limpar filtros. Dentro: grupos Responsável, Período, Status, Tags, Origem e Mais opções. Busca no catálogo e nas listas/calendários. Explicar por exemplo: Eu + Hoje + Casa ou Compras.

Entre grupos usar E; dentro da seleção de tags usar Qualquer uma por padrão e Todas como opção. Sem tags é modo exclusivo. Mudar Qualquer uma/Todas preserva seleção. Desmarcar todas as origens deve ter estado explícito, sem parecer que a coleção está vazia por falta de dados.

Manter ordenação separada dos filtros; Limpar filtros preserva ordenação e visão. Informar o que a ordem altera: cartões de cada coluna ou lista do dia, sem mudar a posição dos dias no calendário.

### Contexto e estados

Tag aplicada à tarefa e tag usada para filtrar têm acionadores distintos e nomes acessíveis claros. Disponibilizar edição rápida de tags, prazo e responsável no menu da tarefa, respeitando a leitura externa.

Contagens refletem os itens efetivamente exibidos: tarefas no Kanban; tarefas/compromissos no intervalo da grade e quantidade do dia selecionado no calendário; Sem data separado. Com resultados Google parciais, informar que as contagens também são parciais.

Mostrar restrições junto ao critério que as produz: Responsável e Atrasadas aplicam-se a tarefas Gabio; eventos não possuem tags de tarefas. Não apresentar ausência de resultados como falha de integração, nem falha como coleção vazia.

## Sequência de entrega

1. Prioridade alta: seletor de tags, gestão contextual, barra compacta, painel responsivo, chips ativos, semântica de limpeza/ordenação e contagens coerentes. Reutilizar comandos e permissões atuais.
2. Prioridade média: cores opcionais, edição rápida e filtros com identidade/escopo explícitos. Definir contrato para tags locais Google, que atualmente não usam o mesmo catálogo. Criar ADR e migrations incrementais quando houver alteração persistente.
3. Posterior: visões pessoais salvas como Minha semana, pendências da casa e compras. Projetar armazenamento por usuário/residência, sem conteúdo Google, credenciais ou filtros privados em URLs compartilháveis; novas tabelas com RLS e testes positivos/negativos.

## Critérios de aceite

- Aplicar/remover tags sem digitar separadores; encontrar qualquer tag permitida, inclusive fora das primeiras 12.
- Diferenciar remover da tarefa, renomear no catálogo e excluir do catálogo.
- Ver e remover um filtro sem reabrir o painel; preservar filtros ao trocar de visão e preservar ordem ao limpá-los.
- Não misturar catálogos privados/compartilhados nem sugerir escrita em Google Tasks/Agenda.
- Contagens e estados vazios compatíveis com visão, intervalo e leitura parcial.
- Validar primeiro 360 × 800, depois 768 × 1024, 1366 × 768 e 1920 × 1080, com dados fictícios; sem overflow da página, toque mínimo de 44 px, teclado, foco, texto ampliado, contraste e fallback sem blur.
- Medir em teste guiado os fluxos criar/aplicar tag, localizar Eu + Hoje + tag e desfazer um critério. Comparar tempo, erros e necessidade de ajuda com a UI atual antes de afirmar ganho de usabilidade.
- Revisão de segurança distinta para mudanças persistentes e publicação conforme AGENTS.md. A autorização anterior de entrega não é tratada como aprovação de uma futura alteração de permissões ou nova publicação desta proposta.

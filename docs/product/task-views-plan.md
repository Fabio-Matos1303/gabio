# Plano de evolução das visualizações de tarefas

- Data: 2026-11-02.
- Status: desenvolvimento, publicação, permissões e novos escopos OAuth aprovados em 2026-11-02; entrega em publicação.
- Escopo confirmado: avaliar calendário alternável com kanban, filtros e ordenação, reunindo tarefas do Gabio, Google Tasks e eventos do Google Agenda. As três origens foram confirmadas pelo usuário em 2026-11-02.
- A confirmação define o planejamento funcional; novos escopos OAuth e publicação continuam sujeitos a aprovação humana antes da ativação.
- Tags para tarefas incluídas no escopo pelo usuário em 2026-11-02, como parte da primeira entrega planejada.

## Diagnóstico

O quadro atual separa A fazer, Em andamento e Concluídas. A consulta lista tarefas por criação decrescente; não há controles de busca, filtros combináveis ou ordenação escolhida pelo usuário. O contrato já oferece título, status, prazo, responsável, visibilidade, recorrência, criação e atualização. Prioridade, etiquetas, duração e subtarefas exigem novos contratos.

O calendário em `HomeCalendar.tsx` é uma visão de consulta do hub completo e mistura tarefas, compromissos e finanças. O hub não é habilitado pelo MVP de tarefas em produção. Reutilizar conceitos de grade e navegação, extraindo somente o que for compartilhável; não reutilizar as consultas financeiras no módulo de tarefas. Seu cálculo de datas usa o fuso do dispositivo e precisa ser revisto antes de qualquer reaproveitamento.

O ADR-011 define exportação Gabio → Google Agenda com `calendar.app.created`. A implementação local não oferece leitura de Google Tasks ou de calendários pessoais. Não foi consultado o estado da conta Google nem a configuração de produção nesta avaliação.

## Experiência recomendada

Manter a rota `#tarefas`, a navegação atual e a criação em modal. Acrescentar seletor Kanban / Calendário no módulo. Uma visão Lista pode entrar depois, se a densidade do uso justificar.

Ordem no mobile: título e adicionar tarefa; seletor de visualização; busca e botão Filtros com quantidade ativa; chips selecionados e Limpar filtros; conteúdo. Ordenar atua no quadro e nas listas de resultados, não muda a posição cronológica dos dias.

No calendário mensal, preservar as sete colunas sem rolagem horizontal. No mobile compacto, cada dia mostra número e contagem; o toque abre a lista do dia abaixo da grade. No tablet e desktop, exibir títulos conforme espaço e painel do dia ao lado. Dias cheios mostram contagem excedente e acesso à lista completa. Oferecer Hoje, mês anterior/próximo e destaque acessível do dia selecionado.

Tocar uma tarefa abre seus detalhes e as ações permitidas. Adicionar a partir de um dia pode preencher a data no modal, mas o horário deve ser informado/confirmado enquanto o contrato exigir um instante. Não inventar meia-noite. Tarefas sem prazo ficam em seção própria acessível a partir do calendário, com contagem.

Preservar busca, filtros e ordenação ao alternar visualizações. A navegação por mês restringe apenas o calendário; ao voltar ao kanban, mostrar indicação clara de quaisquer filtros de período explicitamente escolhidos. Preferências podem ser lembradas por usuário e residência, com schema, limpeza no logout e sem títulos ou conteúdo de tarefas nos parâmetros da URL.

## Filtros e ordenação

| Controle     | Primeira entrega                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Busca        | Título, sem distinguir maiúsculas/minúsculas ou acentos                                             |
| Status       | A fazer, Em andamento, Concluídas; seleção múltipla                                                 |
| Prazo        | Atrasadas, Hoje, Próximos 7 dias, Sem prazo e intervalo personalizado                               |
| Responsável  | Eu, outro membro autorizado, Sem responsável                                                        |
| Visibilidade | Somente eu / Da casa, sempre dentro do conjunto autorizado                                          |
| Recorrência  | Todas, Recorrentes, Sem repetição                                                                   |
| Tags         | Uma ou mais tags, modo Qualquer uma / Todas e opção Sem tags                                        |
| Origem       | Gabio / Google Tasks / Google Agenda, com lista ou calendário de origem                             |
| Ordenação    | Prazo mais próximo, Prazo mais distante, Criação mais recente, Atualização mais recente, Título A–Z |

Filtros de dimensões diferentes usam E; opções da mesma dimensão usam OU. Presets de prazo são exclusivos entre si; intervalo personalizado substitui o preset. Hoje e próximos sete dias usam datas civis de America/Bahia, incluindo hoje e os seis dias seguintes. Atrasadas inclui somente tarefas ativas cujo instante de prazo já passou. Tarefas concluídas nunca são sinalizadas como atrasadas.

Ordenação por prazo coloca tarefas sem prazo ao final em ambos os sentidos. Desempate determinístico por criação e ID. No kanban, ordenar dentro de cada coluna; no calendário, dentro da lista de cada dia. Estado inicial conserva o quadro atual e sua ordenação por criação, evitando ocultar tarefas existentes silenciosamente.

Presets rápidos recomendados: Hoje, Atrasadas, Próximos 7 dias, Sem responsável. São combinações dos mesmos filtros, sem mecanismo paralelo. Exibir contagem dos resultados e diferenciar ausência de tarefas de ausência de correspondências. Filtros não concedem acesso nem substituem RLS.

## Tags para tarefas

Incluir na primeira entrega, antes dos filtros que dependem delas. Proposta funcional:

- Criar e selecionar múltiplas tags no modal de criação e na edição; exemplos exclusivamente fictícios: Casa, Compras e Manutenção. Sugestões mostram somente o vocabulário autorizado.
- Exibir chips com texto no cartão, nos detalhes e na lista do dia; limitar a exibição compacta e oferecer “+N” com acesso a todas. Cor opcional de uma paleta acessível, sem depender dela para identificar a tag.
- Filtrar por Qualquer uma das tags selecionadas (padrão OU), Todas (E) ou Sem tags. Sem tags é exclusivo das seleções de tags. Combinar com os demais filtros e preservar ao alternar kanban/calendário. Eventos da Agenda ficam fora dos resultados quando um filtro de tags de tarefas estiver ativo; indicar esse alcance no controle.
- Proposta inicial de limites: nome de 1 a 32 caracteres após trim, até 10 tags por tarefa, sem duplicação de vínculo. Normalizar espaços e comparação de nomes sem distinguir caixa, preservando o nome exibido. Validar limites e unicidade no servidor e nos schemas.
- Manter vocabulários separados: tags Da casa para tarefas compartilhadas; tags Somente eu para tarefas privadas. Tag privada não aparece em sugestões, contagens ou tarefas de outro membro. Na mudança de visibilidade, exigir revisão das tags incompatíveis, sem promover nomes privados automaticamente.
- Renomear uma tag atualiza sua apresentação nas tarefas autorizadas daquele escopo. Remover o vínculo não apaga a tag; excluir a tag exige confirmação e remove os vínculos sem apagar tarefas. Gestão de tags compartilhadas fica restrita aos membros ativos da mesma residência e é auditável.
- Copiar as tags compatíveis ao gerar a próxima ocorrência recorrente, na mesma transação idempotente da conclusão; não criar novas tarefas para antecipar tags no calendário.
- Em Google Tasks, permitir tags locais privadas vinculadas à identidade externa estável, após aprovação do contrato de integração. Elas organizam a visualização no Gabio e não alteram o item Google nem exigem escrita externa. Não oferecer tags para eventos da Agenda nesta entrega. Revogação/desconexão segue a política de expurgo das anotações externas, com aviso claro antes de limpeza voluntária.

Implementar catálogo e vínculos com migrations incrementais, RLS e testes positivos/negativos em todas as tabelas novas. Escritas passam por comandos autenticados, validados, idempotentes e auditáveis, incluindo concorrência e autorização do vínculo tarefa/tag; IDs fornecidos pelo cliente nunca autorizam acesso. Registrar ADR para o modelo, as regras de visibilidade e as anotações externas antes da implementação. Atualizar contratos, projeção de comandos pendentes e snapshots com compatibilidade para tarefas antigas sem tags.

## Integração Google: três origens confirmadas

O calendário reúne as três origens, com filtros independentes Gabio / Google Tasks / Google Agenda e seleção das listas e calendários autorizados. A leitura externa faz parte do escopo planejado; pode ser entregue em etapas técnicas após a base de visualização. Eventos aparecem somente no calendário; o kanban reúne tarefas, respeitando as limitações de estado e edição das fontes externas. Permitir ocultar qualquer origem sem desconectá-la.

Recomenda-se leitura externa inicialmente somente para consulta. Edição ou conclusão de itens Google pelo Gabio não foi solicitada nem aprovada nesta avaliação. Preservar duração, eventos de dia inteiro e fuso dos eventos da Agenda; datas civis do Tasks não ganham um horário artificial. Filtros de responsável e recorrência sem equivalente externo precisam indicar quando se aplicam apenas ao Gabio; itens sem essa informação não devem receber valores inferidos.

### A. Tarefas do Gabio já projetadas no Google Agenda

Usar as tarefas locais autorizadas. A visão calendário independe de nova permissão Google e também inclui tarefas ainda não exportadas ou sem prazo, em suas áreas adequadas. A cópia no Google não vira um segundo item.

### B. Tarefas do Google Tasks

Propor leitura com `tasks.readonly`, mediante aprovação do novo escopo e consentimento individual. Enumerar todas as listas autorizadas e suas páginas; permitir selecionar listas, com opção Todas. Carregar de forma limitada e progressiva, informando se a atualização estiver incompleta. Não chamar uma primeira página de “todas as tarefas”. Definir explicitamente inclusão de concluídas, ocultas, excluídas e atribuídas de Docs/Chat; a API tem parâmetros específicos e nem todas aparecem por padrão.

Primeira versão externa somente para consulta, com origem, lista, estado e link validado para abrir no Google quando disponível. Os estados do Google Tasks são `needsAction` e `completed`; não inferir Em andamento. No quadro unificado, representar `needsAction` em A fazer com identificação da origem, sem habilitar ações locais de edição ou conclusão. O filtro Em andamento retorna apenas tarefas Gabio compatíveis.

O campo `due` da API representa o dia programado, não um prazo com horário. Preservá-lo como data civil, exibindo Data programada; não converter em meia-noite nem sinalizar atraso usando a regra de prazo Gabio. Se necessário, oferecer posteriormente o filtro específico “Data programada passada”. Sem data, o item aparece em Sem data. Não prometer paridade completa com os recursos e horários da interface Google.

Itens externos permanecem privados para o usuário da conexão. Não copiar automaticamente para tarefas compartilhadas da residência nem exportar de volta ao Google. Identidade externa deve incluir usuário/conexão, lista e ID; nunca deduplicar por título ou data. A conexão deve identificar a conta efetivamente autorizada e tratar troca/revogação sem misturar caches.

### C. Eventos pessoais do Google Agenda

É uma extensão adicional à leitura de Tasks. Propor calendários selecionáveis e apenas leitura, com os menores escopos necessários aos endpoints escolhidos, incluindo enumeração dos calendários se usada. Eventos servem de contexto no calendário, com identificação da origem; não viram cartões de tarefa ou pendências. A leitura pessoal exige nova decisão arquitetural e aprovação de permissões.

Suprimir cópias conhecidas das tarefas exportadas usando os vínculos de integração existentes. Não ocultar eventos por semelhança de título/data. Falhas externas não removem nem bloqueiam tarefas Gabio.

## Incrementos adicionais e prioridade

| Prioridade              | Recurso                        | Valor e dependências                                                                                                  |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Alta                    | Presets Hoje/Atrasadas e busca | Encontrar o que requer ação com os campos atuais                                                                      |
| Alta                    | Sem prazo e Sem responsável    | Evitar tarefas esquecidas fora do calendário                                                                          |
| Alta                    | Contagem de pendências por dia | Revelar concentração de tarefas; não chamar isso de capacidade sem duração estimada                                   |
| Alta — primeira entrega | Tags e filtro por tags         | Classificação múltipla das tarefas, com vocabulário e vínculos protegidos por visibilidade                            |
| Média                   | Visualizações salvas pessoais  | Guardar combinações recorrentes após validar os filtros básicos                                                       |
| Média                   | Lista agrupada por dia         | Leitura compacta de próximos itens, especialmente no celular                                                          |
| Média                   | Reagendar pelo calendário      | Primeiro por formulário; arrastar pode vir depois com alternativa por teclado/toque e tratamento explícito do horário |
| Posterior               | Prioridade e subtarefas        | Novos dados, comandos, migrations e regras de autorização; validar necessidade real                                   |
| Posterior               | Blocos de execução e conflitos | Exigem início/fim; prazo não reserva tempo, conforme ADR-011                                                          |

Recorrências futuras merecem cuidado: hoje só a conclusão gera a próxima ocorrência. A primeira versão mostra apenas ocorrências persistidas. Uma previsão futura pode ser proposta depois, identificada como previsão, sem permitir ações, exportação ou contagem como tarefa real. Edição de série, notificações próprias e sincronização bidirecional ficam fora da primeira entrega.

## Plano de execução

1. **Fechar o contrato funcional.** As três origens estão confirmadas. Detalhar regras de datas, seleção de listas/calendários e tratamento de filtros sem equivalente externo. Este documento permanece proposta; registrar ADR antes de alterar o modelo de data civil ou ampliar integração/autoridade de dados.
2. **Entregar tags, busca, filtros e ordenação.** Implementar primeiro contratos, catálogo e vínculos autorizados de tags, incluindo criação/edição, recorrência e compatibilidade dos snapshots. Extrair uma camada testável de seleção das tarefas autorizadas e dos comandos pendentes já projetados. Evitar refatorar outros módulos. Verificar paginação/limites reais da consulta: filtros precisam operar sobre o conjunto completo disponível, com estado explícito se parcial.
3. **Adicionar calendário de tarefas.** Compartilhar o mesmo conjunto e os mesmos detalhes/ações do quadro. Usar America/Bahia explicitamente, manter Sem prazo, estados de erro/vazio/carregamento e ações pendentes bloqueadas conforme contrato atual. Não carregar finanças ou habilitar o hub.
4. **Implementar leitura Google, se escolhida e aprovada.** Definir contratos específicos e uma projeção unificada de leitura, sem forçar eventos ou Google Tasks para dentro de `Task`. Supabase continua autoridade para tarefas Gabio; Google é autoridade para os itens externos exibidos. Adaptador no servidor com timeout, paginação, limites, backoff, minimização, cache privado com validade e expurgo definidos, tokens cifrados e erros sanitizados. Retomar leitura parcial e indicar última atualização. Novas tabelas exigem RLS e testes positivos/negativos desde a criação. Desconexão limpa caches externos; indisponibilidade preserva o núcleo local.
5. **Revisar e validar.** Revisão de segurança por agente distinto da implementação. Verificar isolamento entre usuários/residências, tarefas privadas, troca de conta, escopos negados, revogação, paginação, indisponibilidade e deduplicação conhecida. Testar filtros combinados, ordenação estável, sem data, virada de mês/ano, limites do dia no fuso da residência e não geração indevida de recorrências.
6. **Publicar com autorização e verificar.** Executar checks proporcionais, flags e migrations incrementais se necessárias; publicação exige aprovação humana. Depois do deploy, verificar versão e disponibilidade na URL de produção e comportamento com dados sintéticos em ambiente apropriado. Sem publicação e verificação, a implementação permanece pendente de produção.

## Aceite visual e funcional

- Validar primeiro 360 × 800; depois 768 × 1024, 1366 × 768 e 1920 × 1080.
- Fundo creme liso, seções em vidro discreto, tokens compartilhados e ilha existente, sem novo destino de navegação.
- Sete colunas sem corte, sem rolagem horizontal da página e sem conteúdo oculto pela ilha.
- Toque mínimo de 44 × 44 px, teclado, foco, leitores de tela, contraste, ampliação de texto e fallback sem blur. Diferenciar estados também por texto/forma.
- Trocar de visão preserva filtros; contagens e resultados são consistentes; tarefas sem prazo continuam alcançáveis.
- Validar tags: limites, nomes duplicados, Qualquer uma/Todas/Sem tags, isolamento do catálogo e dos vínculos, mudança de visibilidade, renomeação/exclusão, cópia na recorrência e replay sem duplicações. Sugestões e contagens nunca revelam tags privadas de terceiros.
- Falha Google aparece somente na fonte afetada; nunca se apresenta como “nenhuma tarefa”. Dados antigos devem ser identificados como desatualizados.
- Usar somente dados fictícios em testes, capturas e registros de validação.

## Validação desta avaliação

Foram lidos visão, arquitetura, design system, diretrizes responsivas, ADRs 005, 007, 008, 010, 011 e 013, além do quadro, gateway, contratos e calendário do hub no código local. Foram consultadas as fontes oficiais abaixo. Não foram acessados dados pessoais, conta Google, produção ou interface em execução. Nenhum teste de aplicação ou viewport foi executado porque esta entrega é planejamento; não houve alteração de código funcional, permissões ou deploy.

## Fontes oficiais consultadas em 2026-11-02

- [Escopos do Google Calendar](https://developers.google.com/workspace/calendar/api/auth).
- [Recurso Task e semântica de datas/estados](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks).
- [Paginação e opções de tasks.list](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list).
- [Enumeração das listas e escopos](https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists/list).

# Plano de adequação da tela inicial

- Data: 2026-10-31.
- Status: implementação local validada; pendente de publicação.
- Referências: [design system](design-system.md), [diretrizes responsivas](ui-guidelines.md) e [ADR-008](../architecture/decisions/008-module-pages-and-home-hub.md).

## Objetivo e escopo

Adequar o hub autenticado `#inicio` ao design clean aprovado: fundo creme liso, títulos funcionais, seções em vidro líquido e ilha inferior com ícones e rótulos. Preservar as informações e a separação entre consulta no início e gestão nos módulos.

O código atual força o MVP de tarefas nos builds de produção (`isTaskMvp` em `App.tsx`). Nesse modo, a entrada continua sendo Tarefas, com navegação para Tarefas e Ajustes. Este plano não habilita o hub nem Finanças em produção. A mudança dessa política seria uma decisão funcional separada. A revisão do hub deve ser demonstrada no modo completo de desenvolvimento com dados fictícios.

A tela de login, os formulários dos módulos e a reorganização do quadro de tarefas ficam fora desta entrega. Cabeçalho e ilha são compartilhados e terão seu novo visual verificado também nas demais páginas.

## Composição proposta

Ordem de leitura no mobile:

1. Cabeçalho compacto com marca Gabio e os controles de conta existentes.
2. Título “Início” e data em texto secundário, sem frase introdutória.
3. Resumo de tarefas em container de vidro: total ativo, distribuição por status e link “Ver tarefas”.
4. Resumo financeiro em container de vidro: resultado do mês, entradas, saídas e link “Ver finanças”.
5. Seção “Agenda” em container de vidro: calendário mensal, navegação entre meses, resumo e itens do dia selecionado.
6. Ilha inferior flutuante, com espaço reservado no conteúdo e respeito à área segura.

No tablet, os resumos ficam lado a lado quando houver espaço para texto e ações. No notebook e desktop, manter largura de leitura limitada, resumos em duas colunas e calendário com painel do dia ao lado da grade. A ilha permanece compacta e centralizada.

O esboço é referência estética. Não substituir o calendário mensal por um único compromisso, acrescentar sino de notificações ou controles de conclusão de tarefas no hub.

## Alterações por área

| Área atual                        | Alteração planejada                                                                                                                                        | Comportamento preservado                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Cabeçalho em `App.tsx`            | Ajustar espaçamento, tipografia e áreas de toque; manter marca discreta e controles de conta legíveis                                                      | Acesso aos ajustes, identificação da residência e saída da conta                          |
| Introdução “Visão da casa”        | Usar “Início”, reduzir título para 28–32 px em sans-serif e remover o parágrafo introdutório                                                               | Data atual                                                                                |
| Indicadores em `HomeInsights.tsx` | Aplicar superfície de vidro compartilhada, títulos diretos, números legíveis e divisores leves; remover rótulos ornamentais e fundos de minicards internos | Contagens por status, totais e cálculos financeiros existentes                            |
| Gráficos dos indicadores          | Preservar a distribuição de tarefas e o histórico financeiro; adequar cores, rótulos, legendas e alternativas textuais acessíveis                          | Período de seis meses e significado dos valores                                           |
| Calendário em `HomeCalendar.tsx`  | Título “Agenda”, mês em posição secundária, vidro no container externo e painel do dia sem outro card de vidro aninhado                                    | Sete colunas, seleção de data, mês anterior/próximo, Hoje, resumo, itens do dia e legenda |
| Navegação inferior em `App.tsx`   | Cápsula de referência de 68 px, ícones consistentes com rótulos, seleção sálvia e `aria-current`                                                           | Fragmentos de URL e destinos habilitados em cada modo                                     |
| Estilos em `styles.css`           | Centralizar tokens, material de vidro, espaçamentos, tipografia e foco; substituir regras das áreas tocadas em vez de acumular sobrescritas                | Layout e comportamento dos módulos fora do escopo                                         |

## Sequência de implementação

1. **Base visual:** introduzir os tokens do design system e um estilo compartilhado de superfície de vidro. Aplicá-lo primeiro ao hub e à ilha, com fallback opaco. Evitar mudar globalmente todos os componentes sem necessidade.
2. **Estrutura:** ajustar cabeçalho e introdução, hierarquia semântica e layout responsivo do hub. Preservar a montagem das páginas visitadas e o estado ao navegar.
3. **Indicadores:** adequar os dois containers e sua apresentação interna, mantendo fontes de dados, períodos e cálculos. Exibir carregamento, erro e ausência de dados sem apresentar zeros como informação confirmada durante uma falha de consulta.
4. **Agenda:** aplicar o novo material e hierarquia ao calendário, simplificar superfícies internas e manter todos os controles e informações existentes.
5. **Ilha:** adicionar ícones e estado acessível de seleção, ajustar largura para dois ou quatro destinos e reservar altura inferior suficiente. Reutilizar a mesma família de ícones, sem nova dependência apenas para este desenho.
6. **Validação:** executar os checks técnicos e a revisão visual com dados sintéticos; corrigir regressões de layout e navegação antes de preparar a publicação.

Usar os gateways existentes. Não introduzir nova API, permissões, esquema de dados, dependência de IA ou migração. A revisão de segurança da implementação deve ser feita por agente distinto, conforme `AGENTS.md`, com foco na preservação das fronteiras de dados e na ausência de consultas a módulos desabilitados.

## Estados e acessibilidade

- Representar carregamento, vazio e falha em indicadores e agenda com texto funcional, sem slogans.
- Garantir contraste do texto sobre o vidro composto com o fundo real; aumentar a opacidade quando necessário.
- Manter foco visível, navegação por teclado e nomes acessíveis dos controles. Ícones decorativos não repetem o rótulo para leitores de tela.
- Respeitar movimento e transparência reduzidos, usar fallback sem `backdrop-filter` e manter a interface utilizável sem esses efeitos.
- Na grade mensal, validar o espaço disponível para as sete colunas e áreas de toque, sem sobrepor células ou cortar o calendário.

## Validação e aceite

- Verificar 360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080, além de ampliação de texto. Registrar capturas somente com dados fictícios.
- Confirmar ausência de rolagem horizontal, conteúdo cortado e ações encobertas pela ilha; testar rótulos longos e a última linha da agenda.
- Conferir fundo liso, títulos em sans-serif, containers uniformes, ausência de slogans e material de vidro discreto, usando o esboço aprovado como referência.
- Testar teclado, foco, contraste, seleção de aba e fallback opaco. Verificar áreas de toque de pelo menos 44 × 44 px nos controles primários.
- Atualizar os testes semânticos afetados pela mudança de título e rótulos. Preservar regressões de navegação mensal, seleção de dia, links dos módulos e manutenção de estado entre páginas.
- Verificar os dois modos: hub no modo completo e entrada em Tarefas no MVP, sem consultas financeiras ou de agenda introduzidas pelo novo cabeçalho/ilha no MVP.
- Usar testes para comportamentos relevantes, não para espelhar valores de CSS. Executar os checks do repositório proporcionais à implementação, incluindo formatação, lint, tipos, testes e build, e relatar bloqueios reais do ambiente.
- Após aprovação humana para publicação, verificar versão e disponibilidade na URL de produção. Enquanto o hub permanecer desabilitado nesse ambiente, informar essa limitação; um preview do hub não representa sua disponibilização em produção.

## Resultado esperado

Um hub com a mesma função e informação atuais, apresentado segundo o design system aprovado. A implementação local segue este plano, com registro de validação em [verificação do redesign](../operations/home-design-validation.md). A publicação permanece pendente.

# Plano de movimento e evolução do vidro líquido

- Data: 2026-11-03.
- Status: desenvolvimento iniciado e primeira etapa implementada e validada localmente; pendente de publicação.
- Base: [design system](design-system.md), [diretrizes responsivas](ui-guidelines.md), ADR-008 e ADR-014.

## Objetivo

Dar continuidade visual às ações do Gabio: perceber de onde uma superfície veio, qual controle respondeu e o que mudou no conteúdo. Usar o iOS como referência de resposta ao toque, transições e hierarquia de materiais, adaptando esses princípios à PWA e à identidade aprovada.

Preservar fundo creme liso, verde escuro, superfícies leitosas, legibilidade e navegação em ilha. O movimento deve aparecer durante a interação; a interface em repouso permanece tranquila.

## Diagnóstico do código local

- `styles.css` já centraliza material, borda, sombra, blur e fallback opaco. Há poucas transições, principalmente de cor; falta um vocabulário compartilhado de movimento.
- `BottomNavigation.tsx` aplica seleção por `aria-current`, sem uma superfície de seleção que se desloque entre destinos.
- `TaskCardDialog.tsx` usa `showModal()` e fechamento imediato no cleanup. A entrada e, especialmente, a saída precisam de um ciclo explícito para poderem ser animadas com segurança.
- `task-creation.css` já apresenta os diálogos como folha inferior no mobile e permite aproveitar essa hierarquia sem redesenhar os formulários.
- A regra global de movimento reduzido remove transições e rolagem suave, mas precisa contemplar também eventuais animações CSS e JavaScript.
- O MVP de produção mantém Tarefas e Ajustes. Início e Finanças devem receber os padrões compartilhados apenas no modo completo já existente, sem habilitar módulos.

Diagnóstico por leitura dos fontes locais, que contêm alterações em andamento. Não representa inspeção visual da versão publicada.

## Direção inspirada no iOS

A Apple trata aparência e movimento do Liquid Glass como partes de uma mesma experiência: controles respondem à interação, e transições ajudam a manter a relação entre origem e destino. No Gabio, traduzir isso em resposta imediata, acomodação suave e continuidade de superfícies.

Dar maior expressão ao vidro da ilha e dos controles flutuantes. Preservar as seções leitosas previstas pelo design system, com comportamento mais discreto. Não acrescentar refração sobre texto, brilhos em loop, parallax ou fundos decorativos para tornar o vidro evidente. A reprodução óptica nativa do iOS não é requisito da PWA.

## Comportamentos propostos

Os tempos e amplitudes abaixo são valores iniciais de projeto do Gabio, não especificações oficiais da Apple. Ajustar após experimentar no mobile compacto.

| Interação                               | Comportamento                                                                                                                                                   | Faixa inicial                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Pressionar botão ou item da ilha        | Compressão breve de até 2% e recuperação suave ao soltar; cancelar ao abandonar o toque. Foco continua visível.                                                 | 90–140 ms na pressão; 160–220 ms no retorno |
| Trocar destino na ilha                  | Uma única cápsula sálvia desliza e ajusta a largura ao destino. Ícone e rótulo permanecem legíveis e imóveis.                                                   | 240–320 ms                                  |
| Trocar página principal                 | Ilha e cabeçalho permanecem estáveis; conteúdo faz transição curta de opacidade, com deslocamento de até 8 px. Evitar deslizar a tela inteira entre abas irmãs. | 180–240 ms                                  |
| Abrir diálogo no mobile                 | Folha sobe da borda inferior com desaceleração suave; backdrop acompanha. Sem quique perceptível em texto ou campos.                                            | 280–360 ms                                  |
| Abrir diálogo no tablet/desktop         | Superfície central aparece com escala de 0,98 a 1 e opacidade; preservar dimensões e pontos de quebra existentes.                                               | 220–280 ms                                  |
| Fechar diálogo                          | Percurso inverso mais curto; restaurar foco e liberar rolagem ao encerrar, com fallback se a animação for cancelada.                                            | 160–220 ms                                  |
| Alternar quadro/calendário e filtros    | Seleção responde imediatamente; conteúdo faz substituição breve sem animar cada item nem remontar formulários.                                                  | 160–220 ms                                  |
| Navegar entre meses                     | Transição curta e direcional somente na região do calendário, sem alterar a altura da página ou deslocar controles.                                             | 180–240 ms                                  |
| Alterar status ou concluir tarefa       | Atualizar o indicador e acomodar os itens afetados, preservando identidade e foco. Associar movimento ao estado que o fluxo já considera válido.                | 180–260 ms                                  |
| Expandir detalhes e apresentar feedback | Revelação localizada, sem deslocamentos extensos; mensagens de erro e confirmações ficam disponíveis imediatamente.                                             | 140–220 ms                                  |

Evitar animação em cascata de cards a cada carregamento, contadores financeiros rodando e animações de sucesso que antecipem a confirmação do fluxo. Atualizações de rede em segundo plano não devem reiniciar a apresentação da tela.

## Material e resposta à interação

- Manter os tokens atuais como base. Experimentar primeiro contraste de contorno, brilho interno estático e elevação discreta da ilha, antes de aumentar o blur.
- Concentrar a sensação de elasticidade no indicador da ilha e no retorno dos controles. Não deformar texto nem a área real de toque.
- No mouse, usar hover leve apenas em dispositivos com hover e ponteiro preciso; no toque, priorizar pressão. Teclado recebe seleção e foco igualmente claros.
- Não animar `backdrop-filter` continuamente nem empilhar novas camadas de vidro em linhas e campos. Se necessário, aplicar realce a uma camada decorativa sem interceptar eventos.
- Preservar contraste de 4,5:1 para texto normal e 3:1 para texto grande e indicadores essenciais durante a interação, além de fallback opaco.

## Implementação planejada

1. **Fundação:** centralizar tokens de duração, curva, distância e escala; adotar curvas de desaceleração suaves e uma curva de acomodação para o indicador. Documentar os padrões no design system durante a implementação.
2. **Primeira fatia:** aplicar resposta aos controles, seleção móvel na ilha e entrada/saída em `TaskCardDialog`. Validar essa combinação no fluxo Tarefas → criar → cancelar → Ajustes antes de ampliar a cobertura.
3. **Continuidade do conteúdo:** integrar transições de rota em `App.tsx` e mudanças de visualização em `TaskViews.tsx`. Preservar fragmentos, histórico, rascunhos, seleção, filtros e políticas atuais de montagem/desmontagem e cache.
4. **Mudanças locais:** tratar calendário, detalhes, status e feedback, reutilizando os mesmos padrões. Aplicar nos módulos do modo completo sem habilitá-los no MVP.
5. **Revisão e preparação da entrega:** executar os checks e a matriz visual; submeter a implementação à revisão de segurança por agente distinto, conforme `AGENTS.md`. Publicação depende de autorização humana; depois dela, verificar versão e disponibilidade na URL de produção.

Começar com CSS e APIs nativas do navegador. Usar Web Animations API somente onde controle de cancelamento e continuidade justificar. Não adicionar biblioteca de animação nesta proposta. Uma dependência ou mudança arquitetural duradoura exige avaliação própria e ADR quando aplicável.

Priorizar `transform` e `opacity`, sem `transition: all`. Usar animação de layout somente em grupos limitados e quando necessária, medindo seu custo. Não manter `will-change` em todos os cards.

O fechamento animado de diálogos deve separar intenção de fechar, estado visual de saída e encerramento efetivo. Escape, botão fechar, navegação, desmontagem e movimento reduzido precisam convergir para uma finalização garantida. Não depender exclusivamente de `animationend` para liberar foco, backdrop ou rolagem.

Mudanças rápidas devem cancelar ou redirecionar o movimento em curso, sem enfileirar animações ou bloquear cliques. Usar fallback imediato quando um recurso não estiver disponível. A animação nunca dispara comandos, chamadas externas ou efeitos de negócio.

Não prolongar a presença de conteúdo privado para animar saídas após logout, troca de identidade ou perda de autorização. Essas transições descartam o conteúdo imediatamente. Não conservar telas externas desmontadas apenas para obter continuidade visual, respeitando o ADR-014.

## Acessibilidade e desempenho

- Com `prefers-reduced-motion: reduce`, remover deslocamento, escala, elasticidade e animação de layout; mudanças de estado ficam imediatas. Contemplar CSS e JavaScript, inclusive mudança da preferência durante o uso.
- Respeitar transparência reduzida onde suportada, cores forçadas e ausência de `backdrop-filter`.
- Manter áreas de toque de pelo menos 44 × 44 px, nomes acessíveis, `aria-current`, ordem de leitura e gestão de foco. Camadas de saída não podem duplicar conteúdo interativo ou anúncios de leitores de tela.
- Carregamentos e falhas continuam explícitos em texto; nenhuma informação depende do movimento. Não atrasar anúncio de erro ou validação para esperar uma transição.
- Buscar fluidez de 60 fps em dispositivo móvel representativo, verificando frames perdidos e trabalho da thread principal. Se o vidro custar fluidez, simplificar o efeito e preservar o conteúdo.

## Validação e aceite

Validar primeiro 360 × 800, depois 768 × 1024, 1366 × 768 e 1920 × 1080. Em cada viewport, conferir toque, ausência de rolagem horizontal e ações encobertas, safe area, diálogos com teclado virtual e conteúdo longo. Verificar ampliação de texto, teclado, foco, contraste e estados vazio, carregando e erro.

Cobrir Chrome/Android e Windows como ambientes do produto; Safari/iOS como verificação complementar da referência quando houver acesso. Registrar dispositivos efetivamente usados, sem equiparar emulação a aparelho físico.

Usar dados sintéticos em capturas e gravações. Registrar vídeos curtos do fluxo principal com movimento normal e reduzido, pois imagens estáticas não demonstram a qualidade da transição.

Testar comportamentos relevantes: navegação rápida e histórico; abrir/fechar/reabrir diálogo; Escape; foco restaurado; rascunho preservado; cancelamento durante saída; atualização de lista sem comandos duplicados; descarte imediato na saída da sessão. Executar formatação, lint, tipos, testes e build proporcionais aos arquivos alterados. Não escrever testes que apenas repitam durações e valores CSS.

Aceitar quando as principais interações apresentarem continuidade perceptível, responderem sem esperar a animação anterior e mantiverem legibilidade e operação completas com efeitos reduzidos. Registrar falhas e limitações antes de preparar publicação.

## Referências e limites desta etapa

- [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion).
- [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials).
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/), especialmente Dynamics e Principles.

O planejamento foi baseado nos documentos do produto, ADRs pertinentes, fontes locais dos componentes e estilos e referências oficiais da Apple. Após autorização para iniciar o desenvolvimento, foram implementados tokens, resposta aos controles, indicador da ilha, diálogos, entrada de páginas e transições localizadas de visualização, mês e dia selecionado. O comportamento atual dos diálogos distingue fechamento explícito pelo usuário (animado) de encerramentos controlados e descarte de dados (imediatos).

O registro de [validação da primeira etapa](../operations/motion-ui-validation.md) informa os checks e limites. Acomodação de listas após mudanças de status, expansão de detalhes e calibração de desempenho em aparelhos físicos seguem como evolução do plano. Não houve publicação desta alteração em produção.

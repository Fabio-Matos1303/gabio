# Validação da primeira etapa de movimento

- Data: 2026-11-03 (America/Bahia).
- Estado: implementação local para avaliação; sem deploy, versão ou disponibilidade desta alteração verificadas em produção.
- Referência: [plano de movimento](../product/motion-design-plan.md).

## Escopo implementado

- Tokens de movimento compartilhados, pressão dos controles e indicador deslizante da ilha, mantendo rótulos, seleção acessível e destinos do modo vigente.
- Entrada dos conteúdos de rota sem remontar os módulos já visitados.
- Entrada dos diálogos como folha móvel e superfície central em telas maiores. Saída animada nos controles explícitos de fechamento/cancelamento; finalização garantida por evento de animação e timeout, com cancelamento e restauração de foco e rolagem.
- Encerramento imediato por alteração controlada de `open`, desmontagem ou troca de fragmento. Não conservar diálogos privados para animar logout/invalidação. Fechar apresentação não cancela nem duplica uma operação em andamento.
- Transições locais entre kanban/calendário, meses e dia selecionado, com cancelamento da Web Animations API em nova transição, desmontagem e mudança da preferência de movimento.
- Ajuste de quebra do cabeçalho de tarefas para impedir transbordamento observado com texto a 200%.

Sem alterações de backend, schemas, RLS, dados persistidos, OAuth, integrações ou dependências de animação. As dependências locais foram reinstaladas a partir do lockfile porque havia links incompatíveis com o host Windows; nenhuma atualização de versão foi solicitada.

## Checks executados

- Formatação dos arquivos desta etapa e lint dos fontes TypeScript alterados: passaram. `git diff --check` sem erros de whitespace.
- Tipos do frontend: passou.
- Build de produção da PWA: passou; o empacotador emitiu aviso de chunk JavaScript acima de 500 kB. Não foi adicionado pacote de animação.
- Testes do frontend: 109 testes, 12 arquivos, passaram. Incluem seis casos novos de ciclo de diálogos e dois de transições de conteúdo: finalização única, fallback, limpeza na desmontagem, rota durante saída, movimento reduzido dinâmico, locks compartilhados, bloqueio de fechamento ocupado, cancelamento de transições e preservação do DOM.
- Um teste existente de conexão do Telegram precisava esperar o botão ficar habilitado após sua consulta inicial; foi corrigida a sincronização do teste, sem alterar o fluxo do Telegram. A execução anterior clicava durante o carregamento e falhava.
- Revisão de segurança por agente distinto: aprovada após corrigir fechamento por rota e dimensionamento da ilha com texto ampliado. A revisão foi de código e testes; a validação de navegador foi feita pelo agente de implementação.

## Validação de navegador

Usado Chromium headless 151 com viewport emulado e dados exclusivamente sintéticos da prévia local, sem conexão com produção. Não equivale a teste em aparelho físico.

| Viewport    | Verificação                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| 360 × 800   | Tarefas, Ajustes, calendário, folha inferior, abertura/saída, foco e rascunho; sem rolagem horizontal na página |
| 768 × 1024  | Mesmos fluxos; diálogo central dentro dos limites da tela                                                       |
| 1366 × 768  | Mesmos fluxos; diálogo central dentro dos limites da tela                                                       |
| 1920 × 1080 | Mesmos fluxos; diálogo central e ilha compacta                                                                  |

Também foram verificados:

- Alinhamento do indicador com a aba ativa e áreas dos destinos de pelo menos 44 × 44 px nos quatro viewports.
- Reabrir diálogo com rascunho preservado; fechar por Escape; foco devolvido ao acionador; rolagem liberada após fechar; troca de rota com modal aberto e preferência de movimento alterada durante a saída.
- Movimento reduzido desde o carregamento; entrada dos diálogos sem animação. Teclado Tab/Shift+Tab permanece dentro do diálogo.
- Transparência reduzida emulada: `backdrop-filter: none` e fundo opaco `rgb(250, 248, 242)` no diálogo. Cores forçadas também foram renderizadas.
- Texto a 200% em 360 px no MVP e na navegação completa de desenvolvimento. Na ilha de quatro destinos: largura de 328 px, limite direito de 344 px e página com `scrollWidth` de 360 px. O modo completo continua restrito ao desenvolvimento.
- Navegação de mês no hub do modo completo.
- Capturas de Tarefas, Ajustes, calendário e diálogos nos quatro viewports, além de gravações dos fluxos com movimento normal e reduzido. Evidências locais em `test-results/motion/`; o relatório automatizado principal está em `test-results/motion/report.json`.

## Limites e próximas etapas

Não foram realizados testes em Android ou iOS físicos, Safari, leitor de tela, teclado virtual real ou medição de 60 fps em dispositivo móvel. A revisão visual preserva as cores do design system; não foi feita auditoria instrumental completa de contraste em todas as composições transitórias. O fallback opaco foi exercitado por preferência emulada, sem navegador antigo sem suporte a blur.

Reordenação animada de listas após mudança de status e expansão de detalhes permanecem fora desta primeira etapa. Não há alteração de comportamento dos comandos de tarefas.

Publicação requer autorização humana, conforme `AGENTS.md`. Até publicar e verificar versão e disponibilidade na URL de produção, esta entrega permanece pendente de produção.

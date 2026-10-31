# Design system do Gabio

## Status e referência

Direção visual aprovada pelo usuário em 2026-10-31, antes do desenvolvimento da interface. Este documento orienta a implementação futura; seu registro na harness não significa que o visual já esteja implementado ou publicado.

Referência aprovada: [esboço clean com seções em vidro líquido](references/clean-liquid-glass-concept.png). A imagem foi gerada por IA e contém apenas dados fictícios. Ela orienta materiais, hierarquia e composição. As medidas e regras abaixo prevalecem sobre detalhes ilustrativos da imagem.

## Princípios

- Interface limpa, com títulos funcionais, conteúdo útil e ações claras.
- Fundo creme liso, sem fotos, ilustrações de fundo, texturas ou gradientes decorativos.
- Sem slogans, frases de efeito, introduções institucionais ou grandes áreas de apresentação dentro do aplicativo.
- Vidro líquido discreto nos containers das seções e na navegação: superfície leitosa translúcida, contorno claro e sombra leve. A leitura do conteúdo tem prioridade sobre o efeito.
- Verde escuro como cor principal, com verde sálvia suave para seleção. Terracota apenas como acento pontual.
- Espaçamento consistente e pouca ornamentação. Evitar excesso de cards aninhados e de superfícies com blur.

## Tokens de referência

Nomes técnicos em inglês. Estes valores são a base para centralizar variáveis CSS na implementação; o contraste deve ser verificado na composição final.

| Token              | Valor inicial                       | Uso                             |
| ------------------ | ----------------------------------- | ------------------------------- |
| `color-background` | `#f4f1e8`                           | Fundo liso da aplicação         |
| `color-text`       | `#18342a`                           | Texto principal e ícones        |
| `color-text-muted` | `#526158`                           | Texto secundário                |
| `color-accent`     | `#18342a`                           | Ações principais                |
| `color-selection`  | `#dfe7d8`                           | Fundo suave da aba ativa        |
| `color-terracotta` | `#9a5c3f`                           | Acento pontual                  |
| `glass-surface`    | `rgba(255, 255, 255, 0.64)`         | Containers e ilha               |
| `glass-border`     | `rgba(255, 255, 255, 0.85)`         | Contorno de 1 px                |
| `glass-fallback`   | `#faf8f2`                           | Superfície opaca sem blur       |
| `glass-blur`       | `16px`                              | Desfoque moderado da superfície |
| `glass-shadow`     | `0 8px 24px rgba(24, 52, 42, 0.07)` | Elevação discreta               |
| `radius-section`   | `24px`                              | Containers de seção             |
| `radius-control`   | `12px`                              | Botões e campos                 |
| `radius-pill`      | `999px`                             | Ilha e seleção de aba           |
| `space-unit`       | `4px`                               | Escala de espaçamento           |

Usar espaçamentos de 4, 8, 12, 16, 20, 24 e 32 px. No mobile, começar com margens laterais de 16 a 20 px, padding de seção de 20 px e distância entre seções de 16 px. Ajustar responsivamente sem sacrificar o conteúdo.

## Tipografia e conteúdo

- Usar a pilha sans-serif de sistema para a interface, com preferência por `-apple-system`, `BlinkMacSystemFont`, `Segoe UI` e `sans-serif`.
- A marca pode manter sua assinatura própria; não estender o tratamento de marca aos títulos das seções.
- Corpo e campos: 16 px como base; metadados: 14 px; rótulos da ilha: 12 px; títulos de seção: 20 a 24 px; título de página: 28 a 32 px.
- Usar pesos 400, 500 e 600, com títulos em até 700. Evitar títulos gigantes, caixa alta ornamental e texto secundário com contraste baixo.
- Preferir nomes diretos: “Início”, “Tarefas”, “Agenda”, “Finanças” e “Ajustes”. Mensagens devem explicar o estado ou a próxima ação, sem slogans.
- Exemplos e previews usam dados fictícios. A legenda “Dados de exemplo” pertence ao demonstrativo, não à interface autenticada com dados do usuário.

## Containers de seção

- Agrupar cada seção funcional em uma superfície de vidro líquido: resumo, lista de tarefas, agenda e demais seções existentes.
- Aplicar superfície leitosa, borda fina, cantos arredondados e sombra discreta. Não usar fotos ou manchas de cor atrás dos containers para tornar a transparência visível.
- Sobre o fundo liso, um efeito sutil é esperado. Evitar refração que distorça texto, brilhos fortes e aparência de objeto 3D.
- Listas dentro de uma seção usam linhas e divisores leves, sem transformar cada linha em outro card de vidro.
- Manter campos, botões e estados claramente identificáveis. Ações principais podem ter fundo verde sólido com texto claro; não tornar todos os controles translúcidos.
- Usar `backdrop-filter` como aprimoramento progressivo. Se indisponível, ou quando a transparência for reduzida por preferência do usuário, usar a superfície opaca `glass-fallback` sem perder informações ou contraste.

## Ilha de navegação

- Cápsula flutuante inferior inspirada na navegação do Instagram para iOS, adaptada à identidade do Gabio.
- Mesmo material de vidro líquido das seções, extremidades totalmente arredondadas, contorno claro e sombra leve.
- Destinos com ícones simples da mesma família, espessura consistente e rótulos sempre visíveis. Não adicionar dependência externa só para reproduzir a referência.
- Aba ativa com fundo sálvia suave, ícone preenchido quando disponível e `aria-current="page"`. A seleção não pode depender apenas da cor.
- Preservar os destinos e restrições do modo em uso: no produto completo, Início, Tarefas, Finanças e Ajustes; no MVP de tarefas, apenas os destinos já habilitados. Não expor módulos ocultos para imitar as quatro abas do esboço.
- Preservar as rotas por fragmento e a separação entre hub e gestão definidas no ADR-008. Não criar uma aba de agenda apenas porque existe uma seção no esboço.
- Altura de referência de 68 px, largura limitada ao espaço disponível e itens distribuídos uniformemente. Usar área de toque mínima de 44 × 44 px por destino.
- Centralizar a ilha com margens laterais mínimas de 16 px, distância inferior de referência de 16 px mais `env(safe-area-inset-bottom, 0px)` e espaço equivalente reservado no conteúdo para não ocultar a última linha ou ação.
- No tablet e desktop, manter largura compacta e centralizada, sem esticar a cápsula por toda a tela. A referência não exige animações de encolhimento ou novos gestos.

## Acessibilidade e estados

- Garantir contraste mínimo de 4,5:1 para texto normal e 3:1 para texto grande; controles e indicadores essenciais devem ter contraste de 3:1 com o entorno relevante.
- Testar contraste após compor a transparência com o fundo real. Aumentar a opacidade quando necessário.
- Garantir navegação por teclado, foco visível, nomes acessíveis e ordem de leitura coerente. Ícones decorativos não duplicam a leitura do rótulo.
- Definir estados de carregamento, vazio, erro, foco, seleção e desabilitado com mensagens funcionais. Preservar validações e confirmações existentes.
- Respeitar `prefers-reduced-motion` e, onde suportado, `prefers-reduced-transparency`. Não depender de animação ou transparência para comunicar estado.
- Permitir ampliação de texto e quebra de conteúdo sem corte de rótulos ou perda de ações.

## Critérios de aceite para desenvolvimento

O [plano de adequação da tela inicial](home-redesign-plan.md) detalha a primeira aplicação deste padrão ao hub existente.

- Ler este documento e as [diretrizes responsivas](ui-guidelines.md) antes de alterar a UI.
- Centralizar os tokens e reutilizar componentes ou estilos compartilhados, evitando variantes independentes por tela.
- Verificar fundo liso, ausência de slogans e imagens decorativas, seções em vidro discreto e ilha com ícones e rótulos.
- Preservar regras de negócio, privacidade, módulos habilitados, rotas e funcionalidades existentes. A referência não autoriza criar notificações ou outras funcionalidades sugeridas apenas pela imagem.
- Validar os quatro viewports das diretrizes responsivas, toque, teclado, foco, contraste, fallback sem blur e ausência de conteúdo encoberto pela ilha.
- Usar apenas dados fictícios nos registros de validação visual. Informar precisamente os checks executados e os pendentes.
- A implementação visual segue o fluxo de revisão e publicação do `AGENTS.md`; a aprovação deste design não autoriza deploy.

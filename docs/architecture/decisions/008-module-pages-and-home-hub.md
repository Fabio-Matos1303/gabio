# ADR-008: Hub inicial e páginas de gestão por domínio

- Status: aceito
- Data: 2026-09-27

## Contexto

A interface acumulava calendário, tarefas, finanças e configurações em uma única página longa. Essa composição misturava informação para decisão com formulários operacionais, aumentava a rolagem e tornava a navegação inferior pouco significativa.

## Decisão

A PWA passa a separar apresentação e gestão por domínio:

- `#inicio`: hub somente de leitura, com indicadores de tarefas, fluxo financeiro e planejamento mensal;
- `#tarefas`: criação e gestão do quadro de tarefas;
- `#financas`: gestão de contas, categorias, lançamentos, recorrências, parcelamentos e orçamentos;
- `#configuracoes`: residência e perfil, acessível pelo botão do usuário.

A barra inferior permanece disponível em todas as páginas principais. A navegação usa fragmentos de URL para manter compatibilidade com hospedagem estática e recarregamento direto sem configuração adicional de rotas no Cloudflare.

O hub consome apenas projeções autorizadas pelos gateways existentes. Ele não cria uma segunda fonte de verdade e não executa mutações financeiras ou de tarefas.

A agenda permanece no hub inicial, onde contextualiza tarefas e finanças no
tempo. Não existe uma rota dedicada enquanto ela repetir a mesma visualização.

Dentro de finanças, a interface separa lançamentos, cadastros reutilizáveis
(contas e categorias) e planejamento. Receita e despesa são tipos estruturais
do ledger, não cadastros livres; parâmetros descontinuados são arquivados para
preservar o histórico e a auditabilidade.

A página financeira abre em uma visão geral orientada a atenção: entradas,
saídas, resultado, distribuição por categoria, pendências de classificação e
lançamentos recentes. Formulários ficam em seções secundárias. Essa decisão
adota o fluxo de leitura e orientação de assistentes financeiros sem introduzir
Open Finance, aconselhamento automático ou uma nova fonte de verdade.

## Consequências

- Formulários operacionais deixam de aparecer na página inicial.
- Cada domínio pode evoluir seu layout sem aumentar indefinidamente uma única página.
- Os fragmentos podem ser substituídos por rotas convencionais no futuro, caso a hospedagem passe a garantir fallback de SPA.
- Consultas repetidas entre hub e módulos devem ser consolidadas em uma camada de cache/projeção compartilhada em uma evolução posterior.

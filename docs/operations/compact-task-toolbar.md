# Barra compacta de tarefas

Versão candidata: `task-toolbar-compact-2026.11.02.1`. Base de produção: `80515316fac72e4cd30f235364026d4f953a236b`. Publicação desta revisão aprovada pelo usuário em 2026-11-02; envio e verificação em andamento.

## Problema e solução

O print enviado pelo usuário foi inspecionado. Criação expandida, busca, atalhos e ordenação ocupavam a primeira tela sem apresentar cartões.

A criação passa para + Nova no cabeçalho e abre diretamente o cartão. Atualizar tarefas usa ícone com nome acessível. Uma barra reúne Kanban/Calendário, busca, filtros, ordenação e Mais ações. Busca e ordenação abrem modais; filtros rápidos e critérios ativos ficam no painel de filtros. Tags e detalhes/atualização Google ficam em Mais ações. Falhas, parcialidade e consentimento Google continuam com aviso compacto visível; integração desativada não gera alerta de falha. Fila e erros de tarefas permanecem visíveis.

A mudança usa SVGs locais, nomes acessíveis, tooltips e alvos de 44 px. Mantém fundo creme, superfícies do design system e navegação inferior. O quadro tem largura contida, com rolagem entre colunas dentro do próprio quadro no mobile.

Sem alterações de banco, permissões, escopos, integrações ou custos. Conteúdo Google continua apenas em memória e os guardas de geração/conta não foram alterados.

## Validação

- Composição isolada sobre a versão publicada, preservando alterações locais anteriores de Ajustes/styles.css. 83 testes web aprovados, lint dos arquivos alterados, TypeScript e build/PWA aprovados. O bundle mantém o aviso de tamanho superior a 500 kB (aproximadamente 662 kB antes de gzip).
- Revisão de segurança por agente distinto sem bloqueadores; guardas de geração Google, tarefas pendentes, catálogo por escopo e fila preservados. O revisor não executou testes nesta rodada.
- Prévia com dados fictícios em mobile 360 × 800, tablet medido em 768 × 1025, notebook em 1366 × 767 e desktop 1920 × 1080. Escala do navegador/Windows gerou diferença de 1 px na altura do tablet/notebook em relação às diretrizes; não afirmar validação exata de 768 × 1024 e 1366 × 768.
- No mobile, primeiro cartão começa em y=353 px, incluindo o aviso sintético de aproximadamente 58 px; no aplicativo, cerca de 295 px. Barra ocupa aproximadamente 92 px. Sem rolagem horizontal da página: clientWidth e scrollWidth medidos em 341 px. As seis ferramentas usam alvos nominais de 44 × 44 px (medição fracionária de 43,98 px por arredondamento na escala do host).
- Tablet/notebook/desktop sem overflow horizontal da página; primeiro cartão entre 332 e 336 px com aviso sintético. O calendário preserva sete colunas e acesso à lista do dia.
- Verificados busca com aplicação no quadro, limpeza de critérios, ordenação, abertura de catálogo via Mais ações, retorno de foco ao ícone Mais ações, criação direta pelo cabeçalho e preservação do rascunho. Testes de regressão foram adaptados ao fluxo real dos modais, incluindo sincronização de navegação ao sair de Ajustes.
- Cores dos controles mantêm combinações existentes do design system: texto verde sobre fundo claro, seleção sálvia e bordas #7b8c7d. Nenhuma mudança de tokens de cor. Não foi repetida auditoria completa de contraste, teste físico, Safari/iOS, leitor de tela, texto ampliado ou simulação sem blur.
- Evidência local: test-results/compact-toolbar-mobile.jpg. Publicação aprovada; verificar versão e disponibilidade na URL de produção após o envio.

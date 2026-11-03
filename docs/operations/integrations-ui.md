# Interface de Integrações

Versão candidata: `integrations-ui-2026.11.03.1`. Base de produção: `60b66943009fc8e2a17bb8cd0c04b2b4528dbebc`. Implementação solicitada; publicação desta revisão aprovada pelo usuário em 2026-11-03; envio e verificação em andamento.

## Alterações

Seção Google dividida em Ver no Gabio e Enviar ao Google Agenda. Explicações complementares passam para ajudas contextuais acionáveis por toque, foco e hover, com Escape e fechamento ao sair. Estado da conexão, preferências, fila/falhas e ações permanecem visíveis. Botões mais curtos e consistentes, atualização por ícone nomeado, ação principal verde, secundárias com contorno e desconexão com tratamento de risco.

Avisos sobre tags removidas ao reconectar/desconectar, privacidade do calendário privado, reparo e abandono de limpeza continuam junto às respectivas ações. Marcar leitura prepara um novo consentimento; desmarcar não revoga permissões já concedidas. Os escopos e comandos Google não foram alterados.

A autorização anterior é descartada ao iniciar qualquer nova ação no servidor e seu link não é exibido enquanto há solicitação em andamento. Isso evita continuar uma autorização antiga já invalidada por outra tentativa.

O layout local anterior da integração e sua proteção de rascunhos foram preservados e adaptados ao escopo solicitado. Os estilos novos são restritos a esta seção, sem publicar o arquivo global styles.css nem alterar outros cards de Ajustes.

## Validação

- 90 testes web passaram na composição isolada sobre a versão publicada, incluindo 17 de GoogleSettings e 2 de ajuda contextual. Cobertura de consentimento explícito, autorização inválida/obsoleta, bloqueio de duplo envio, rascunhos, limpeza e privacidade. Tipos, lint dos arquivos alterados e build/PWA aprovados. Bundle mantém aviso existente de tamanho superior a 500 kB (aproximadamente 667 kB antes de gzip).
- Revisão de segurança por agente distinto: identificado e corrigido uso de URL antiga de autorização. Revisão posterior sem bloqueadores identificados; o revisor não repetiu os testes.
- Prévia exclusivamente com dados fictícios, inclusive cenário conectado via googlePreview=connected. Nenhuma conta real ou autorização Google foi usada na validação visual.
- Mobile 360 × 800: document.clientWidth e scrollWidth em 341 px, sem overflow. Ajuda da leitura dentro dos limites da tela (280 px de largura); tooltip de lembretes também dentro da tela. Verificados toque, Escape e avisos visíveis de remoção de tags e privacidade ao selecionar as opções.
- Tablet medido em 768 × 1025, notebook em 1366 × 767 e desktop em 1920 × 1080: sem overflow da página, duas colunas da integração e tipografia sans-serif do design system. Há diferença de 1 px na altura de tablet/notebook devido à escala do host; não declarar validação exata de 768 × 1024 e 1366 × 768.
- Botões e ajudas têm alvos nominais de 44 px; tooltips funcionam com toque, foco/hover e Escape, sem depender de título nativo ou interação apenas por mouse. Cabeçalho, fila/falhas, confirmações e avisos essenciais continuam legíveis sem abrir ajuda.
- Cores reutilizam as combinações já medidas: verde sobre sálvia 10,59:1, texto claro sobre verde 13,21:1 e borda sobre fundo opaco 3,36:1. Não foi feita auditoria integral de contraste composto, leitor de tela, aparelho físico, Safari/iOS, texto ampliado ou simulação visual sem blur.
- Não foram alterados banco, RLS, permissões, escopos OAuth ou custos. Não há testes novos de banco nesta revisão porque não há mudanças persistentes no backend.
- Evidência: test-results/integrations-final.jpg. Publicação aprovada; confirmar versão e disponibilidade na URL de produção após o envio.

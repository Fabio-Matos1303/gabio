# ADR-017: Atualização automática da leitura Google

- Data: 2026-11-24.
- Status: implementação e publicação autorizadas pelo usuário em 2026-11-24; verificação de produção pendente.

## Decisão

Substituir a exigência de atualização manual após invalidação por uma nova consulta automática, aguardando pelo menos 65 segundos desde a consulta anterior. Enquanto a tela estiver visível e online, renovar consultas completas a cada 15 minutos, inclusive ao retornar à tela. Esse intervalo permite até 96 lotes por dia de tela aberta, abaixo do limite de 120, com margem para ações manuais. O limite do servidor permanece soberano.

Não consultar automaticamente quando faltar consentimento, houver reconexão pendente, integração desativada ou páginas por carregar. Resultados parciais preservam a ação de continuação. Falhas transitórias e rate limit permitem nova tentativa no intervalo normal, sem loop imediato. Não persistir conteúdo externo no navegador. Descartar respostas invalidadas e cancelar timers/listeners ao desmontar a tela.

O envio Gabio → Google continua responsabilidade da outbox e do worker autenticado agendado no servidor, inclusive com a aplicação fechada. Leitura automática não resolve falhas de envio nem concede escopos. Google Tasks continua exigindo consentimento individual para escrita. Nenhum novo escopo, custo ou sincronização bidirecional é introduzido.

## Isolamento da fila por conexão

O diagnóstico de produção confirmou que a barreira de limpeza do ADR-016 vinculava contas diferentes pelo mesmo item. Uma conta aguardando reconexão bloqueava atualizações autorizadas da outra. A migration incremental `202611240001` limita essa dependência à mesma conexão pessoal: limpeza de provedor/categoria anterior nessa conta continua obrigatória antes do novo envio. Membership, proprietário, visibilidade, escopos, intenções e leases continuam revalidados.

Uma conta pode sincronizar enquanto outra aguarda limpeza e reconexão. Isso não garante remoção imediata de cópias numa conta desconectada. Não há migração histórica, nova permissão ou alteração de credenciais.

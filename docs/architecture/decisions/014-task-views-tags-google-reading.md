# ADR-014: Visualizações, tags e leitura pessoal do Google

- Data: 2026-11-02.
- Status: implementação, publicação, permissões e escopos de leitura aprovados pelo usuário em 2026-11-02; consentimento individual permanece necessário.

## Decisão

Manter `#tarefas` e compartilhar seleção, filtros e ações entre kanban e calendário. Usar America/Bahia para instantes locais, datas civis para Google Tasks e fim exclusivo para eventos de dia inteiro. Não antecipar ocorrências recorrentes.

Tags possuem catálogo por residência/visibilidade/proprietário e vínculos com tarefas. Comandos de tarefa aceitam nomes normalizados e resolvem o catálogo no servidor na mesma transação; respostas antigas sem tags continuam válidas. Renomeação e exclusão do catálogo usam gateway próprio, recibos, versões e auditoria. Serializar comandos de tags/tarefas por residência para preservar consistência na renomeação, recorrência e mudanças de visibilidade. Alterar visibilidade exige limpar explicitamente os vínculos incompatíveis; nomes privados nunca são promovidos automaticamente. Toda tabela possui RLS desde sua criação.

Google Tasks e Google Agenda são projeções pessoais somente para consulta. Não são inseridos como tarefas Gabio nem compartilhados com a residência. O Supabase continua autoridade para tarefas Gabio; Google é autoridade apenas para os itens externos lidos. Tags locais em Google Tasks não escrevem no Google.

Ampliar OAuth somente quando `GOOGLE_READING_ENABLED=true` e o usuário marcar leitura no fluxo de conexão: `tasks.readonly`, `calendar.events.readonly` e `calendar.calendarlist.readonly`, além do escopo de exportação existente. Registrar escopos realmente concedidos e exigir todos os solicitados. Vincular intenção à state de uso único já existente. Conexões antigas continuam exportando sem leitura. Rotacionar geração da leitura a cada conexão concluída para evitar mistura de contas, sem solicitar novo escopo de identidade.

Leitura autenticada no servidor usa conexão do ator e membership vigente, lease/rate limit, timeout, limites de páginas/itens e falhas independentes por fonte. Revalidar a geração após chamadas externas. Não persistir conteúdo externo no navegador. Cache de leitura somente em memória por montagem, descartado ao trocar sessão/rota; atualização manual e mensagens de parcialidade. Supressão de eventos exportados usa somente os vínculos conhecidos da conexão, nunca título ou propriedades arbitrárias.

Novas permissões e migrations são preparadas localmente; sua aplicação em produção requer aprovação. Nenhum novo serviço pago ou cobrança automática.

## Consequências

Tags locais de itens externos são privadas e vinculadas à geração da conexão; reconectar limpa as anotações anteriores, com aviso no consentimento. Uma fonte indisponível não impede a gestão de tarefas Gabio. Edição externa, conclusão pelo Gabio, edição de série e blocos de execução ficam fora desta entrega.

Plano funcional: [visualizações de tarefas](../../product/task-views-plan.md).

# ADR-019: Prioridade dos cartões

- Data: 2026-11-25.
- Status: aceito; publicação em preparação.

Prioridade baixa, média ou alta pertence à tarefa do Gabio. A coluna `priority`
tem valor padrão `medium` e check constraint; herda a RLS e a proibição de escrita
direta de `tasks`. Não há prioridade inferida para itens Google.

O leitor v4 acrescenta prioridade ao leitor v3, preservando leitores e recibos
legados de schemas estritos. A edição independente usa
`execute_task_priority_command`, com o formato update da fila existente, versão
esperada, autenticação, lock residencial compartilhado, recibos idempotentes e
auditoria sem conteúdo pessoal. Misturar prioridade com outros campos é inválido.
O acesso atual é revalidado antes de fornecer recibos; versão e estado editável
são verificados somente ao aplicar um comando novo.

Um trigger interno copia a prioridade da ocorrência anterior ao criar a próxima
tarefa recorrente, inclusive quando a conclusão vem de um cliente antigo. Não
altera serializadores legados nem envia prioridade a integrações externas.

A interface mostra o nível por texto e cor, permite editar em modal e filtrar os
cartões locais por prioridade. Criação e snapshots antigos usam prioridade média
quando ausente. A fila persiste o mesmo commandId nos reenvios e não trata falha
de rede como confirmação. Aplicar migration antes de publicar o cliente.

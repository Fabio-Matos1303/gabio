# ADR-018: Conteúdo dos cartões de tarefas

- Data: 2026-11-24.
- Status: desenvolvimento autorizado; aplicação das migrations e publicação autorizadas pelo usuário em 2026-11-25, com execução e verificação em andamento.

## Decisão

Separar propriedades compactas, observações e checklists no cartão. Propriedades
continuam usando o gateway de tarefas com atualização parcial. Observações e
checklists usam comandos próprios, schemas estritos, recibos por ator, auditoria
sem texto pessoal e versões independentes. Cada checklist é um agregado ordenado:
salvar seus itens exige a versão da lista; não há mesclagem automática.

O conteúdo herda autorização da tarefa por RLS e pelo gateway. Escritas diretas
são revogadas. Toda escrita de conteúdo toma o mesmo lock residencial do gateway
existente e bloqueia a tarefa pai, serializando conclusão, recorrência e mudanças
de visibilidade. Concluídas e canceladas são somente consulta. Exclusão de checklist
usa tombstone para impedir recriação por um comando antigo.

Limites iniciais: observações de 10.000 caracteres, até 20 checklists ativas por
cartão, título de lista até 120 caracteres e até 100 itens por lista, cada item com
até 500 caracteres. Texto é exibido sem interpretar HTML. URLs só se tornam links
quando validadas como HTTP(S); nesta entrega o texto permanece texto simples.

Detalhes são carregados ao abrir e não entram no snapshot da listagem. Uma nova
leitura versionada acrescenta apenas presença de observações e contagens. Leituras
e recibos legados permanecem inalterados. Comandos de conteúdo são persistidos em
fila própria, por usuário e residência, antes do envio, e repetidos com o mesmo
identificador após resposta perdida. Conflitos exigem decisão explícita; falhas de
rede nunca autorizam cancelar um comando possivelmente aplicado.

Na conclusão recorrente, um trigger transacional copia observações e checklists
ativas para a próxima ocorrência, com novos IDs e itens desmarcados. A ocorrência
anterior é preservada. Marcar a última etapa não conclui a tarefa. A interface pede
confirmação ao concluir com itens pendentes, incluindo conclusão pelo quadro.

Observações e checklists não são enviadas ao Google. Nenhum escopo, serviço pago
ou integração nova é introduzido. Comentários, anexos, prioridade, modelos e
subtarefas independentes ficam para entregas posteriores.

## Compatibilidade e validação

Aplicar migration incremental antes do cliente. O cliente novo usa a leitura v3;
indisponibilidade desse endpoint é erro de atualização e não coleção vazia.
Snapshots antigos sem resumo continuam aceitos. A fila de conteúdo é separada da
fila legada, e seu conteúdo não é projetado como confirmação do servidor.

Novas tabelas têm RLS desde a criação, testes positivos e negativos e revisão de
segurança por agente distinto. Produção exige autorização, commit/push, checks,
versão e disponibilidade verificadas e registro final conforme AGENTS.md.

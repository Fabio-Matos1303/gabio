# ADR-005: Command Gateway de tarefas

- Status: aceito
- Data: 2026-09-23

## Contexto

O M2 precisa permitir criação, edição e mudança de estado de tarefas pela PWA, inclusive quando um comando é reenviado após perda de conexão. Escritas diretas na tabela tornariam difícil garantir autorização, idempotência, auditoria, concorrência otimista e criação única da próxima ocorrência recorrente.

## Decisão

Toda mutação de tarefa passa pela RPC autenticada `execute_task_command`. Clientes autenticados mantêm somente leitura direta de `tasks`, sujeita à RLS, e não recebem `INSERT`, `UPDATE` nem `DELETE` na tabela. A RPC é `SECURITY DEFINER`, usa `search_path` fixo e deriva o ator de `auth.uid()` e a residência da associação persistida; esses valores nunca vêm do payload.

O gateway aceita apenas envelopes estritos com `commandId`, `type` e `payload`, validados tanto no cliente quanto no banco. Os comandos do M2 são:

- `create`: cria uma tarefa aberta;
- `update`: altera campos de uma tarefa aberta;
- `set_status`: define o estado como aberta, concluída ou cancelada.

Cada comando bem-sucedido gera uma entrada de auditoria. A tabela interna `task_command_receipts` registra, por ator e `commandId`, o hash SHA-256 do comando e a resposta. Ela tem RLS habilitada e nenhuma política ou permissão direta para clientes.

## Idempotência e concorrência

Repetir o mesmo `commandId` com o mesmo conteúdo devolve a resposta persistida com `replayed: true`, sem repetir a mutação nem a auditoria. Reutilizar o identificador com conteúdo diferente é conflito de idempotência.

Tarefas começam na versão 1. `update` e `set_status` exigem `expectedVersion`; uma mutação válida incrementa a versão. Versão desatualizada, recurso invisível ou indisponível produzem o mesmo conflito genérico, sem confirmar a existência de tarefa privada ou de outra residência.

## Visibilidade e atribuição

Tarefas compartilhadas podem ser lidas e alteradas por membros da residência. Tarefas privadas são visíveis e alteráveis apenas pelo proprietário. O responsável, quando informado, precisa pertencer à residência; uma tarefa privada não pode ser atribuída a outra pessoa.

## Recorrência simplificada

O M2 suporta `none`, `daily`, `weekly` e `monthly`. Toda tarefa recorrente exige vencimento. Ao concluir uma ocorrência, o gateway cria exatamente uma nova tarefa aberta, preservando título, propriedade, responsável, visibilidade e recorrência, e liga a nova ocorrência à anterior.

A próxima data é calculada a partir do vencimento da ocorrência concluída, não do momento da conclusão. Não existe série editável, exceção por ocorrência, regra cron, fuso configurável por tarefa nem geração antecipada no M2. Cancelar uma ocorrência não cria a próxima.

## Consequências

- A fila IndexedDB pode reenviar comandos com segurança, mas não substitui o PostgreSQL como fonte de verdade.
- Conflitos exigem atualização da lista e uma nova decisão do usuário; não há mesclagem automática.
- O recibo precisa ser retido enquanto houver possibilidade de replay por clientes suportados. Política de expurgo exige decisão operacional futura.
- Alterar uma série inteira ou oferecer recorrência mais expressiva exigirá um novo contrato e uma nova decisão arquitetural.

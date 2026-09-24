# Operação do M2  tarefas

O M2 foi concluído em 2026-09-24. Este runbook descreve seu contrato e os procedimentos de validação e operação.

## Execução local

1. Inicie o Supabase local com `supabase db start`.
2. Aplique as migrations incrementais com `supabase db reset` apenas no ambiente local descartável.
3. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em `.env.local`, sem versionar o arquivo.
4. Use somente identidades e conteúdo sintéticos sob o domínio reservado `example.test`.
5. Inicie a PWA com `pnpm dev` e autentique um membro de uma residência de teste.

Não aplique migrations em ambiente compartilhado ou de produção sem aprovação humana. Nunca use `service_role` na PWA.

## Fluxo de comandos

1. A PWA valida o comando por schema e gera um UUID estável em `commandId`.
2. O comando é salvo na fila local antes da tentativa de envio.
3. A RPC `execute_task_command` autentica o ator, resolve sua residência, valida novamente o envelope e aplica autorização.
4. O banco grava recibo idempotente, mutação e auditoria na mesma transação.
5. Depois da resposta validada, a PWA remove o comando da fila e recarrega a projeção autorizada de tarefas.

O mesmo `commandId` deve ser preservado em todas as tentativas. Gerar outro UUID para um retry pode duplicar uma criação.

## Fila offline

A fila usa o banco IndexedDB `gabio-task-commands-v1`, object store `commands`. Cada chave combina `userId`, `householdId` e `commandId`, evitando que uma troca de sessão processe comandos de outro contexto.

Os estados locais são:

- `pending`: ainda pode ser enviado;
- `conflict`: o servidor rejeitou por concorrência;
- `failed`: reservado para uma classificação futura de falhas permanentes; o M2 conserva falhas desconhecidas como `pending` para replay idempotente.

A sincronização processa comandos pendentes em ordem de criação e interrompe se a sessão ou residência corrente mudar. Registros com payload inválido são rejeitados pelo schema local. IndexedDB contém comandos ainda não sincronizados e deve ser tratado como dado pessoal no dispositivo; logout ou troca de usuário não autoriza processá-los em outro contexto.

## Reconciliação

- Sucesso ou replay idempotente: remover a entrada local e atualizar a lista a partir do PostgreSQL.
- Falha de rede: manter o comando para repetição com o mesmo identificador.
- Conflito de versão: marcar como `conflict`, recarregar a tarefa e pedir ao usuário que revise a intenção. Uma nova tentativa deliberada usa a versão atual e um novo `commandId`.
- Falha de validação ou autorização: não alterar o payload automaticamente; apresentar mensagem segura. Como o M2 não distingue essas falhas de uma resposta perdida com segurança, mantém o mesmo comando como `pending` para replay idempotente.
- Sessão expirada: renovar a sessão antes de reenviar. Nunca mover a entrada para outra identidade ou residência.

Não há mesclagem automática nem estratégia última escrita vence. O PostgreSQL é sempre a fonte de verdade.

## Limites do M2

- Título entre 1 e 240 caracteres após remoção de espaços nas extremidades.
- Estados: aberta, concluída ou cancelada.
- Recorrência: nenhuma, diária, semanal ou mensal; recorrência exige vencimento.
- Apenas tarefas abertas podem ser editadas.
- A conclusão recorrente cria uma única próxima ocorrência; cancelamento não cria outra.
- A fila não possui sincronização em segundo plano garantida, prazo de retenção, cota própria ou retry exponencial neste marco.
- O parser determinístico cobre somente frases portuguesas suportadas; entrada não reconhecida deve voltar ao formulário, sem inferir campos.
- Exclusão física de tarefas, edição de série, exceções e notificações ficam fora do M2.

## Testes obrigatórios

Execute, antes de entregar:

```bash
pnpm verify
supabase test db
```

Além dos checks automatizados, valide com dados sintéticos:

- criação compartilhada e privada, atribuição válida e rejeição de terceiro;
- leitura positiva para a residência e negativa para outra residência e para tarefa privada;
- bloqueio de `INSERT`, `UPDATE` e `DELETE` diretos em `tasks`;
- ausência de acesso direto aos recibos;
- replay do mesmo comando sem duplicação e rejeição do mesmo UUID com outro payload;
- edição com versão atual e conflito com versão antiga;
- conclusão recorrente gerando exatamente uma próxima ocorrência;
- fila durante indisponibilidade, sincronização posterior e isolamento ao trocar de sessão;
- parser em português para casos suportados e retorno seguro para texto desconhecido;
- estados visuais de vazio, envio, offline, erro, conflito e sucesso.

Registre exatamente quais checks foram executados. A conclusão do M2 também exige revisão independente de segurança, incluindo RLS positiva e negativa no PostgreSQL real.

## Diagnóstico e recuperação

- Se um comando parecer duplicado, compare o ator, o `commandId` e o hash do payload; não apague recibos para forçar nova execução.
- Se houver conflito, recarregue a projeção e confirme a versão atual antes de criar um novo comando.
- Se uma recorrência criar mais de uma sucessora, interrompa novas conclusões daquela cadeia e investigue a restrição de ocorrência anterior e os recibos.
- Se a fila local estiver corrompida, preserve evidências sintéticas suficientes para diagnóstico e permita que o usuário descarte apenas os comandos locais afetados. O descarte não desfaz comandos já aceitos pelo servidor.
- Correções de banco devem ser feitas por migration incremental; não altere uma migration aplicada.

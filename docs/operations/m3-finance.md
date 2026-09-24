# Operação financeira do M3

O M3 oferece contas, categorias, receitas, despesas, orçamentos, recorrências e parcelamentos em BRL. Valores são armazenados em centavos inteiros.

## Segurança e confirmação

Toda alteração passa por duas chamadas autenticadas:

1. `prepare_finance_command` valida e guarda o comando canônico por dez minutos;
2. a interface exibe o resumo e envia `confirm_finance_command` com os identificadores e o hash recebidos;
3. o banco bloqueia a proposta, confirma ator, residência, validade, hash e uso único, e só então executa o comando guardado.

O cliente não envia SQL, não possui acesso direto de escrita e não consegue trocar o comando depois da preparação. Repetir a confirmação devolve o mesmo recibo, sem duplicar o lançamento.

Contas privadas e seus lançamentos só são visíveis ao proprietário. Contas compartilhadas são visíveis aos dois membros. A visibilidade do lançamento deve ser igual à da conta.

## Histórico contábil

Lançamentos confirmados são imutáveis. Uma correção financeira usa estorno, que cria um lançamento inverso vinculado ao original. Exclusão destrutiva e segundo estorno são recusados. Comandos, propostas consumidas e recibos permanecem auditáveis.

Operações financeiras não entram na fila offline: a preparação e a confirmação exigem conexão com o servidor.

## Exportação e restauração

A interface exporta somente os registros que o usuário autenticado pode visualizar:

- JSON versionado, com data de exportação e valores em centavos como texto para preservar precisão;
- CSV protegido contra fórmulas de planilha.

O parser de restauração valida estritamente versão, unidade monetária, formato e linhas antes de aceitar um arquivo. A restauração no banco não é exposta na PWA. Ela deve ser ensaiada primeiro em ambiente local ou isolado; restauração em produção exige aprovação humana, backup e registro operacional.

Teste local de compatibilidade do arquivo:

```bash
pnpm --filter @gabio/web test
```

## Verificação do banco

A migration é incremental. Para recriar apenas o ambiente local e executar políticas positivas e negativas:

```bash
pnpm exec supabase db reset
pnpm exec supabase test db
```

O reset apaga usuários e dados locais. Nunca o execute contra produção.

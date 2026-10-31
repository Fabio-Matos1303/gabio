# Criação de tarefas em modal e recorrência personalizada

- Versão: `task-modal-recurrence-2026.10.31.1`.
- Status: banco publicado e verificado; frontend em publicação.
- Decisão: [ADR-013](../architecture/decisions/013-custom-task-recurrence.md).

## Alteração

Removidos o texto introdutório e o horário de última consulta indicados no print. O título rápido permanece disponível; Adicionar tarefa abre um modal com título, primeiro prazo, responsável, privacidade e recorrência. Criar tarefa é a ação que envia o comando.

Frequências prontas: diária, semanal, quinzenal (duas semanas), mensal, trimestral, semestral e anual. Personalizar permite intervalo de 1 a 365 dias/semanas/meses/anos, dias da semana e data final inclusiva. A primeira data precisa corresponder aos dias escolhidos. O horário usa Bahia/Brasília (UTC-03 para os agendamentos atuais).

Cancelar ou Escape preserva o rascunho; criação confirmada ou já persistida na fila limpa os campos. Durante envio, fechamento e novo envio ficam bloqueados. O modal mantém o foco, permite rolagem dos campos e conserva as ações no rodapé.

## Validação executada

- 99 checks locais de banco: autenticação (26), tarefas (32), workflow (9), privilégios (4) e recorrência personalizada (28).
- Contratos: 26 testes; domínio: 24 testes aprovados. Cobrem intervalos, dias, último dia do mês, ano bissexto, prazo final local e rejeição de regras inválidas.
- Suíte inicial do frontend: 66 testes aprovados. Após as correções finais, os 38 testes da tela foram reexecutados e aprovados.
- Lint de frontend/contratos/domínio, tipos e build aprovados. Build emite aviso de bundle maior que 500 kB, sem falha.
- Revisão independente de segurança sem achados bloqueantes após corrigir a validação completa da edição e a validação de propostas de entrada.
- Chromium headless com dados fictícios: 360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080; modal dentro da tela, ações acessíveis com pelo menos 44 px, campos roláveis e ausência de rolagem horizontal.
- Verificados Tab, Escape, reabertura imediata, preservação de rascunho, criação, limpeza do formulário e texto ampliado para 200% sem overflow interno.
- Evidências locais ignoradas pelo Git: `test-results/task-modal-*.png`, `task-recurrence-*.png`, `task-modal-text-200.png`, `task-creation-mobile.png` e `task-modal-layout.json`.

## Ordem de publicação

1. Aplicar exclusivamente `202610310001_add_custom_task_recurrence.sql`, registrando essa versão no histórico remoto.
2. Em outra transação, aplicar `202610310002_custom_task_recurrence.sql`, registrando essa versão. Não aplicar outras migrations locais pendentes.
3. Verificar coluna, enum, helpers, privilégios existentes, RLS e cálculo de uma data sintética, sem ler registros dos usuários.
4. Publicar os arquivos desta entrega sobre a `main` atual, com o cliente novo.
5. Conferir CI, build do Cloudflare, versão, disponibilidade e assets na URL de produção.

Não são necessários novos serviços, custos, escopos OAuth ou permissões de cliente. Os helpers de recorrência não são RPCs adicionais para o frontend; somente o gateway autenticado pode utilizá-los.

## Banco remoto

As migrations 202610310001 e 202610310002 foram aplicadas em transações separadas e registradas com o SQL exato no histórico remoto. Coluna, constraint, RLS ativa, gateway autenticado e helpers sem execução pelo cliente foram verificados. O cálculo remoto com data sintética confirmou 04/11/2026 às 12:00 UTC, sem ler registros dos usuários.

## Limites

Não houve teste em aparelho físico, Safari/iOS ou leitor de tela. Não foram usadas contas nem dados reais em desenvolvimento ou testes. Depois da publicação, clientes antigos precisam atualizar/reabrir a PWA para ler o novo formato de recorrência personalizada. Não reverter para um cliente anterior ao suporte de `custom` após seu uso.

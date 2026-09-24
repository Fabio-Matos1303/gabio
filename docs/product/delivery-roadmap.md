# Roadmap de entregas ponta a ponta

Cada marco entrega uma capacidade utilizável da interface até o banco, incluindo autorização, auditoria, estados de erro e testes. Componentes isolados não contam como marco concluído.

## Definition of Done comum

- Fluxo principal utilizável na PWA em português brasileiro.
- Estados de carregamento, vazio, sucesso, erro e repetição tratados.
- Entradas externas e respostas de modelos validadas por schema.
- Autorização no backend e RLS positiva e negativa no PostgreSQL real.
- Operações idempotentes e auditáveis quando alteram dados ou sistemas externos.
- Testes unitários e de integração proporcionais ao risco.
- Revisão de segurança feita por agente diferente do implementador.
- Documentação e critérios de recuperação atualizados.
- Nenhum dado real, segredo ou credencial em código, testes ou logs.

## M1 — Identidade e residência

**Resultado:** duas pessoas acessam a mesma residência com identidades separadas.

- Login, provisionamento fechado, logout, persistência e recuperação de senha.
- Criação segura da primeira residência.
- Convite de uso único, com expiração, e-mail confirmado e criação server-side da conta convidada.
- Entrada do segundo membro e visualização do estado da residência.
- Testes de owner, convidado, terceiro, token expirado e reutilização.

## M2 — Tarefas ponta a ponta

**Resultado:** criar, atribuir e concluir tarefas pela PWA, inclusive após perda temporária de conexão.

**Status:** concluído em 2026-09-24.

- Command Gateway autenticado, idempotente e auditável.
- CRUD de domínio por comandos, recorrência e visibilidade.
- IndexedDB, fila offline e reconciliação.
- Primeiro parser determinístico em português.

## M3 — Finanças ponta a ponta

**Resultado:** contas e lançamentos privados ou compartilhados com confirmação e histórico confiável.

**Status:** concluído em 2026-09-24.

- Contas, categorias, receitas, despesas, recorrência, orçamento e parcelamento.
- Ledger sem exclusão destrutiva; correções por ajuste ou estorno.
- Confirmação vinculada ao hash do comando.
- Exportação JSON/CSV e teste de restauração.

## M4 — Agenda e notificações

**Resultado:** compromissos criados em calendário secundário do Google, com alerta de conflito e lembretes.

- OAuth de escopo mínimo e tokens protegidos.
- Outbox, retry e idempotência da integração.
- Detecção transacional de conflito entre eventos do Gabio.
- Web Push e preferências de notificação.

## M5 — Telegram

**Resultado:** entrada e confirmação pelo Telegram sem enfraquecer identidade ou privacidade.

- Pareamento temporário por usuário, webhook autenticado e deduplicação.
- Texto natural e comandos estruturados como fallback.
- Confirmações interativas e respostas minimizadas.

## M6 — Inferência híbrida e agente local

**Resultado:** interpretação por regras, Gemini sanitizado ou modelo local, sem dependência obrigatória de IA.

- Avaliação sintética em português para selecionar Qwen/Phi e thresholds.
- Classificação de sensibilidade e sanitização testada.
- Adaptadores com timeout, cotas, fallback e circuit breaker.
- Agente local somente com conexões de saída e credencial revogável.

## M7 — Produção e operação

**Resultado:** ambiente recuperável, monitorado e dentro do orçamento aprovado.

- Ambientes separados, CI obrigatório e deploy aprovado manualmente.
- Backups, restauração ensaiada, logs minimizados e alertas de cota.
- Cloudflare Pages e Supabase dentro dos limites gratuitos observados.

## Sequência de uma vertical

Cada recurso segue a mesma ordem:

1. contrato e regra de domínio;
2. migration incremental e RLS;
3. comando autenticado e auditoria;
4. interface e estados offline/erro;
5. testes de ponta a ponta;
6. revisão independente de segurança;
7. documentação e somente então entrega.

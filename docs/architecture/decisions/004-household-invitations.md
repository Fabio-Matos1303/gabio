# ADR-004: Onboarding e convites de residência

- Status: aceito
- Data: 2026-09-22

## Decisão

Cada usuário pertence a no máximo uma residência no MVP. O primeiro usuário cria a residência por RPC autenticada; o segundo entra por convite de uso único criado pelo owner.

O convite é vinculado ao e-mail normalizado e expira em 24 horas. O link de autenticação contém `join=<invitation_id>`, um identificador público de correlação que não concede acesso isoladamente. Após autenticação, a RPC exige simultaneamente esse UUID e o e-mail confirmado da própria identidade. Criação e aceite são auditados sem registrar e-mail no metadata da auditoria.

O cadastro público permanece desabilitado. Uma função de servidor autenticada cria o convite de residência e usa a API administrativa do Supabase Auth para enviar o convite de acesso. A credencial `service_role` existe apenas nessa função.

## Guardas

- Somente owner pode criar convite para sua residência.
- No máximo cinco convites ativos por residência.
- A conta autenticada precisa ter o mesmo e-mail do convite.
- O e-mail precisa estar confirmado e a residência é limitada a duas pessoas.
- Falha no envio revoga o convite residencial pendente recém-criado.
- Aceite repetido pelo mesmo usuário é idempotente; outra identidade não descobre nem reutiliza o convite.
- Reenvios têm intervalo mínimo de cinco minutos por endereço e limite de dez tentativas por residência a cada 24 horas.
- Tabelas de convite não possuem acesso direto para clientes; somente RPCs fechadas.
- A configuração de produção deve exigir confirmação de e-mail e limitar abuso de cadastro.

## Consequências

- O envio automático de e-mail não é necessário no M1; o owner pode copiar o convite.
- Suporte a múltiplas residências exigirá nova decisão e mudança explícita de modelo.

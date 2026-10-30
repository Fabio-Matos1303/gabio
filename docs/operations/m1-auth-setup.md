# Configuração do M1 — autenticação e residência

## Princípios

- Cadastro público permanece desabilitado por `auth.enable_signup = false`.
- O provedor de e-mail permanece habilitado por `auth.email.enable_signup = true` para permitir login, convite e recuperação sem liberar cadastro público.
- O Auth rejeita senhas com menos de 12 caracteres; o mesmo mínimo deve ser mantido na produção.
- O primeiro proprietário é provisionado por uma operação administrativa humana.
- O segundo usuário é criado pela função `invite-household-member` após ação do owner.
- `SUPABASE_SERVICE_ROLE_KEY` existe somente no ambiente da Edge Function.

## Ambiente local

1. Inicie o Supabase com `supabase db start`.
2. Obtenha a URL e a chave pública/anon do ambiente local sem copiá-las para arquivos versionados.
3. Preencha `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Configure `PUBLIC_APP_URL` na Edge Function com a origem exata, sem barra final, por exemplo `http://127.0.0.1:5173`.
5. Crie o primeiro usuário pelo painel Auth local ou API administrativa e confirme o e-mail.
6. Execute a PWA, faça login e crie a residência.

Mensagens de e-mail locais aparecem no serviço de captura de e-mail do Supabase; nenhum e-mail real deve ser usado em desenvolvimento.

## Fluxo do segundo membro

1. O owner informa o e-mail na área Pessoas.
2. A Edge Function autentica o caller e cria um convite residencial de uso único.
3. A API administrativa do Auth envia o convite de acesso com o UUID público de correlação na URL de retorno.
4. O convidado abre o link, define uma senha e aceita o convite.
5. A RPC confere e-mail confirmado, expiração, revogação, limite de dois membros e ausência de outra residência.
6. O identificador é removido da URL após o aceite e a operação é auditada.

## Produção

Deploy e configuração de Auth exigem aprovação humana. Antes do deploy:

- confirmar `site_url` e allowlist exata de redirects;
- configurar SMTP e template sem incluir dados domésticos;
- armazenar segredos somente no provedor;
- validar limites de envio e proteção contra abuso;
- executar `pnpm verify` e `supabase test db`;
- testar convite, recuperação, logout e revogação com identidades sintéticas.

## Recuperação

- Convite falho é revogado automaticamente pela função.
- Um novo convite para o mesmo e-mail invalida o anterior.
- Sessões podem ser encerradas pelo usuário e revogadas administrativamente.
- Nenhuma exclusão de residência ou membro é oferecida no M1.

## Correção de convite sem parâmetro de retorno

A migration incremental `202610290003_recover_household_invitation.sql` adiciona
recuperação do convite da própria identidade confirmada e bloqueio de criação
indevida de residência. Publicá-la antes do frontend, após aprovação humana.
Consultar o ADR-012 para limites, implantação e regularização de contas antigas.
O frontend exige consulta bem-sucedida antes de oferecer criação sem link.
Falhas e convites ambíguos mantêm o fluxo bloqueado; usar o link original ou
solicitar um novo convite válido, sem excluir a conta.

### Publicação household-invitation-2026.10.30.1

- Aplicação da migration pelo editor SQL autorizada pelo usuário, que informou
  `Success. No rows returned`. O resultado não foi verificado independentemente
  no painel por limitação do controle do navegador.
- A aplicação manual do arquivo não registra automaticamente a versão em
  `supabase_migrations.schema_migrations`. Conciliar esse histórico antes de
  qualquer futura execução da CLI; não executar `db push` indiscriminadamente.
- Validação local: 30 testes de interface, 20 testes novos de recuperação,
  26 de autenticação, lint, TypeScript e build. Revisão de segurança independente
  sem achados bloqueadores.
- Esta publicação não transfere contas ou registros existentes entre residências.

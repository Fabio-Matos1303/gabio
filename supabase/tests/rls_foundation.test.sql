begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'a@example.test', '', now(), now(), now(), '{}', '{"display_name":"Pessoa A"}'),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'b@example.test', '', now(), now(), now(), '{}', '{"display_name":"Pessoa B"}'),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider@example.test', '', now(), now(), now(), '{}', '{"display_name":"Pessoa externa"}');

insert into public.households (id, name, created_by)
values ('20000000-0000-4000-8000-000000000001', 'Casa teste', '10000000-0000-4000-8000-000000000001');

insert into public.household_members (household_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'member');

insert into public.financial_accounts (id, household_id, owner_user_id, created_by, visibility, name, account_type)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', null, '10000000-0000-4000-8000-000000000001', 'household', 'Compartilhada', 'checking'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'private', 'Privada B', 'checking');

insert into public.transactions (
  id, household_id, account_id, created_by, direction, amount_minor,
  description, occurred_on, idempotency_key
)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'expense', 1000, 'Compartilhada', current_date, '50000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'expense', 2000, 'Privada B criada por A', current_date, '50000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.financial_accounts)::bigint, 1::bigint, 'A sees only the shared account');
select is((select count(*) from public.transactions)::bigint, 1::bigint, 'A cannot read a private transaction merely because A created it');
select throws_ok(
  'delete from public.financial_accounts where id = ''30000000-0000-4000-8000-000000000001''',
  '42501', null, 'clients cannot delete financial accounts'
);
select throws_ok(
  'update public.financial_accounts set visibility = ''private'', owner_user_id = ''10000000-0000-4000-8000-000000000001'' where id = ''30000000-0000-4000-8000-000000000001''',
  '42501', null, 'clients cannot appropriate shared accounts'
);
select throws_ok(
  $$insert into public.transactions (household_id, account_id, created_by, direction, amount_minor, description, occurred_on, idempotency_key) values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'expense', 1, 'Direta', current_date, gen_random_uuid())$$,
  '42501', null, 'clients cannot bypass the command gateway for finance'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.financial_accounts)::bigint, 2::bigint, 'B sees shared and own private accounts');
select is((select count(*) from public.transactions)::bigint, 2::bigint, 'B sees shared and own private transactions');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.financial_accounts)::bigint, 0::bigint, 'non-member sees no accounts');
select is((select count(*) from public.transactions)::bigint, 0::bigint, 'non-member sees no transactions');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into public.inbox_items (household_id, actor_user_id, source, raw_text, idempotency_key) values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'pwa', 'primeiro', '60000000-0000-4000-8000-000000000001'), ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'pwa', 'segundo', '60000000-0000-4000-8000-000000000002')$$,
  'multiple PWA inbox items may omit external_id'
);

select * from finish();
rollback;

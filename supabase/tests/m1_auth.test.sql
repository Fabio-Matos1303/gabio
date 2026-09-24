begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@example.test', '', now(), now(), now(), '{}', '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member@example.test', '', now(), now(), now(), '{}', '{"display_name":"Member"}'),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider@example.test', '', now(), now(), now(), '{}', '{"display_name":"Outsider"}'),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'pending@example.test', '', null, now(), now(), '{}', '{"display_name":"Pending"}'),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'expired@example.test', '', now(), now(), now(), '{}', '{"display_name":"Expired"}');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.create_initial_household('Sem autenticação')$$,
  '28000', null, 'anonymous users cannot create a household'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_initial_household('  Nossa casa  ')$$,
  'authenticated owner creates the initial household'
);
select is((select name from public.households limit 1), 'Nossa casa', 'household name is normalized');
select is(
  public.create_initial_household('Outra casa'),
  (select household_id from public.household_members where user_id = auth.uid()),
  'repeated bootstrap is idempotent'
);
select is(
  (select count(*) from public.household_members where user_id = auth.uid())::bigint,
  1::bigint,
  'one user belongs to at most one household'
);
select throws_ok(
  $$select public.create_household_invitation((select id from public.households limit 1), 'legacy@example.test')$$,
  '42501', null, 'legacy token invitation RPC is disabled'
);

create temporary table invite_ids (kind text primary key, id uuid not null);
create temporary table expected_household as
select household_id as id
from public.household_members
where user_id = auth.uid();
insert into invite_ids
select 'member', public.request_household_invitation(
  (select household_id from public.household_members where user_id = auth.uid()),
  'member@example.test'
);
insert into invite_ids
select 'pending', public.request_household_invitation(
  (select household_id from public.household_members where user_id = auth.uid()),
  'pending@example.test'
);
insert into invite_ids
select 'revoked', public.request_household_invitation(
  (select household_id from public.household_members where user_id = auth.uid()),
  'outsider@example.test'
);
insert into invite_ids
select 'expired', public.request_household_invitation(
  (select household_id from public.household_members where user_id = auth.uid()),
  'expired@example.test'
);

-- A newer invitation for the same address must not change the linked household.
reset role;
insert into public.households (id, name, created_by)
values ('72000000-0000-4000-8000-000000000002', 'Outra casa', '71000000-0000-4000-8000-000000000001');
insert into public.household_invitations (
  id, household_id, invited_email, token_hash, invited_by, expires_at, created_at
) values (
  '73000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000002',
  'member@example.test',
  extensions.digest('other-household-invitation', 'sha256'),
  '71000000-0000-4000-8000-000000000001',
  now() + interval '1 day',
  now() + interval '1 second'
);
insert into invite_ids values ('other-household', '73000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);

select ok((select id is not null from invite_ids where kind = 'member'), 'owner receives an opaque invitation id');
select throws_ok(
  $$select public.request_household_invitation((select id from public.households limit 1), 'member@example.test')$$,
  '54000', null, 'same-address delivery observes cooldown'
);
select lives_ok(
  $$select public.revoke_household_invitation_by_id((select id from invite_ids where kind = 'revoked'))$$,
  'owner can revoke an unused invitation'
);
select lives_ok(
  $$select public.revoke_household_invitation_by_id((select id from invite_ids where kind = 'revoked'))$$,
  'repeated revocation is state-idempotent'
);

reset role;
select is(
  (select count(*) from public.audit_log where action = 'household.invitation.revoked')::bigint,
  1::bigint,
  'repeated revocation writes one audit event'
);
select is(
  (select octet_length(token_hash) from public.household_invitations where id = (select id from invite_ids where kind = 'member')),
  32,
  'only an internal random hash is retained'
);
select ok(
  not exists (
    select 1 from public.audit_log
    where metadata::text like '%member@example.test%'
       or metadata ? 'token'
       or metadata ? 'email'
  ),
  'audit metadata contains neither email nor token'
);
update public.household_invitations
set created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
where id = (select id from invite_ids where kind = 'expired');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.request_household_invitation((select id from public.households limit 1), 'x@example.test')$$,
  '42501', null, 'outsider cannot invite'
);
select throws_ok(
  $$select public.accept_pending_household_invitation('00000000-0000-4000-8000-000000000000')$$,
  'P0002', null, 'a user without an active invitation cannot join'
);
select throws_ok(
  $$select * from public.household_invitations$$,
  '42501', null, 'clients cannot read invitation records directly'
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select public.accept_pending_household_invitation((select id from invite_ids where kind = 'expired'))$$,
  'P0002', null, 'an expired invitation is unavailable'
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.accept_pending_household_invitation((select id from invite_ids where kind = 'pending'))$$,
  '42501', null, 'an unconfirmed email cannot accept'
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select is(
  public.accept_pending_household_invitation((select id from invite_ids where kind = 'member')),
  (select id from expected_household),
  'the correlated link accepts the intended household even when another invite is newer'
);
select is(
  public.accept_pending_household_invitation((select id from invite_ids where kind = 'member')),
  (select household_id from public.household_members where user_id = auth.uid()),
  'acceptance is idempotent for the same invitation'
);
select is(
  (select role::text from public.household_members where user_id = auth.uid()),
  'member',
  'accepted user always receives member role'
);
select is(
  jsonb_array_length(public.get_my_household_context() -> 'members'),
  2,
  'both members see the minimal household projection'
);
select throws_ok(
  $$insert into public.household_members (household_id, user_id, role) values ((select id from public.households limit 1), '71000000-0000-4000-8000-000000000003', 'owner')$$,
  '42501', null, 'clients cannot insert or escalate membership directly'
);
select throws_ok(
  $$update public.profiles set display_name = 'Alteração direta' where id = auth.uid()$$,
  '42501', null, 'clients cannot update profile columns directly'
);
select lives_ok(
  $$select public.update_own_profile('Pessoa convidada', 'America/Bahia')$$,
  'allowlisted profile RPC updates safe fields'
);

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.request_household_invitation((select household_id from public.household_members where user_id = auth.uid()), 'new@example.test')$$,
  '54000', null, 'a two-person household cannot create more invitations'
);

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
('72000000-0000-4000-8000-000000000001', 'recovery-owner@example.test', now(), '{}'),
('72000000-0000-4000-8000-000000000002', 'recovery-member@example.test', now(), '{}'),
('72000000-0000-4000-8000-000000000003', 'recovery-unconfirmed@example.test', null, '{}'),
('72000000-0000-4000-8000-000000000004', 'recovery-outsider@example.test', now(), '{}'),
('72000000-0000-4000-8000-000000000005', 'recovery-expired@example.test', now(), '{}'),
('72000000-0000-4000-8000-000000000006', 'recovery-ambiguous@example.test', now(), '{}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select public.create_initial_household('Casa sintética de recuperação');
create temporary table recovery_invites(kind text, id uuid);
insert into recovery_invites values
('member', public.request_household_invitation((select household_id from public.household_members where user_id = auth.uid()), 'recovery-member@example.test')),
('unconfirmed', public.request_household_invitation((select household_id from public.household_members where user_id = auth.uid()), 'recovery-unconfirmed@example.test')),
('expired', public.request_household_invitation((select household_id from public.household_members where user_id = auth.uid()), 'recovery-expired@example.test'));
reset role;
update public.household_invitations set created_at = now() - interval '2 hours', expires_at = now() - interval '1 second'
where id = (select id from recovery_invites where kind = 'expired');
grant select on recovery_invites to authenticated;
select ok(not has_function_privilege('anon', 'public.get_my_pending_household_invitation()', 'execute'), 'anonymous cannot discover invitations');
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select is(public.get_my_pending_household_invitation(), (select id from recovery_invites where kind = 'member'), 'confirmed recipient recovers the exact invitation');
select throws_ok($$select public.create_initial_household('Casa indevida')$$, '42501', null, 'active invitation prevents a separate household');
select is((select count(*) from public.household_members where user_id = auth.uid()), 0::bigint, 'recovery does not enroll automatically');
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.get_my_pending_household_invitation()$$, '42501', null, 'unconfirmed recipient cannot recover invitations');
select throws_ok($$select public.create_initial_household('Casa indevida')$$, '42501', null, 'unconfirmed invitee cannot bypass the guard');
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000004', true);
select is(public.get_my_pending_household_invitation(), null::uuid, 'another identity cannot discover the recipient invitation');
select throws_ok($$select public.accept_pending_household_invitation((select id from recovery_invites where kind = 'member'))$$, 'P0002', null, 'another identity cannot use the recovered UUID');
select lives_ok($$select public.create_initial_household('Casa legítima')$$, 'a user without an invitation can create a household');
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000005', true);
select is(public.get_my_pending_household_invitation(), null::uuid, 'expired invitation is not recovered');
select lives_ok($$select public.create_initial_household('Casa após expiração')$$, 'expired invitations do not block legitimate bootstrap');
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.accept_pending_household_invitation((select id from recovery_invites where kind = 'member'))$$, 'recipient explicitly accepts recovered invitation');
select lives_ok($$select public.accept_pending_household_invitation((select id from recovery_invites where kind = 'member'))$$, 'repeated acceptance is idempotent');
select is(public.get_my_pending_household_invitation(), null::uuid, 'accepted invitation is no longer proposed');
select is((select count(*) from public.household_members where user_id = auth.uid()), 1::bigint, 'recipient has exactly one household');
reset role;
insert into public.household_invitations(household_id, invited_email, token_hash, invited_by, expires_at)
select household_id, 'recovery-ambiguous@example.test', extensions.digest('synthetic-' || user_id::text, 'sha256'), user_id, now() + interval '1 hour'
from public.household_members where user_id in ('72000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000006', true);
select throws_ok($$select public.get_my_pending_household_invitation()$$, '22023', null, 'multiple invitations require the original link instead of choosing a house');
select throws_ok($$select public.create_initial_household('Casa indevida')$$, '42501', null, 'ambiguous invitations still block accidental bootstrap');
reset role;
update public.household_invitations set revoked_at = now() where invited_email = 'recovery-ambiguous@example.test';
set local role authenticated;
select is(public.get_my_pending_household_invitation(), null::uuid, 'revoked invitations are not recovered');
select lives_ok($$select public.create_initial_household('Casa após revogação')$$, 'revoked invitations do not block bootstrap');
reset role;
select is((select count(*) from public.audit_log where action = 'household.invitation.accepted' and actor_user_id = '72000000-0000-4000-8000-000000000002'), 1::bigint, 'acceptance is audited exactly once');
select * from finish();
rollback;

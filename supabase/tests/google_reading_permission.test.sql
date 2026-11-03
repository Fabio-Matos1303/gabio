begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000001','authenticated','authenticated','permission-owner@example.test','',now(),now(),now(),'{}','{}'),
('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000002','authenticated','authenticated','permission-member@example.test','',now(),now(),now(),'{}','{}'),
('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000003','authenticated','authenticated','permission-other@example.test','',now(),now(),now(),'{}','{}');
insert into public.households(id,name,created_by) values('c2000000-0000-4000-8000-000000000001','Synthetic permission home','c1000000-0000-4000-8000-000000000001');
insert into public.household_members(household_id,user_id,role) values
('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','owner'),
('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','member');
select ok(not has_function_privilege('anon','public.gc_read_permission_status(uuid)','EXECUTE'),'anonymous cannot invoke metadata RPC');
select ok(not has_function_privilege('authenticated','public.gc_read_permission_status(uuid)','EXECUTE'),'authenticated cannot choose actor through RPC');
select ok(has_function_privilege('service_role','public.gc_read_permission_status(uuid)','EXECUTE'),'service may read actor metadata');
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000001')->>'state','not_authorized','absent connection has no grant');
insert into public.google_calendar_connections(id,user_id,household_id,status,scopes) values('c5000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','connected','["https://www.googleapis.com/auth/calendar.app.created"]');
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000001')->>'state','not_authorized','export connection does not imply reading grant');
update public.google_calendar_connections set scopes='["https://www.googleapis.com/auth/tasks.readonly","https://www.googleapis.com/auth/calendar.events.readonly","https://www.googleapis.com/auth/calendar.calendarlist.readonly"]' where id='c5000000-0000-4000-8000-000000000001';
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000001')->>'state','reconnect','grants without credentials require reconnect');
insert into app_private.google_calendar_credentials(connection_id,token_cipher) values('c5000000-0000-4000-8000-000000000001','synthetic-cipher-only');
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000001'),' {"state":"authorized"}'::jsonb,'authorized response exposes only a state');
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000002')->>'state','not_authorized','same household member does not inherit grant');
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000003')->>'state','not_authorized','outsider has no grant');
select ok((select read_claimed_at is null from public.google_calendar_connections where id='c5000000-0000-4000-8000-000000000001'),'metadata does not claim a reading lease');
select is((select count(*)::integer from app_private.google_read_budget where user_id='c1000000-0000-4000-8000-000000000001'),0,'metadata does not consume the Google reading budget');
update public.google_calendar_connections set status='reconnect' where id='c5000000-0000-4000-8000-000000000001';
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000001')->>'state','reconnect','revoked connection is not authorized');
update public.google_calendar_connections set status='disconnecting' where id='c5000000-0000-4000-8000-000000000001';
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000001')->>'state','disconnecting','cleanup in progress has a distinct status');
update public.google_calendar_connections set status='disconnected' where id='c5000000-0000-4000-8000-000000000001';
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000001')->>'state','not_authorized','disconnected grant is not reused');
update public.google_calendar_connections set status='connected' where id='c5000000-0000-4000-8000-000000000001';
delete from public.household_members where user_id='c1000000-0000-4000-8000-000000000001';
select is(public.gc_read_permission_status('c1000000-0000-4000-8000-000000000001')->>'state','not_authorized','membership removal denies old grant');
select * from finish();
rollback;

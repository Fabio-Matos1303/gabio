begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000001','authenticated','authenticated','tasks-owner@example.test','',now(),now(),now(),'{}','{}'),
('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000002','authenticated','authenticated','tasks-member@example.test','',now(),now(),now(),'{}','{}'),
('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000003','authenticated','authenticated','tasks-outside@example.test','',now(),now(),now(),'{}','{}');
insert into public.households(id,name,created_by) values('d2000000-0000-4000-8000-000000000001','Casa sintética Tasks','d1000000-0000-4000-8000-000000000001');
insert into public.household_members(household_id,user_id,role) values
('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','owner'),
('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','member');
select public.gc_finish_oauth('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','synthetic-token-encrypted','["https://www.googleapis.com/auth/calendar.app.created"]','{"exportHousehold":true,"exportPrivate":true,"reminderMinutes":10}');
select public.gc_finish_oauth('d1000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','synthetic-token-encrypted','["https://www.googleapis.com/auth/calendar.app.created"]','{"exportHousehold":true,"exportPrivate":false,"reminderMinutes":null}');
select ok((select relrowsecurity from pg_class where oid='public.google_task_targets'::regclass),'Tasks targets have RLS');
select ok((select relrowsecurity from pg_class where oid='app_private.google_export_intents'::regclass),'export intentions have RLS');
select ok(not has_table_privilege('authenticated','public.google_task_targets','INSERT'),'client cannot register arbitrary target');
select ok(not has_function_privilege('authenticated','public.gc_tasks_identity(uuid,uuid,text,text)','EXECUTE'),'client cannot adopt remote identity');
select ok(has_function_privilege('service_role','public.gc_claim_jobs_v2(integer,boolean,boolean)','EXECUTE'),'worker can claim');
select ok(not has_function_privilege('anon','public.gc_export_preferences(uuid,uuid,integer,text)','EXECUTE'),'anonymous cannot choose actor for preferences');

-- Before activation, new task remains on legacy Calendar. No deadline still records an intention.
insert into public.tasks(id,household_id,title,created_by,owner_user_id,visibility,idempotency_key) values('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Tarefa sintética legada','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','household',gen_random_uuid());
select is((select provider from app_private.google_export_intents where task_id='d3000000-0000-4000-8000-000000000001' limit 1),'google_calendar','legacy intention stays on Calendar');
update app_private.google_export_settings set activated_at=now();
insert into public.tasks(id,household_id,title,created_by,owner_user_id,visibility,idempotency_key) values('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','Nova tarefa sem prazo','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','household',gen_random_uuid());
select is((select count(*)::integer from public.task_calendar_links where task_id='d3000000-0000-4000-8000-000000000002' and provider='google_tasks'),2,'Tasks default exports shared task to each authorized category');
select is(public.gc_export_status('d1000000-0000-4000-8000-000000000001')->>'tasksAuthorized','false','readonly/Calendar grants do not enable Tasks writes');
select public.gc_export_preferences('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',1,'google_calendar');
select lives_ok($$select public.gc_export_preferences('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001',1,'google_calendar')$$,'same preference command can be replayed');
select throws_ok($$select public.gc_export_preferences('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000002',1,'google_tasks')$$,'40001',null,'concurrent stale preference cannot overwrite');
update public.tasks set title='Tarefa editada',due_at=now()+interval '1 day' where id='d3000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.task_calendar_links where task_id='d3000000-0000-4000-8000-000000000002' and provider='google_tasks'),2,'preference change and edit preserve existing provider');
insert into public.tasks(id,household_id,title,created_by,owner_user_id,visibility,idempotency_key) values('d3000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000001','Privada sintética','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','private',gen_random_uuid());
select is((select provider from app_private.google_export_intents where task_id='d3000000-0000-4000-8000-000000000003'),'google_calendar','new tasks follow explicitly changed preference');
update public.tasks set due_at=now()+interval '1 day' where id='d3000000-0000-4000-8000-000000000003';
select is((select count(*)::integer from public.task_calendar_links where task_id='d3000000-0000-4000-8000-000000000003'),1,'private task never creates another member projection');
update public.tasks set due_at=now() where id='d3000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.task_calendar_links where task_id='d3000000-0000-4000-8000-000000000001' and provider='google_calendar'),2,'adding deadline retains legacy destination');

-- OAuth reconnect cannot restore an earlier private-export choice.
select public.gc_preferences('d1000000-0000-4000-8000-000000000001','{"exportHousehold":true,"exportPrivate":false,"reminderMinutes":null}');
select public.gc_finish_oauth('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','synthetic-token-encrypted','["https://www.googleapis.com/auth/calendar.app.created","https://www.googleapis.com/auth/tasks","https://www.googleapis.com/auth/calendar.events.readonly","https://www.googleapis.com/auth/calendar.calendarlist.readonly"]','{"exportHousehold":true,"exportPrivate":true,"reminderMinutes":10,"writeTasks":true}');
select is((select export_private from public.google_calendar_connections where user_id='d1000000-0000-4000-8000-000000000001'),false,'reauthorization preserves current privacy preferences');
select is(public.gc_read_permission_status('d1000000-0000-4000-8000-000000000001')->>'state','authorized','full Tasks scope satisfies readonly capability');
select is(public.gc_export_status('d1000000-0000-4000-8000-000000000001')->>'tasksAuthorized','true','Tasks write grant is recognized');

-- Bound claims: pause does not increase attempts; legacy worker cannot process Tasks.
update public.outbox_events set processed_at=now() where gc_connection_id is not null;
select public.gc_queue_task('d3000000-0000-4000-8000-000000000002');
select is(public.gc_claim_jobs_v2(2,false),'[]'::jsonb,'paused Tasks worker claims nothing');
select is(public.gc_claim_jobs(2),'[]'::jsonb,'old worker cannot claim new Tasks jobs');
select is((select max(attempts) from public.outbox_events where processed_at is null),0,'paused work consumes no attempts');
create temporary table task_job as select value j from jsonb_array_elements(public.gc_claim_jobs_v2(2,true));
select is((select count(*)::integer from task_job),1,'only Tasks writer with consent is claimed');
select public.gc_tasks_target((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'synthetic-list') from task_job;
select public.gc_tasks_attempt((j->>'jobId')::uuid,(j->>'leaseToken')::uuid) from task_job;
select throws_ok($$select public.gc_tasks_attempt((j->>'jobId')::uuid,(j->>'leaseToken')::uuid) from task_job$$,null,null,'cannot repeat insertion attempt');
select public.gc_tasks_identity((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'synthetic-remote',j->>'tokenCipher') from task_job;
update public.tasks set title='Versão posterior' where id='d3000000-0000-4000-8000-000000000002';
select public.gc_finish_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'{"status":"deleted"}') from task_job;
select is((select remote_task_id from public.task_calendar_links l join public.google_calendar_connections c on c.id=l.connection_id where l.task_id='d3000000-0000-4000-8000-000000000002' and c.user_id='d1000000-0000-4000-8000-000000000001'),null,'confirmed deletion tombstones ID even after newer local mutation');

update public.outbox_events set processed_at=now() where gc_connection_id is not null;
select public.gc_disconnect('d1000000-0000-4000-8000-000000000002',true);
update public.outbox_events q set processed_at=now() from public.task_calendar_links l where l.id=q.gc_link_id and l.provider='google_calendar';
select is(public.gc_claim_jobs(2),'[]'::jsonb,'legacy worker cannot claim Tasks cleanup even when it was never sent');
select ok(jsonb_array_length(public.gc_claim_jobs_v2(2,false))>0,'new worker can clean never-sent Tasks without write consent');

set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select throws_ok($$select * from public.google_task_targets$$,'42501',null,'member cannot read internal target identities');
select is((select count(*)::integer from public.google_calendar_connections),1,'RLS exposes only own connection');
reset role;
select * from finish();
rollback;

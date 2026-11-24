begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000000','f1000000-0000-4000-8000-000000000001','authenticated','authenticated','sync-owner@example.test','',now(),now(),now(),'{}','{}'),
('00000000-0000-0000-0000-000000000000','f1000000-0000-4000-8000-000000000002','authenticated','authenticated','sync-member@example.test','',now(),now(),now(),'{}','{}');
insert into public.households(id,name,created_by) values('f2000000-0000-4000-8000-000000000001','Casa sintética de sincronização','f1000000-0000-4000-8000-000000000001');
insert into public.household_members(household_id,user_id,role) values
('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','owner'),
('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','member');
select public.gc_finish_oauth('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','synthetic-cipher','["https://www.googleapis.com/auth/calendar.app.created","https://www.googleapis.com/auth/tasks"]','{"exportHousehold":true,"exportPrivate":true,"reminderMinutes":null}');
select public.gc_finish_oauth('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','synthetic-cipher','["https://www.googleapis.com/auth/calendar.app.created","https://www.googleapis.com/auth/tasks"]','{"exportHousehold":true,"exportPrivate":false,"reminderMinutes":null}');
update app_private.google_export_settings set activated_at=now();

insert into public.tasks(id,household_id,title,created_by,owner_user_id,visibility,idempotency_key,kind,due_at,event_ends_at) values
('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','Evento sintético','f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','household',gen_random_uuid(),'event',now()+interval '1 day',now()+interval '1 day 1 hour');
insert into public.tasks(id,household_id,title,created_by,owner_user_id,visibility,idempotency_key) values
('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','Tarefa sintética','f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','household',gen_random_uuid());
-- Both copies were already exported before a connection required reconnection.
update public.task_calendar_links set remote_task_id='synthetic-remote-task' where provider='google_tasks';
update public.tasks set status='completed',completed_at=now(),version=version+1;
update public.google_calendar_connections set status='reconnect' where user_id='f1000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.outbox_events o join public.google_calendar_connections c on c.id=o.gc_connection_id where c.status='reconnect' and o.processed_at is null and public.gc_job_payload(o.id)->>'action'='delete'),2,'reconnect account has pending cleanup for both providers');

create temporary table claimed as select value as j from jsonb_array_elements(public.gc_claim_jobs_v2(2,true));
select is((select count(*)::integer from claimed),1,'healthy account can claim despite another account cleanup');
select is((select j->>'action' from claimed),'upsert','healthy account receives update instead of deletion');
select is((select j#>>'{task,status}' from claimed),'completed','completed state reaches projection');
select is((select j->>'userId' from claimed),'f1000000-0000-4000-8000-000000000001','job remains bound to authorized account');
select public.gc_finish_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'{"status":"synced","sentVersion":2}') from claimed;
insert into claimed select value from jsonb_array_elements(public.gc_claim_jobs_v2(2,true));
select is((select count(distinct coalesce(j->>'provider','google_calendar'))::integer from claimed),2,'Calendar and Tasks both proceed independently of other account');
select is((select count(*)::integer from claimed where j#>>'{task,status}'='completed'),2,'completion preserved for both providers');
select public.gc_finish_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'{"status":"synced","sentVersion":2}') from claimed where exists(select 1 from public.outbox_events o where o.id=(j->>'jobId')::uuid and o.processed_at is null);
select is((select max(o.attempts) from public.outbox_events o join public.google_calendar_connections c on c.id=o.gc_connection_id where c.status='reconnect'),0,'reconnect account is not written or retried');

-- Revoking Tasks scope must still prevent writes in the healthy account.
update public.google_calendar_connections set scopes='["https://www.googleapis.com/auth/calendar.app.created"]' where status='connected';
update public.tasks set title='Tarefa sintética atualizada',version=version+1 where id='f3000000-0000-4000-8000-000000000002';
select is(public.gc_claim_jobs_v2(2,true),'[]'::jsonb,'missing Tasks scope remains blocked');
update public.google_calendar_connections set scopes='["https://www.googleapis.com/auth/calendar.app.created","https://www.googleapis.com/auth/tasks"]' where status='connected';
select is(public.gc_claim_jobs_v2(2,false),'[]'::jsonb,'paused Tasks writes remain blocked');

-- Same-account cleanup still gates provider conversion, even when deferred.
update public.tasks set kind='event',due_at=now()+interval '1 day',event_ends_at=now()+interval '1 day 1 hour',version=version+1 where id='f3000000-0000-4000-8000-000000000002';
update public.outbox_events o set available_at=now()+interval '1 day' from public.task_calendar_links l where l.id=o.gc_link_id and l.provider='google_tasks';
select is(public.gc_claim_jobs_v2(2,true),'[]'::jsonb,'deferred cleanup blocks new projection within same account');
update public.outbox_events o set available_at=now() from public.task_calendar_links l where l.id=o.gc_link_id and l.provider='google_tasks';
create temporary table cleanup_job as select value as j from jsonb_array_elements(public.gc_claim_jobs_v2(2,true));
select is((select j->>'action' from cleanup_job),'delete','same-account cleanup is claimed first');
select is((select j->>'provider' from cleanup_job),'google_tasks','cleanup uses previous provider');
select public.gc_finish_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'{"status":"deleted"}') from cleanup_job;
create temporary table converted_job as select value as j from jsonb_array_elements(public.gc_claim_jobs_v2(2,true));
select is((select coalesce(j->>'provider','google_calendar') from converted_job),'google_calendar','conversion proceeds after confirmed same-account cleanup');
select public.gc_finish_job((j->>'jobId')::uuid,(j->>'leaseToken')::uuid,'{"status":"synced","sentVersion":4}') from converted_job;

update public.tasks set visibility='private',version=version+1 where id='f3000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.outbox_events o join public.google_calendar_connections c on c.id=o.gc_connection_id where c.status='reconnect' and o.processed_at is null and (public.gc_job_payload(o.id)->>'action'<>'delete' or public.gc_job_payload(o.id)->'task'<>'null'::jsonb)),0,'other member only receives cleanup without private payload');
select ok(not has_function_privilege('authenticated','public.gc_claim_jobs_v2(integer,boolean,boolean)','EXECUTE'),'clients still cannot claim jobs');
select ok(not has_function_privilege('anon','public.gc_claim_jobs_v2(integer,boolean,boolean)','EXECUTE'),'anonymous users still cannot claim jobs');
select ok(has_function_privilege('service_role','public.gc_claim_jobs_v2(integer,boolean,boolean)','EXECUTE'),'service worker remains authorized');
select * from finish();
rollback;

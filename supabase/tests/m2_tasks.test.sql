begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
 ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000001','authenticated','authenticated','owner-m2@example.test','',now(),now(),now(),'{}','{"display_name":"Owner"}'),
 ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000002','authenticated','authenticated','member-m2@example.test','',now(),now(),now(),'{}','{"display_name":"Member"}'),
 ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000003','authenticated','authenticated','outside-m2@example.test','',now(),now(),now(),'{}','{"display_name":"Outside"}');
insert into public.households (id,name,created_by)
values ('82000000-0000-4000-8000-000000000001','Casa M2','81000000-0000-4000-8000-000000000001');
insert into public.household_members (household_id,user_id,role) values
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','owner'),
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','member');
create temporary table task_results (kind text primary key, response jsonb not null);
grant select, insert, update on task_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.execute_task_command('83000000-0000-4000-8000-000000000000','{"type":"create","payload":{"title":"Sem ator"}}')$$,'28000',null,'gateway requires authentication');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.execute_task_command('83000000-0000-4000-8000-000000000009','{"type":"create","payload":{"title":"Sem casa"}}')$$,'42501',null,'actor without household is rejected');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
insert into task_results values ('shared',public.execute_task_command(
 '83000000-0000-4000-8000-000000000001',
 '{"type":"create","payload":{"title":"  Limpar cozinha  ","assigneeUserId":"81000000-0000-4000-8000-000000000002"}}'));
select is((select response#>>'{task,title}' from task_results where kind='shared'),'Limpar cozinha','create normalizes title');
select is((select response#>>'{task,ownerUserId}' from task_results where kind='shared'),'81000000-0000-4000-8000-000000000001','owner derives from auth');
select is((select response#>>'{task,householdId}' from task_results where kind='shared'),'82000000-0000-4000-8000-000000000001','household derives from membership');
select is((select response#>>'{task,version}' from task_results where kind='shared'),'1','new task starts at version one');
select is((select array_agg(key order by key) from jsonb_object_keys((select response from task_results where kind='shared')) key),array['commandId','replayed','task'],'receipt projection is strict');
select ok((public.execute_task_command(
 '83000000-0000-4000-8000-000000000001',
 '{"payload":{"assigneeUserId":"81000000-0000-4000-8000-000000000002","title":"  Limpar cozinha  "},"type":"create"}') ->> 'replayed')::boolean,'canonical JSON replay succeeds');
select is((select count(*) from public.tasks)::bigint,1::bigint,'replay does not duplicate task');
select throws_ok($$select public.execute_task_command('83000000-0000-4000-8000-000000000001','{"type":"create","payload":{"title":"Outro"}}')$$,'22023',null,'changed payload conflicts with receipt');
select throws_ok($$select public.execute_task_command('83000000-0000-4000-8000-000000000010','{"type":"create","payload":{"title":"Extra"},"actor":"fake"}')$$,'22023',null,'extra command keys are rejected');
select throws_ok($$select public.execute_task_command('83000000-0000-4000-8000-000000000011','{"type":"update","payload":{"taskId":"00000000-0000-4000-8000-000000000000","expectedVersion":1.5,"title":"X"}}')$$,'22023',null,'fractional version is rejected');
select throws_ok($$select public.execute_task_command('83000000-0000-4000-8000-000000000012','{"type":"create","payload":{"title":"Recorrente","recurrence":"daily"}}')$$,'22023',null,'recurrence requires due date');
select throws_ok($$select public.execute_task_command('83000000-0000-4000-8000-000000000013','{"type":"create","payload":{"title":"Externa","assigneeUserId":"81000000-0000-4000-8000-000000000003"}}')$$,'P0001',null,'assignee must be a household member');

insert into task_results values
 ('private',public.execute_task_command('83000000-0000-4000-8000-000000000002','{"type":"create","payload":{"title":"Privada","visibility":"private"}}')),
 ('recurring',public.execute_task_command('83000000-0000-4000-8000-000000000003','{"type":"create","payload":{"title":"Regar","dueAt":"2026-09-24T12:00:00Z","recurrence":"daily"}}'));
select is((select count(*) from public.tasks)::bigint,3::bigint,'valid private and recurring tasks are created');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.tasks)::bigint,2::bigint,'RLS hides owner private task from member');
select throws_ok(format('select public.execute_task_command(%L,%L::jsonb)','83000000-0000-4000-8000-000000000014',jsonb_build_object('type','update','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from task_results where kind='private'),'expectedVersion',1,'title','Invasao'))::text),'40001',null,'member cannot edit private task');
select lives_ok(format('select public.execute_task_command(%L,%L::jsonb)','83000000-0000-4000-8000-000000000015',jsonb_build_object('type','update','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from task_results where kind='shared'),'expectedVersion',1,'title','Limpar hoje'))::text),'member edits shared task');
select is((select version from public.tasks where id=(select (response#>>'{task,id}')::uuid from task_results where kind='shared')),2,'update increments version');
select throws_ok(format('select public.execute_task_command(%L,%L::jsonb)','83000000-0000-4000-8000-000000000016',jsonb_build_object('type','update','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from task_results where kind='shared'),'expectedVersion',1,'title','Stale'))::text),'40001',null,'stale update is rejected');
select throws_ok($$update public.tasks set title='Direta' where true$$,'42501',null,'direct update is forbidden');
select throws_ok($$insert into public.tasks(household_id,owner_user_id,created_by,title,idempotency_key) values('82000000-0000-4000-8000-000000000001',auth.uid(),auth.uid(),'Direta',gen_random_uuid())$$,'42501',null,'direct insert is forbidden');
select throws_ok($$delete from public.tasks where true$$,'42501',null,'direct delete is forbidden');
select throws_ok($$select * from public.task_command_receipts$$,'42501',null,'receipts have no client access');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
insert into task_results values ('completed',public.execute_task_command(
 '83000000-0000-4000-8000-000000000004',jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from task_results where kind='recurring'),'expectedVersion',1,'status','completed'))));
select is((select response#>>'{task,status}' from task_results where kind='completed'),'completed','status command completes occurrence');
select is((select count(*) from public.tasks where previous_occurrence_id=(select (response#>>'{task,id}')::uuid from task_results where kind='recurring'))::bigint,1::bigint,'completion creates exactly one next occurrence');
select is((select due_at from public.tasks where previous_occurrence_id=(select (response#>>'{task,id}')::uuid from task_results where kind='recurring')),'2026-09-25T12:00:00Z'::timestamptz,'daily recurrence advances one day');
select throws_ok(format('select public.execute_task_command(%L,%L::jsonb)','83000000-0000-4000-8000-000000000005',jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from task_results where kind='recurring'),'expectedVersion',1,'status','completed'))::text),'40001',null,'second completion with stale version is rejected');
select is((select count(*) from public.tasks where previous_occurrence_id=(select (response#>>'{task,id}')::uuid from task_results where kind='recurring'))::bigint,1::bigint,'double completion cannot duplicate next occurrence');
select ok((public.execute_task_command('83000000-0000-4000-8000-000000000004',jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from task_results where kind='recurring'),'expectedVersion',1,'status','completed'))) ->> 'replayed')::boolean,'completion replay is stable');

select throws_ok(
  format(
    'select public.execute_task_command(%L,%L::jsonb)',
    '83000000-0000-4000-8000-000000000006',
    jsonb_build_object(
      'type','set_status',
      'payload',jsonb_build_object(
        'taskId',(select response#>>'{task,id}' from task_results where kind='recurring'),
        'expectedVersion',2,
        'status','open'
      )
    )::text
  ),
  '40001',null,'completed recurring occurrence cannot be reopened'
);

reset role;
select is((select count(*) from public.audit_log where action like 'task.%')::bigint,5::bigint,'successful non-replayed commands audit once');
select * from finish();
rollback;

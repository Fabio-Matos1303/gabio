begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
 ('00000000-0000-0000-0000-000000000000','84000000-0000-4000-8000-000000000001','authenticated','authenticated','owner-workflow@example.test','',now(),now(),now(),'{}','{"display_name":"Owner"}'),
 ('00000000-0000-0000-0000-000000000000','84000000-0000-4000-8000-000000000002','authenticated','authenticated','member-workflow@example.test','',now(),now(),now(),'{}','{"display_name":"Member"}'),
 ('00000000-0000-0000-0000-000000000000','84000000-0000-4000-8000-000000000003','authenticated','authenticated','outside-workflow@example.test','',now(),now(),now(),'{}','{"display_name":"Outside"}');

insert into public.households (id,name,created_by)
values ('85000000-0000-4000-8000-000000000001','Casa teste','84000000-0000-4000-8000-000000000001');
insert into public.household_members (household_id,user_id,role) values
 ('85000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','owner'),
 ('85000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002','member');

create temporary table workflow_results (kind text primary key, response jsonb not null);
grant select, insert, update on workflow_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','84000000-0000-4000-8000-000000000001',true);
insert into workflow_results values
 ('shared',public.execute_task_command('86000000-0000-4000-8000-000000000001','{"type":"create","payload":{"title":"Tarefa compartilhada"}}')),
 ('private',public.execute_task_command('86000000-0000-4000-8000-000000000002','{"type":"create","payload":{"title":"Tarefa privada","visibility":"private"}}'));
select is((select response#>>'{task,status}' from workflow_results where kind='shared'),'open','new task starts open');

select set_config('request.jwt.claim.sub','84000000-0000-4000-8000-000000000002',true);
select lives_ok(
  format(
    'select public.execute_task_command(%L,%L::jsonb)',
    '86000000-0000-4000-8000-000000000003',
    jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from workflow_results where kind='shared'),'expectedVersion',1,'status','in_progress'))::text
  ),
  'household member starts a shared task'
);
select is((select status::text from public.tasks where id=(select (response#>>'{task,id}')::uuid from workflow_results where kind='shared')),'in_progress','task persists in-progress status');
select is((select version from public.tasks where id=(select (response#>>'{task,id}')::uuid from workflow_results where kind='shared')),2,'status transition increments version');
select lives_ok(
  format(
    'select public.execute_task_command(%L,%L::jsonb)',
    '86000000-0000-4000-8000-000000000004',
    jsonb_build_object('type','update','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from workflow_results where kind='shared'),'expectedVersion',2,'title','Tarefa em execução'))::text
  ),
  'in-progress task remains editable'
);
select throws_ok(
  format(
    'select public.execute_task_command(%L,%L::jsonb)',
    '86000000-0000-4000-8000-000000000005',
    jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from workflow_results where kind='private'),'expectedVersion',1,'status','in_progress'))::text
  ),
  '40001',null,'member cannot start another user private task'
);

select set_config('request.jwt.claim.sub','84000000-0000-4000-8000-000000000001',true);
select lives_ok(
  format(
    'select public.execute_task_command(%L,%L::jsonb)',
    '86000000-0000-4000-8000-000000000006',
    jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from workflow_results where kind='shared'),'expectedVersion',3,'status','completed'))::text
  ),
  'in-progress task can be completed'
);
select is((select status::text from public.tasks where id=(select (response#>>'{task,id}')::uuid from workflow_results where kind='shared')),'completed','completion is persisted');
select isnt((select completed_at from public.tasks where id=(select (response#>>'{task,id}')::uuid from workflow_results where kind='shared')),null,'completion records its timestamp');

select * from finish();
rollback;

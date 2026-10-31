begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select is(public.next_task_recurrence_due_at('2026-11-02T12:00:00Z','custom','{"frequency":"weekly","interval":2,"weekdays":[1,3],"until":null,"timeZone":"America/Bahia"}'), '2026-11-04T12:00:00Z'::timestamptz, 'next selected weekday in eligible week');
select is(public.next_task_recurrence_due_at('2026-11-04T12:00:00Z','custom','{"frequency":"weekly","interval":2,"weekdays":[1,3],"until":null,"timeZone":"America/Bahia"}'), '2026-11-16T12:00:00Z'::timestamptz, 'skip intervening week');
select is(public.next_task_recurrence_due_at('2026-11-08T01:00:00Z','custom','{"frequency":"daily","interval":1,"weekdays":[],"until":"2026-11-08","timeZone":"America/Bahia"}'), '2026-11-09T01:00:00Z'::timestamptz, 'end date is inclusive in local timezone');
select is(public.next_task_recurrence_due_at('2026-11-09T01:00:00Z','custom','{"frequency":"daily","interval":1,"weekdays":[],"until":"2026-11-08","timeZone":"America/Bahia"}'), null::timestamptz, 'stop at end date');
select is(public.next_task_recurrence_due_at('2027-01-31T12:00:00Z','custom','{"frequency":"monthly","interval":3,"weekdays":[],"until":null,"timeZone":"America/Bahia"}'), '2027-04-30T12:00:00Z'::timestamptz, 'clamp month end');
select ok(not public.valid_task_recurrence_rule('{"frequency":"daily","interval":1,"weekdays":[],"until":null,"timeZone":null}', '2026-11-02T12:00:00Z'), 'reject null timezone');
select ok(not public.valid_task_recurrence_rule('{"frequency":"daily","interval":1,"weekdays":[1],"until":null,"timeZone":"America/Bahia"}', '2026-11-02T12:00:00Z'), 'weekdays only for weekly frequency');
select ok(not public.valid_task_recurrence_rule('{"frequency":"weekly","interval":1,"weekdays":[1,1],"until":null,"timeZone":"America/Bahia"}', '2026-11-02T12:00:00Z'), 'reject duplicate days');
select ok(not public.valid_task_recurrence_rule('{"frequency":"weekly","interval":0,"weekdays":[],"until":null,"timeZone":"America/Bahia"}', '2026-11-02T12:00:00Z'), 'reject zero interval');
select ok(not public.valid_task_recurrence_rule('{"frequency":"weekly","interval":1.5,"weekdays":[],"until":null,"timeZone":"America/Bahia"}', '2026-11-02T12:00:00Z'), 'reject fractional interval');
select ok(not public.valid_task_recurrence_rule('{"frequency":"weekly","interval":366,"weekdays":[],"until":null,"timeZone":"America/Bahia"}', '2026-11-02T12:00:00Z'), 'bound interval');
select ok(not public.valid_task_recurrence_rule('{"frequency":"weekly","interval":1,"weekdays":[],"until":"2026-01-01","timeZone":"America/Bahia"}', '2026-11-02T12:00:00Z'), 'reject end before first date');
select ok(not public.valid_task_recurrence_rule('{"frequency":"weekly","interval":1,"weekdays":[2],"until":null,"timeZone":"America/Bahia"}', '2026-11-02T12:00:00Z'), 'first date must match weekdays');

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000001','authenticated','authenticated','recurrence-owner@example.test','',now(),now(),now(),'{}','{"display_name":"Owner"}'),
('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000002','authenticated','authenticated','recurrence-member@example.test','',now(),now(),now(),'{}','{"display_name":"Member"}'),
('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000003','authenticated','authenticated','recurrence-outside@example.test','',now(),now(),now(),'{}','{"display_name":"Outside"}');
insert into public.households(id,name,created_by) values
('a2000000-0000-4000-8000-000000000001','Synthetic home','a1000000-0000-4000-8000-000000000001'),
('a2000000-0000-4000-8000-000000000002','Other synthetic home','a1000000-0000-4000-8000-000000000003');
insert into public.household_members(household_id,user_id,role) values
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','owner'),
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','member'),
('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003','owner');
create temporary table recurrence_results(kind text primary key, response jsonb);
grant select, insert on recurrence_results to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
insert into recurrence_results values
('shared',public.execute_task_command('a3000000-0000-4000-8000-000000000001','{"type":"create","payload":{"title":"Synthetic shared schedule","dueAt":"2026-11-02T12:00:00Z","recurrence":"custom","recurrenceRule":{"frequency":"weekly","interval":2,"weekdays":[1,3],"until":null,"timeZone":"America/Bahia"}}}')),
('private',public.execute_task_command('a3000000-0000-4000-8000-000000000002','{"type":"create","payload":{"title":"Synthetic private schedule","visibility":"private","dueAt":"2026-11-02T12:00:00Z","recurrence":"custom","recurrenceRule":{"frequency":"daily","interval":1,"weekdays":[],"until":"2026-11-02","timeZone":"America/Bahia"}}}'));
select is((select response#>>'{task,recurrenceRule,frequency}' from recurrence_results where kind='shared'),'weekly','receipt includes custom rule');
insert into recurrence_results select 'done',public.execute_task_command('a3000000-0000-4000-8000-000000000003',jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',response#>>'{task,id}','expectedVersion',1,'status','completed'))) from recurrence_results where kind='shared';
select is((select count(*)::integer from public.tasks where previous_occurrence_id=(select (response#>>'{task,id}')::uuid from recurrence_results where kind='shared')),1,'one next occurrence');
select is((select due_at from public.tasks where previous_occurrence_id=(select (response#>>'{task,id}')::uuid from recurrence_results where kind='shared')),'2026-11-04T12:00:00Z'::timestamptz,'gateway calculates selected weekday');
select is((select recurrence_rule from public.tasks where previous_occurrence_id=(select (response#>>'{task,id}')::uuid from recurrence_results where kind='shared')),(select response#>'{task,recurrenceRule}' from recurrence_results where kind='shared'),'copy rule without changes');
insert into recurrence_results select 'replay',public.execute_task_command('a3000000-0000-4000-8000-000000000003',jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',response#>>'{task,id}','expectedVersion',1,'status','completed'))) from recurrence_results where kind='shared';
select is((select response->>'replayed' from recurrence_results where kind='replay'),'true','same command returns receipt');
select is((select count(*)::integer from public.tasks where previous_occurrence_id=(select (response#>>'{task,id}')::uuid from recurrence_results where kind='shared')),1,'replay does not duplicate occurrence');
insert into recurrence_results select 'ended',public.execute_task_command('a3000000-0000-4000-8000-000000000004',jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',response#>>'{task,id}','expectedVersion',1,'status','completed'))) from recurrence_results where kind='private';
select is((select count(*)::integer from public.tasks where previous_occurrence_id=(select (response#>>'{task,id}')::uuid from recurrence_results where kind='private')),0,'end date prevents spawning without blocking completion');
select throws_ok($$select public.execute_task_command('a3000000-0000-4000-8000-000000000005','{"type":"create","payload":{"title":"Invalid schedule","dueAt":"2026-11-02T12:00:00Z","recurrence":"custom","recurrenceRule":{"frequency":"daily","interval":1,"weekdays":[],"until":null,"timeZone":"America/Bahia","extra":true}}}')$$,'22023',null,'unknown rule keys rejected');
select throws_ok($$select public.execute_task_command('a3000000-0000-4000-8000-000000000006','{"type":"create","payload":{"title":"Invalid schedule","dueAt":"2026-11-02T12:00:00Z","recurrence":"custom"}}')$$,'22023',null,'custom rule required');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.tasks where id=(select (response#>>'{task,id}')::uuid from recurrence_results where kind='private')),0,'other member cannot read private schedule');
select throws_ok(format('select public.execute_task_command(%L,%L::jsonb)','a3000000-0000-4000-8000-000000000007',jsonb_build_object('type','update','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from recurrence_results where kind='private'),'expectedVersion',2,'title','Unauthorized'))::text),'40001',null,'other member cannot update private schedule');
select is((select count(*)::integer from public.tasks where id=(select (response#>>'{task,id}')::uuid from recurrence_results where kind='shared')),1,'member can read shared schedule');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.tasks where id=(select (response#>>'{task,id}')::uuid from recurrence_results where kind='shared')),0,'other household cannot read schedule');
reset role;
select ok(not has_function_privilege('anon','public.execute_task_command(uuid,jsonb)','EXECUTE'),'anonymous gateway access remains revoked');
select ok(not has_function_privilege('authenticated','public.next_task_recurrence_due_at(timestamptz,public.task_recurrence,jsonb)','EXECUTE'),'helper is not an extra client RPC');
select * from finish();
rollback;

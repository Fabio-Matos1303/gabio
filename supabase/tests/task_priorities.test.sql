begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
('71000000-0000-4000-8000-000000000001','priority-owner@example.test','{}'),
('71000000-0000-4000-8000-000000000002','priority-member@example.test','{}'),
('71000000-0000-4000-8000-000000000003','priority-outsider@example.test','{}');
insert into public.households(id,name,created_by) values
('72000000-0000-4000-8000-000000000001','Casa sintética prioridade','71000000-0000-4000-8000-000000000001'),
('72000000-0000-4000-8000-000000000002','Outra casa sintética','71000000-0000-4000-8000-000000000003');
insert into public.household_members(household_id,user_id,role) values
('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','owner'),
('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','member'),
('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000003','owner');
insert into public.tasks(id,household_id,owner_user_id,created_by,title,visibility,due_at,recurrence,idempotency_key) values
('73000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Rotina sintética','household','2027-01-04T12:00:00Z','daily',gen_random_uuid()),
('73000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Tarefa privada sintética','private',null,'none',gen_random_uuid());
create function pg_temp.priority_command(target uuid,ver integer,value jsonb,cid uuid default gen_random_uuid()) returns jsonb
language sql as $$ select public.execute_task_priority_command(cid,jsonb_build_object('type','update','payload',jsonb_build_object('taskId',target,'expectedVersion',ver,'priority',value))); $$;
select ok((select relrowsecurity from pg_class where oid='public.tasks'::regclass),'tasks RLS remains enabled');
select ok(not has_table_privilege('authenticated','public.tasks','update'),'no direct authenticated task update');
select ok(not has_function_privilege('anon','public.execute_task_priority_command(uuid,jsonb)','execute'),'anon cannot execute priority command');
select ok(not has_function_privilege('authenticated','public.copy_task_priority()','execute'),'trigger cannot be called directly');
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000001',1,'"high"')$$,'28000',null,'missing actor rejected');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select is((select priority from public.tasks where id='73000000-0000-4000-8000-000000000001'),'medium','existing task defaults medium');
select ok(not(public.list_tasks_page_v3(0)->0 ? 'priority'),'legacy reader unchanged');
select is(public.list_tasks_page_v4(0)->0->>'priority','medium','v4 supplies priority');
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000001',1,'null')$$,'22023',null,'null rejected');
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000001',1,'3')$$,'22023',null,'number rejected');
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000001',1,'"urgent"')$$,'22023',null,'unknown enum rejected');
select is(pg_temp.priority_command('73000000-0000-4000-8000-000000000001',1,'"high"','74000000-0000-4000-8000-000000000001')#>>'{task,priority}','high','owner updates priority');
select is(pg_temp.priority_command('73000000-0000-4000-8000-000000000001',1,'"high"','74000000-0000-4000-8000-000000000001')->>'replayed','true','lost response replays old expectedVersion');
select is((select version from public.tasks where id='73000000-0000-4000-8000-000000000001'),2,'replay does not increment version');
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000001',1,'"low"','74000000-0000-4000-8000-000000000001')$$,'22023',null,'commandId reuse with changed payload rejected');
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000001',1,'"low"')$$,'40001',null,'stale writer rejected');
select throws_ok($$select public.execute_task_priority_command(gen_random_uuid(),'{"type":"update","payload":{"taskId":"73000000-0000-4000-8000-000000000001","expectedVersion":2,"priority":"low","title":"Unexpected"}}')$$,'22023',null,'mixed properties rejected');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.tasks),1,'member cannot read private task priority');
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000002',1,'"high"')$$,'40001',null,'member cannot update private priority');
select is(pg_temp.priority_command('73000000-0000-4000-8000-000000000001',2,'"low"','74000000-0000-4000-8000-000000000002')#>>'{task,priority}','low','member updates shared priority');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select public.execute_task_command(gen_random_uuid(),'{"type":"update","payload":{"taskId":"73000000-0000-4000-8000-000000000001","expectedVersion":3,"visibility":"private"}}');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000001',2,'"low"','74000000-0000-4000-8000-000000000002')$$,'40001',null,'priority replay rechecks current access');
select throws_ok($$select public.execute_task_command('74000000-0000-4000-8000-000000000002','{"type":"update","payload":{"taskId":"73000000-0000-4000-8000-000000000001","expectedVersion":2,"priority":"low"}}')$$,'22023',null,'legacy gateway cannot replay namespaced receipt after loss of access');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.tasks),0,'outsider reads no priorities');
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000001',4,'"high"')$$,'40001',null,'other household cannot update');
select is(jsonb_array_length(public.list_tasks_page_v4(0)),0,'v4 respects household RLS');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select public.execute_task_command(gen_random_uuid(),'{"type":"set_status","payload":{"taskId":"73000000-0000-4000-8000-000000000001","expectedVersion":4,"status":"completed"}}');
select is((select priority from public.tasks where previous_occurrence_id='73000000-0000-4000-8000-000000000001'),'low','legacy completion copies priority to next occurrence');
select throws_ok($$select pg_temp.priority_command('73000000-0000-4000-8000-000000000001',5,'"high"')$$,'40001',null,'completed task read only');
select is(pg_temp.priority_command('73000000-0000-4000-8000-000000000001',1,'"high"','74000000-0000-4000-8000-000000000001')->>'replayed','true','authorized replay remains valid after completion');
reset role;
select is((select count(*)::integer from public.audit_log where action='task.priority'),2,'one audit per applied command');
select ok(not exists(select 1 from public.audit_log where action='task.priority' and (metadata ? 'title' or metadata ? 'priority')),'audit excludes task content');
select * from finish();
rollback;

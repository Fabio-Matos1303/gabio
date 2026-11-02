begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000000','b1000000-0000-4000-8000-000000000001','authenticated','authenticated','views-owner@example.test','',now(),now(),now(),'{}','{"display_name":"Synthetic owner"}'),
('00000000-0000-0000-0000-000000000000','b1000000-0000-4000-8000-000000000002','authenticated','authenticated','views-member@example.test','',now(),now(),now(),'{}','{"display_name":"Synthetic member"}'),
('00000000-0000-0000-0000-000000000000','b1000000-0000-4000-8000-000000000003','authenticated','authenticated','views-other@example.test','',now(),now(),now(),'{}','{"display_name":"Synthetic outsider"}');
insert into public.households(id,name,created_by) values
('b2000000-0000-4000-8000-000000000001','Synthetic tags home','b1000000-0000-4000-8000-000000000001'),
('b2000000-0000-4000-8000-000000000002','Synthetic other home','b1000000-0000-4000-8000-000000000003');
insert into public.household_members(household_id,user_id,role) values
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','owner'),
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','member'),
('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000003','owner');
create temporary table views_results(kind text primary key,response jsonb);
grant select,insert on views_results to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
insert into views_results values
('shared',public.execute_task_command('b3000000-0000-4000-8000-000000000001','{"type":"create","payload":{"title":"Synthetic shared","dueAt":"2026-11-02T12:00:00Z","recurrence":"daily","tags":["  Casa   limpa  ","Rotina"]}}')),
('private',public.execute_task_command('b3000000-0000-4000-8000-000000000002','{"type":"create","payload":{"title":"Synthetic private","visibility":"private","tags":["Segredo fictício"]}}'));
select is((select response#>>'{task,tags,0}' from views_results where kind='shared'),'Casa limpa','normalize tag whitespace');
select is((select count(*)::integer from public.task_tags),3,'owner can read private and shared catalog');
select is(jsonb_array_length(public.list_tasks_page(0)),2,'paged reading includes both authorized tasks');
select ok(public.list_tasks_page(0)->0 ? 'tags','paged reading includes tags');
select throws_ok($$select public.execute_task_command('b3000000-0000-4000-8000-000000000003','{"type":"create","payload":{"title":"Invalid","tags":["Casa","casa"]}}')$$,'22023',null,'duplicate names rejected');
select throws_ok($$select public.execute_task_command('b3000000-0000-4000-8000-000000000003','{"type":"create","payload":{"title":"Invalid","tags":null}}')$$,'22023',null,'null tags rejected');
select throws_ok($$select public.execute_task_command('b3000000-0000-4000-8000-000000000003','{"type":"create","payload":{"title":"Invalid","tags":["abcdefghijklmnopqrstuvwxyz0123456789"]}}')$$,'22023',null,'long names rejected');
select throws_ok(format('select public.execute_task_command(%L,%L::jsonb)','b3000000-0000-4000-8000-000000000004',jsonb_build_object('type','update','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from views_results where kind='private'),'expectedVersion',1,'visibility','household'))::text),'22023',null,'private tags cannot be silently promoted');
insert into views_results select 'done',public.execute_task_command('b3000000-0000-4000-8000-000000000005',jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',response#>>'{task,id}','expectedVersion',1,'status','completed'))) from views_results where kind='shared';
select is((select count(*)::integer from public.task_tag_links l join public.tasks t on t.id=l.task_id where t.previous_occurrence_id=(select (response#>>'{task,id}')::uuid from views_results where kind='shared')),2,'recurrence copies links');
select is((public.execute_task_command('b3000000-0000-4000-8000-000000000005',jsonb_build_object('type','set_status','payload',jsonb_build_object('taskId',(select response#>>'{task,id}' from views_results where kind='shared'),'expectedVersion',1,'status','completed')))->>'replayed'),'true','completion replay is idempotent');
select is((select count(*)::integer from public.tasks where previous_occurrence_id=(select (response#>>'{task,id}')::uuid from views_results where kind='shared')),1,'one recurring occurrence');
insert into views_results select 'private_tag',jsonb_build_object('id',id) from public.task_tags where visibility='private';
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.task_tags),2,'member cannot enumerate private tags');
select is((select count(*)::integer from public.task_tag_links where task_id=(select (response#>>'{task,id}')::uuid from views_results where kind='private')),0,'member cannot enumerate private links');
select throws_ok(format('select public.execute_tag_command(%L,%L::jsonb)','b4000000-0000-4000-8000-000000000001',jsonb_build_object('type','rename','tagId',(select response->>'id' from views_results where kind='private_tag'),'expectedVersion',1,'name','Unauthorized')::text),'40001',null,'member cannot rename private tag');
insert into views_results select 'rename',public.execute_tag_command('b4000000-0000-4000-8000-000000000002',jsonb_build_object('type','rename','tagId',id,'expectedVersion',version,'name','Casa organizada')) from public.task_tags where name='Casa limpa';
select is((select count(*)::integer from public.task_tags where name='Casa organizada'),1,'member may rename shared tag');
select is((select count(*)::integer from public.tasks where visibility='household' and version>1),2,'rename versions affected tasks including next occurrence');
insert into views_results select 'deleted_tag',jsonb_build_object('id',id,'version',version) from public.task_tags where name='Rotina';
insert into views_results select 'delete',public.execute_tag_command('b4000000-0000-4000-8000-000000000003',jsonb_build_object('type','delete','tagId',response->>'id','expectedVersion',(response->>'version')::integer)) from views_results where kind='deleted_tag';
select is((select count(*)::integer from public.task_tags where name='Rotina'),0,'delete removes catalog tag');
select is((select count(*)::integer from public.task_tag_links where tag_id=(select (response->>'id')::uuid from views_results where kind='deleted_tag')),0,'delete removes all corresponding links');
select is((select count(*)::integer from public.tasks),2,'delete does not remove authorized tasks');
select is(public.execute_tag_command('b4000000-0000-4000-8000-000000000003',jsonb_build_object('type','delete','tagId',(select response->>'id' from views_results where kind='deleted_tag'),'expectedVersion',1))->>'replayed','true','delete replay returns original receipt');
select throws_ok($$insert into public.task_tags(household_id,owner_user_id,visibility,name) values('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','household','Bypass')$$,'42501',null,'direct catalog writes forbidden');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.task_tags),0,'other household cannot enumerate tags');
select is((select count(*)::integer from public.task_tag_links),0,'other household cannot enumerate links');
select is(jsonb_array_length(public.list_tasks_page(0)),0,'other household paged reading isolated');
reset role;
select ok(not has_table_privilege('authenticated','public.task_tags','TRUNCATE'),'catalog truncate revoked');
select ok(not has_table_privilege('authenticated','public.task_tag_links','TRUNCATE'),'links truncate revoked');
select ok(not has_table_privilege('authenticated','public.external_task_tags','TRUNCATE'),'external tags truncate revoked');
select ok(not exists(select 1 from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p where has_table_privilege('authenticated','public.task_tags',p) or has_table_privilege('authenticated','public.task_tag_links',p) or has_table_privilege('authenticated','public.external_task_tags',p)),'no direct mutation privileges on any tag table');
select ok(not has_function_privilege('authenticated','public.apply_task_tags(public.tasks,jsonb)','EXECUTE'),'tag helper not client RPC');
select ok(not has_function_privilege('authenticated','public.gc_read_context(uuid,boolean)','EXECUTE'),'credential RPC service only');
select ok(not has_function_privilege('anon','public.list_tasks_page(integer)','EXECUTE'),'anonymous cannot list tasks');
select is(public.gc_read_context('b1000000-0000-4000-8000-000000000001')->>'state','consent_required','absent Google connection requests consent');
insert into public.google_calendar_connections(id,user_id,household_id,status,scopes) values('b5000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','connected','["https://www.googleapis.com/auth/calendar.app.created","https://www.googleapis.com/auth/tasks.readonly","https://www.googleapis.com/auth/calendar.events.readonly","https://www.googleapis.com/auth/calendar.calendarlist.readonly"]');
insert into app_private.google_calendar_credentials values('b5000000-0000-4000-8000-000000000001','synthetic-ciphertext-only');
insert into views_results select 'generation',jsonb_build_object('id',read_generation) from public.google_calendar_connections where id='b5000000-0000-4000-8000-000000000001';
select is(public.gc_read_context('b1000000-0000-4000-8000-000000000001',true)->>'state','connected','authorized read claims available');
select is(public.gc_read_context('b1000000-0000-4000-8000-000000000001',true)->>'state','rate_limited','read claims rate limited');
select public.gc_save_external_tags('b1000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001',(select (response->>'id')::uuid from views_results where kind='generation'),'synthetic-list','synthetic-task','["Local"]');
select public.gc_save_external_tags('b1000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001',(select (response->>'id')::uuid from views_results where kind='generation'),'synthetic-list','synthetic-task','["Local"]');
select is((select count(*)::integer from public.external_task_tags),1,'external tag replay does not duplicate');
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.external_task_tags),0,'member cannot read external annotations');
reset role;
update public.google_calendar_connections set scopes=scopes where id='b5000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.external_task_tags),0,'reconnection purges prior annotations');
select isnt((select read_generation::text from public.google_calendar_connections where id='b5000000-0000-4000-8000-000000000001'),(select response->>'id' from views_results where kind='generation'),'reconnection rotates generation');
select throws_ok(format('select public.gc_save_external_tags(%L,%L,%L,%L,%L,%L::jsonb)','b1000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000002',(select response->>'id' from views_results where kind='generation'),'synthetic-list','synthetic-task','["Old"]'),'42501',null,'old generation cannot write');
select * from finish();
rollback;

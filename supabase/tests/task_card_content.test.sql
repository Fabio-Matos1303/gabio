begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000001','authenticated','authenticated','card-owner@example.test','',now(),now(),now(),'{}','{}'),
('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000002','authenticated','authenticated','card-member@example.test','',now(),now(),now(),'{}','{}'),
('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000003','authenticated','authenticated','card-outsider@example.test','',now(),now(),now(),'{}','{}');
insert into public.households(id,name,created_by) values
('92000000-0000-4000-8000-000000000001','Casa sintética','91000000-0000-4000-8000-000000000001'),
('92000000-0000-4000-8000-000000000002','Outra casa sintética','91000000-0000-4000-8000-000000000003');
insert into public.household_members(household_id,user_id,role) values
('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','owner'),
('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','member'),
('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000003','owner');
insert into public.tasks(id,household_id,owner_user_id,created_by,visibility,title,due_at,recurrence,idempotency_key) values
('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','household','Rotina sintética','2027-01-04T12:00:00Z','daily',gen_random_uuid()),
('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','private','Tarefa privada sintética',null,'none',gen_random_uuid()),
('93000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','household','Tarefa com acesso mutável',null,'none',gen_random_uuid());

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.task_card_notes'::regclass,'public.task_checklists'::regclass,'public.task_checklist_items'::regclass,'public.task_card_command_receipts'::regclass)),'RLS enabled on all new tables');
select ok(not has_function_privilege('anon','public.execute_task_card_command(uuid,jsonb)','execute'),'anonymous cannot execute commands');
select ok(not has_function_privilege('authenticated','public.copy_task_card_content()','execute'),'client cannot invoke copy trigger');
select ok(not has_table_privilege('authenticated','public.task_card_command_receipts','select'),'receipts are server-only');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select is(public.read_task_card('93000000-0000-4000-8000-000000000001')->>'notesVersion','0','legacy task has empty detail version');
select lives_ok($$select public.execute_task_card_command('94000000-0000-4000-8000-000000000001','{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000001","expectedVersion":0,"notes":"Orientação sintética"}}')$$,'owner writes shared notes');
select is(public.read_task_card('93000000-0000-4000-8000-000000000001')->>'notes','Orientação sintética','notes readable');
select is(public.execute_task_card_command('94000000-0000-4000-8000-000000000001','{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000001","expectedVersion":0,"notes":"Orientação sintética"}}')->>'replayed','true','same command replays');
select is(public.read_task_card('93000000-0000-4000-8000-000000000001')->>'notesVersion','1','replay does not increment content version');
select throws_ok($$select public.execute_task_card_command('94000000-0000-4000-8000-000000000001','{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000001","expectedVersion":0,"notes":"Outro texto"}}')$$,'22023',null,'changed payload with same ID rejected');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000001","expectedVersion":0,"notes":"Desatualizado"}}')$$,'40001',null,'stale version conflicts');
select throws_ok($$insert into public.task_card_notes values('93000000-0000-4000-8000-000000000002','Bypass',1)$$,'42501',null,'direct notes writes denied');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000001","expectedVersion":1,"notes":"X","actor":"fake"}}')$$,'22023',null,'unknown fields rejected');
select lives_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_checklist","payload":{"taskId":"93000000-0000-4000-8000-000000000001","checklistId":"95000000-0000-4000-8000-000000000001","expectedVersion":0,"title":" Etapas ","items":[{"id":"96000000-0000-4000-8000-000000000001","text":" Primeira etapa ","completed":true},{"id":"96000000-0000-4000-8000-000000000002","text":"Segunda etapa","completed":false}]}}')$$,'creates ordered checklist');
select is(public.read_task_card('93000000-0000-4000-8000-000000000001')#>>'{checklists,0,title}','Etapas','normalizes title');
select is(public.read_task_card('93000000-0000-4000-8000-000000000001')#>>'{checklists,0,items,0,text}','Primeira etapa','normalizes item and keeps order');
select is((public.list_tasks_page_v3()->0->'cardSummary'->>'totalItems')::integer,2,'list includes counts');
select ok(not ((public.list_tasks_page_v2()->0) ? 'cardSummary'),'legacy list response stays unchanged');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_checklist","payload":{"taskId":"93000000-0000-4000-8000-000000000001","checklistId":"95000000-0000-4000-8000-000000000002","expectedVersion":0,"title":"\n\t","items":[]}}')$$,'22023',null,'whitespace-only title rejected');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_checklist","payload":{"taskId":"93000000-0000-4000-8000-000000000001","checklistId":"95000000-0000-4000-8000-000000000002","expectedVersion":0,"title":"Lista","items":[{"id":"96000000-0000-4000-8000-000000000003","text":"\n\t","completed":false}]}}')$$,'22023',null,'whitespace-only item rejected');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_checklist","payload":{"taskId":"93000000-0000-4000-8000-000000000001","checklistId":"95000000-0000-4000-8000-000000000002","expectedVersion":0,"title":"Lista","items":[{"id":"96000000-0000-4000-8000-000000000003","text":"A","completed":false},{"id":"96000000-0000-4000-8000-000000000003","text":"B","completed":false}]}}')$$,'22023',null,'duplicate item IDs rejected');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_checklist","payload":{"taskId":"93000000-0000-4000-8000-000000000001","checklistId":"95000000-0000-4000-8000-000000000002","expectedVersion":0,"title":"Lista","items":[{"id":"96000000-0000-4000-8000-000000000001","text":"ID reaproveitado","completed":false}]}}')$$,'40001',null,'cannot move item IDs between checklists');
select lives_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000002","expectedVersion":0,"notes":"Nota privada sintética"}}')$$,'owner writes private notes');
select lives_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_checklist","payload":{"taskId":"93000000-0000-4000-8000-000000000002","checklistId":"95000000-0000-4000-8000-000000000002","expectedVersion":0,"title":"Lista privada","items":[{"id":"96000000-0000-4000-8000-000000000004","text":"Etapa privada","completed":false}]}}')$$,'owner writes private checklist');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.task_card_notes),1,'member cannot select private notes');
select is((select count(*)::integer from public.task_checklists),1,'member cannot select private lists');
select is((select count(*)::integer from public.task_checklist_items),2,'member cannot select private items');
select throws_ok($$select public.read_task_card('93000000-0000-4000-8000-000000000002')$$,'40001',null,'member cannot read private card');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000002","expectedVersion":1,"notes":"Bypass"}}')$$,'40001',null,'member cannot mutate private card');
select lives_ok($$select public.execute_task_card_command('94000000-0000-4000-8000-000000000002','{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000003","expectedVersion":0,"notes":"Comentário sintético"}}')$$,'member can edit shared card');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.execute_task_command(gen_random_uuid(),'{"type":"update","payload":{"taskId":"93000000-0000-4000-8000-000000000003","expectedVersion":1,"visibility":"private"}}');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.execute_task_card_command('94000000-0000-4000-8000-000000000002','{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000003","expectedVersion":0,"notes":"Comentário sintético"}}')$$,'40001',null,'authorization revalidated before replay');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.task_card_notes),0,'other household sees no notes');
select is((select count(*)::integer from public.task_checklists),0,'other household sees no lists');
select is((select count(*)::integer from public.task_checklist_items),0,'other household sees no items');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"delete_checklist","payload":{"taskId":"93000000-0000-4000-8000-000000000001","checklistId":"95000000-0000-4000-8000-000000000001","expectedVersion":1}}')$$,'40001',null,'other household cannot delete list');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.execute_task_command('94000000-0000-4000-8000-000000000003','{"type":"set_status","payload":{"taskId":"93000000-0000-4000-8000-000000000001","expectedVersion":1,"status":"completed"}}');
select public.execute_task_command('94000000-0000-4000-8000-000000000003','{"type":"set_status","payload":{"taskId":"93000000-0000-4000-8000-000000000001","expectedVersion":1,"status":"completed"}}');
select is((select count(*)::integer from public.tasks where previous_occurrence_id='93000000-0000-4000-8000-000000000001'),1,'completion replay creates one recurrence');
select is((select n.notes from public.task_card_notes n join public.tasks t on t.id=n.task_id where t.previous_occurrence_id='93000000-0000-4000-8000-000000000001'),'Orientação sintética','recurrence copies notes');
select is((select count(*)::integer from public.task_checklist_items i join public.task_checklists c on c.id=i.checklist_id join public.tasks t on t.id=c.task_id where t.previous_occurrence_id='93000000-0000-4000-8000-000000000001'),2,'recurrence copies all items');
select is((select count(*)::integer from public.task_checklist_items i join public.task_checklists c on c.id=i.checklist_id join public.tasks t on t.id=c.task_id where t.previous_occurrence_id='93000000-0000-4000-8000-000000000001' and i.completed),0,'recurrence resets progress');
select is(public.read_task_card('93000000-0000-4000-8000-000000000001')#>>'{checklists,0,items,0,completed}','true','previous occurrence retains progress');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_notes","payload":{"taskId":"93000000-0000-4000-8000-000000000001","expectedVersion":1,"notes":"Mudança após concluir"}}')$$,'40001',null,'completed card is read only');
select public.execute_task_card_command(gen_random_uuid(),'{"type":"delete_checklist","payload":{"taskId":"93000000-0000-4000-8000-000000000002","checklistId":"95000000-0000-4000-8000-000000000002","expectedVersion":1}}');
select is(jsonb_array_length(public.read_task_card('93000000-0000-4000-8000-000000000002')->'checklists'),0,'deleted checklist hidden');
select throws_ok($$select public.execute_task_card_command(gen_random_uuid(),'{"type":"save_checklist","payload":{"taskId":"93000000-0000-4000-8000-000000000002","checklistId":"95000000-0000-4000-8000-000000000002","expectedVersion":0,"title":"Recriação","items":[]}}')$$,'40001',null,'tombstone prevents stale recreation');
reset role;
select is(public.card_text_length('😀'),2,'database length matches UTF-16 schema length');
select is((select count(*)::integer from public.audit_log where metadata->>'command_id'='94000000-0000-4000-8000-000000000001'),1,'replay does not duplicate audit');
select ok(not exists(select 1 from public.audit_log where metadata::text like '%Orientação sintética%'),'audit does not contain notes text');
select * from finish();
rollback;

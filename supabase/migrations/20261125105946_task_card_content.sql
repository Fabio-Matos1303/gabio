begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- Publish the two reviewed development migrations in one transaction.
do $guard$
begin
 if to_regclass('public.task_card_notes') is not null
  or to_regclass('public.task_checklists') is not null
  or to_regclass('public.task_checklist_items') is not null
  or to_regclass('public.task_card_command_receipts') is not null then
  raise exception 'card schema already exists; inspect migration history before retry';
 end if;
 if (select md5(prosrc) from pg_proc where oid='public.execute_task_command(uuid,jsonb)'::regprocedure) is distinct from '9020062219c5ccc02e7c118d1a401893'
  or (select md5(prosrc) from pg_proc where oid='public.list_tasks_page_v2(integer)'::regprocedure) is distinct from '2b4f9e14c73662e9d82e0237118d5cf6'
  or (select md5(prosrc) from pg_proc where oid='public.task_to_json(public.tasks)'::regprocedure) is distinct from 'd2ee7a1f48dda248416a0cb89e174e53'
  or (select md5(prosrc) from pg_proc where oid='public.next_task_recurrence_due_at(timestamptz,public.task_recurrence,jsonb)'::regprocedure) is distinct from '842760ccc310ba24bc497e845f65dac9' then
  raise exception 'unexpected task baseline; inspect before applying';
 end if;
end;
$guard$;
-- Match JavaScript String.trim and UTF-16 length used by the public schemas.
create function public.card_trim(value text) returns text language sql immutable strict
set search_path=pg_catalog as $$
 select regexp_replace(value,U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+$','','g');
$$;
create function public.card_text_length(value text) returns integer language sql immutable strict
set search_path=pg_catalog as $$
 select char_length(value)+char_length(regexp_replace(value,U&'[^\+010000-\+10FFFF]','','g'));
$$;

create table public.task_card_notes (
 task_id uuid primary key references public.tasks(id) on delete cascade,
 notes text not null check(public.card_text_length(notes)<=10000),
 version integer not null check(version>0)
);
create table public.task_checklists (
 id uuid primary key,
 task_id uuid not null references public.tasks(id) on delete cascade,
 title text not null check(public.card_text_length(public.card_trim(title)) between 1 and 120),
 version integer not null check(version>0),
 created_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index task_checklists_task on public.task_checklists(task_id);
create table public.task_checklist_items (
 id uuid primary key,
 checklist_id uuid not null references public.task_checklists(id) on delete cascade,
 text text not null check(public.card_text_length(public.card_trim(text)) between 1 and 500),
 completed boolean not null,
 position integer not null check(position between 0 and 99),
 unique(checklist_id,position)
);
create table public.task_card_command_receipts (
 actor_user_id uuid not null references public.profiles(id) on delete restrict,
 command_id uuid not null,
 household_id uuid not null references public.households(id) on delete cascade,
 task_id uuid not null references public.tasks(id) on delete cascade,
 payload_hash bytea not null,
 response jsonb not null,
 primary key(actor_user_id,command_id)
);
alter table public.task_card_notes enable row level security;
alter table public.task_checklists enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_card_command_receipts enable row level security;
create policy notes_read on public.task_card_notes for select to authenticated
 using(exists(select 1 from public.tasks t where t.id=task_id));
create policy checklists_read on public.task_checklists for select to authenticated
 using(deleted_at is null and exists(select 1 from public.tasks t where t.id=task_id));
create policy checklist_items_read on public.task_checklist_items for select to authenticated
 using(exists(select 1 from public.task_checklists c where c.id=checklist_id));
revoke all on public.task_card_notes, public.task_checklists, public.task_checklist_items,
 public.task_card_command_receipts from public,anon,authenticated;
grant select on public.task_card_notes,public.task_checklists,public.task_checklist_items to authenticated;

create function public.read_task_card(target_task_id uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not exists(select 1 from public.tasks where id=target_task_id) then
  raise exception 'task conflict or unavailable' using errcode='40001';
 end if;
 select jsonb_build_object('taskId',target_task_id,'notes',coalesce(n.notes,''),'notesVersion',coalesce(n.version,0),
  'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'version',c.version,
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'text',i.text,'completed',i.completed) order by i.position)
      from public.task_checklist_items i where i.checklist_id=c.id),'[]'::jsonb)) order by c.created_at,c.id)
    from public.task_checklists c where c.task_id=target_task_id and c.deleted_at is null),'[]'::jsonb)) into result
 from (select 1) seed left join public.task_card_notes n on n.task_id=target_task_id;
 return result;
end; $$;

create function public.list_tasks_page_v3(page_offset integer default 0) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(entry || jsonb_build_object('cardSummary',jsonb_build_object(
  'hasNotes',exists(select 1 from public.task_card_notes n where n.task_id=(entry->>'id')::uuid and length(btrim(n.notes))>0),
  'totalItems',(select count(*) from public.task_checklist_items i join public.task_checklists c on c.id=i.checklist_id where c.task_id=(entry->>'id')::uuid and c.deleted_at is null),
  'completedItems',(select count(*) from public.task_checklist_items i join public.task_checklists c on c.id=i.checklist_id where c.task_id=(entry->>'id')::uuid and c.deleted_at is null and i.completed))) order by ord),'[]'::jsonb)
 from jsonb_array_elements(public.list_tasks_page_v2(page_offset)) with ordinality as items(entry,ord);
$$;

create function public.execute_task_card_command(command_id uuid, command jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare actor uuid:=auth.uid(); house uuid; t public.tasks; p jsonb; typ text; target uuid;
 expected integer; list_id uuid; list_row public.task_checklists; item jsonb; idx integer:=0;
 hashed bytea; receipt public.task_card_command_receipts; result jsonb; keys text[];
begin
 if actor is null then raise exception 'authentication required' using errcode='28000'; end if;
 if command_id is null or command is null or jsonb_typeof(command)<>'object'
  or not(command ?& array['type','payload']) or (select count(*) from jsonb_object_keys(command))<>2
  or jsonb_typeof(command->'type')<>'string' or jsonb_typeof(command->'payload')<>'object'
 then raise exception 'invalid card command' using errcode='22023'; end if;
 typ:=command->>'type'; p:=command->'payload';
 keys:=case typ when 'save_notes' then array['taskId','expectedVersion','notes']
  when 'save_checklist' then array['taskId','expectedVersion','checklistId','title','items']
  when 'delete_checklist' then array['taskId','expectedVersion','checklistId'] else null end;
 if keys is null or not(p ?& keys) or (select count(*) from jsonb_object_keys(p))<>cardinality(keys)
  or jsonb_typeof(p->'taskId')<>'string' or jsonb_typeof(p->'expectedVersion')<>'number'
  or (p->>'expectedVersion')!~'^(0|[1-9][0-9]*)$'
 then raise exception 'invalid card command' using errcode='22023'; end if;
 target:=(p->>'taskId')::uuid; expected:=(p->>'expectedVersion')::integer;
 select household_id into house from public.household_members where user_id=actor;
 if house is null then raise exception 'operation not allowed' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(house::text,91));
 select * into t from public.tasks where id=target and household_id=house
  and (visibility='household' or owner_user_id=actor) for update;
 if t.id is null then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
 hashed:=extensions.digest(command::text,'sha256');
 select * into receipt from public.task_card_command_receipts r where r.actor_user_id=actor and r.command_id=execute_task_card_command.command_id;
 if receipt.command_id is not null then
  if receipt.household_id<>house or receipt.payload_hash<>hashed then raise exception 'idempotency conflict' using errcode='22023'; end if;
  return jsonb_set(receipt.response,'{replayed}','true'::jsonb);
 end if;
 if t.status not in ('open','in_progress') then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
 if typ='save_notes' then
  if jsonb_typeof(p->'notes')<>'string' or public.card_text_length(p->>'notes')>10000 then raise exception 'invalid card command' using errcode='22023'; end if;
  if expected<>coalesce((select version from public.task_card_notes where task_id=target),0) then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
  insert into public.task_card_notes(task_id,notes,version) values(target,p->>'notes',1)
   on conflict(task_id) do update set notes=excluded.notes,version=task_card_notes.version+1;
 else
  if jsonb_typeof(p->'checklistId')<>'string' then raise exception 'invalid card command' using errcode='22023'; end if;
  list_id:=(p->>'checklistId')::uuid;
  select * into list_row from public.task_checklists where id=list_id;
  if list_row.id is not null and (list_row.task_id<>target or list_row.deleted_at is not null or list_row.version<>expected)
   or list_row.id is null and expected<>0 then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
  if typ='delete_checklist' then
   if list_row.id is null then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
   update public.task_checklists set deleted_at=now(),version=version+1 where id=list_id;
  else
   if jsonb_typeof(p->'title')<>'string' or public.card_text_length(public.card_trim(p->>'title')) not between 1 and 120
    or jsonb_typeof(p->'items')<>'array' then raise exception 'invalid card command' using errcode='22023'; end if;
   if jsonb_array_length(p->'items')>100 then raise exception 'invalid card command' using errcode='22023'; end if;
   if list_row.id is null and (select count(*) from public.task_checklists where task_id=target and deleted_at is null)>=20 then raise exception 'invalid card command' using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(p->'items') a group by a->>'id' having count(*)>1) then raise exception 'invalid card command' using errcode='22023'; end if;
   for item in select value from jsonb_array_elements(p->'items') loop
    if jsonb_typeof(item)<>'object' then raise exception 'invalid card command' using errcode='22023'; end if;
    if not(item ?& array['id','text','completed']) or (select count(*) from jsonb_object_keys(item))<>3
     or jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'text')<>'string'
     or public.card_text_length(public.card_trim(item->>'text')) not between 1 and 500 or jsonb_typeof(item->'completed')<>'boolean'
    then raise exception 'invalid card command' using errcode='22023'; end if;
    if exists(select 1 from public.task_checklist_items where id=(item->>'id')::uuid and checklist_id<>list_id) then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
   end loop;
   insert into public.task_checklists(id,task_id,title,version) values(list_id,target,public.card_trim(p->>'title'),1)
    on conflict(id) do update set title=excluded.title,version=task_checklists.version+1;
   delete from public.task_checklist_items where checklist_id=list_id;
   for item in select value from jsonb_array_elements(p->'items') loop
    insert into public.task_checklist_items(id,checklist_id,text,completed,position)
     values((item->>'id')::uuid,list_id,public.card_trim(item->>'text'),(item->>'completed')::boolean,idx);
    idx:=idx+1;
   end loop;
  end if;
 end if;
 result:=jsonb_build_object('commandId',command_id,'replayed',false,'taskId',target);
 insert into public.task_card_command_receipts values(actor,command_id,house,target,hashed,result);
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(house,actor,'task.'||typ,'task',target,jsonb_build_object('command_id',command_id));
 return result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
 raise exception 'invalid card command' using errcode='22023';
end; $$;

create function public.copy_task_card_content() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare c public.task_checklists; new_list uuid;
begin
 if new.previous_occurrence_id is null then return new; end if;
 insert into public.task_card_notes(task_id,notes,version)
  select new.id,n.notes,1 from public.task_card_notes n where n.task_id=new.previous_occurrence_id;
 for c in select * from public.task_checklists where task_id=new.previous_occurrence_id and deleted_at is null order by created_at,id loop
  new_list:=extensions.gen_random_uuid();
  insert into public.task_checklists(id,task_id,title,version) values(new_list,new.id,c.title,1);
  insert into public.task_checklist_items(id,checklist_id,text,completed,position)
   select extensions.gen_random_uuid(),new_list,i.text,false,i.position from public.task_checklist_items i where i.checklist_id=c.id;
 end loop;
 return new;
end; $$;
create trigger copy_recurring_task_card after insert on public.tasks for each row execute function public.copy_task_card_content();
revoke all on function public.copy_task_card_content() from public,anon,authenticated;
revoke all on function public.card_trim(text),public.card_text_length(text) from public,anon,authenticated;
revoke all on function public.read_task_card(uuid),public.list_tasks_page_v3(integer),public.execute_task_card_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_task_card(uuid),public.list_tasks_page_v3(integer),public.execute_task_card_command(uuid,jsonb) to authenticated;

-- Protect client-supplied checklist IDs against cross-household insertion races.
create or replace function public.execute_task_card_command(command_id uuid, command jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare actor uuid:=auth.uid(); house uuid; t public.tasks; p jsonb; typ text; target uuid;
 expected integer; list_id uuid; list_row public.task_checklists; item jsonb; idx integer:=0;
 hashed bytea; receipt public.task_card_command_receipts; result jsonb; keys text[];
begin
 if actor is null then raise exception 'authentication required' using errcode='28000'; end if;
 if command_id is null or command is null or jsonb_typeof(command)<>'object'
  or not(command ?& array['type','payload']) or (select count(*) from jsonb_object_keys(command))<>2
  or jsonb_typeof(command->'type')<>'string' or jsonb_typeof(command->'payload')<>'object'
 then raise exception 'invalid card command' using errcode='22023'; end if;
 typ:=command->>'type'; p:=command->'payload';
 keys:=case typ when 'save_notes' then array['taskId','expectedVersion','notes']
  when 'save_checklist' then array['taskId','expectedVersion','checklistId','title','items']
  when 'delete_checklist' then array['taskId','expectedVersion','checklistId'] else null end;
 if keys is null or not(p ?& keys) or (select count(*) from jsonb_object_keys(p))<>cardinality(keys)
  or jsonb_typeof(p->'taskId')<>'string' or jsonb_typeof(p->'expectedVersion')<>'number'
  or (p->>'expectedVersion')!~'^(0|[1-9][0-9]*)$'
 then raise exception 'invalid card command' using errcode='22023'; end if;
 target:=(p->>'taskId')::uuid; expected:=(p->>'expectedVersion')::integer;
 select household_id into house from public.household_members where user_id=actor;
 if house is null then raise exception 'operation not allowed' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(house::text,91));
 select * into t from public.tasks where id=target and household_id=house
  and (visibility='household' or owner_user_id=actor) for update;
 if t.id is null then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
 hashed:=extensions.digest(command::text,'sha256');
 select * into receipt from public.task_card_command_receipts r where r.actor_user_id=actor and r.command_id=execute_task_card_command.command_id;
 if receipt.command_id is not null then
  if receipt.household_id<>house or receipt.payload_hash<>hashed then raise exception 'idempotency conflict' using errcode='22023'; end if;
  return jsonb_set(receipt.response,'{replayed}','true'::jsonb);
 end if;
 if t.status not in ('open','in_progress') then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
 if typ='save_notes' then
  if jsonb_typeof(p->'notes')<>'string' or public.card_text_length(p->>'notes')>10000 then raise exception 'invalid card command' using errcode='22023'; end if;
  if expected<>coalesce((select version from public.task_card_notes where task_id=target),0) then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
  insert into public.task_card_notes(task_id,notes,version) values(target,p->>'notes',1)
   on conflict(task_id) do update set notes=excluded.notes,version=task_card_notes.version+1;
 else
  if jsonb_typeof(p->'checklistId')<>'string' then raise exception 'invalid card command' using errcode='22023'; end if;
  list_id:=(p->>'checklistId')::uuid;
  select * into list_row from public.task_checklists where id=list_id;
  if list_row.id is not null and (list_row.task_id<>target or list_row.deleted_at is not null or list_row.version<>expected)
   or list_row.id is null and expected<>0 then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
  if typ='delete_checklist' then
   if list_row.id is null then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
   update public.task_checklists set deleted_at=now(),version=version+1 where id=list_id;
  else
   if jsonb_typeof(p->'title')<>'string' or public.card_text_length(public.card_trim(p->>'title')) not between 1 and 120
    or jsonb_typeof(p->'items')<>'array' then raise exception 'invalid card command' using errcode='22023'; end if;
   if jsonb_array_length(p->'items')>100 then raise exception 'invalid card command' using errcode='22023'; end if;
   if list_row.id is null and (select count(*) from public.task_checklists where task_id=target and deleted_at is null)>=20 then raise exception 'invalid card command' using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(p->'items') a group by a->>'id' having count(*)>1) then raise exception 'invalid card command' using errcode='22023'; end if;
   for item in select value from jsonb_array_elements(p->'items') loop
    if jsonb_typeof(item)<>'object' then raise exception 'invalid card command' using errcode='22023'; end if;
    if not(item ?& array['id','text','completed']) or (select count(*) from jsonb_object_keys(item))<>3
     or jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'text')<>'string'
     or public.card_text_length(public.card_trim(item->>'text')) not between 1 and 500 or jsonb_typeof(item->'completed')<>'boolean'
    then raise exception 'invalid card command' using errcode='22023'; end if;
    if exists(select 1 from public.task_checklist_items where id=(item->>'id')::uuid and checklist_id<>list_id) then raise exception 'task conflict or unavailable' using errcode='40001'; end if;
   end loop;
   -- Never upsert a client-supplied global ID: another household could insert
   -- the same ID concurrently under a different household lock.
   if list_row.id is null then
    insert into public.task_checklists(id,task_id,title,version) values(list_id,target,public.card_trim(p->>'title'),1);
   else
    update public.task_checklists set title=public.card_trim(p->>'title'),version=version+1 where id=list_id and task_id=target;
   end if;
   delete from public.task_checklist_items where checklist_id=list_id;
   for item in select value from jsonb_array_elements(p->'items') loop
    insert into public.task_checklist_items(id,checklist_id,text,completed,position)
     values((item->>'id')::uuid,list_id,public.card_trim(item->>'text'),(item->>'completed')::boolean,idx);
    idx:=idx+1;
   end loop;
  end if;
 end if;
 result:=jsonb_build_object('commandId',command_id,'replayed',false,'taskId',target);
 insert into public.task_card_command_receipts values(actor,command_id,house,target,hashed,result);
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(house,actor,'task.'||typ,'task',target,jsonb_build_object('command_id',command_id));
 return result;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then
 raise exception 'invalid card command' using errcode='22023';
when unique_violation then
 raise exception 'task conflict or unavailable' using errcode='40001';
end; $$;
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid='public.execute_task_card_command(uuid,jsonb)'::regprocedure) is distinct from '7855c012b0e11e0f02ef9a6cf0b3e3ff' then
  raise exception 'unexpected final card gateway';
 end if;
 if (select count(*) from pg_class where oid in ('public.task_card_notes'::regclass,'public.task_checklists'::regclass,'public.task_checklist_items'::regclass,'public.task_card_command_receipts'::regclass) and relrowsecurity) <> 4
  or has_table_privilege('authenticated','public.task_card_command_receipts','select')
  or has_table_privilege('authenticated','public.task_card_notes','insert')
  or has_table_privilege('authenticated','public.task_checklists','update')
  or has_table_privilege('authenticated','public.task_checklist_items','delete')
  or has_function_privilege('anon','public.execute_task_card_command(uuid,jsonb)','execute')
  or has_function_privilege('authenticated','public.copy_task_card_content()','execute') then
  raise exception 'unexpected card security configuration';
 end if;
end;
$guard$;
notify pgrst, 'reload schema';
commit;
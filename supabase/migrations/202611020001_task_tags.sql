-- Incremental: no existing applied migration is changed.
create table public.task_tags (
 id uuid primary key default extensions.gen_random_uuid(),
 household_id uuid not null references public.households(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 visibility public.visibility not null,
 name text not null check (char_length(name) between 1 and 32 and name = regexp_replace(trim(name), '\s+', ' ', 'g')),
 version integer not null default 1 check(version > 0)
);
create unique index task_tags_scope_name on public.task_tags(household_id,visibility,(case when visibility='private' then owner_user_id else null::uuid end),lower(name)) nulls not distinct;
alter table public.task_tags enable row level security;
create policy task_tags_read on public.task_tags for select to authenticated using (
 exists(select 1 from public.household_members m where m.household_id=task_tags.household_id and m.user_id=auth.uid())
 and (visibility='household' or owner_user_id=auth.uid())
);
revoke all on public.task_tags from public,anon,authenticated;
grant select on public.task_tags to authenticated;

create table public.task_tag_links (
 task_id uuid not null references public.tasks(id) on delete cascade,
 tag_id uuid not null references public.task_tags(id) on delete cascade,
 primary key(task_id,tag_id)
);
alter table public.task_tag_links enable row level security;
create policy task_tag_links_read on public.task_tag_links for select to authenticated using (
 exists(select 1 from public.tasks t join public.task_tags g on g.id=task_tag_links.tag_id
 where t.id=task_tag_links.task_id and t.household_id=g.household_id and t.visibility=g.visibility
 and (t.visibility='household' or t.owner_user_id=g.owner_user_id))
);
revoke all on public.task_tag_links from public,anon,authenticated;
grant select on public.task_tag_links to authenticated;

create table public.tag_command_receipts (
 actor_user_id uuid not null references auth.users(id) on delete cascade,
 command_id uuid not null, household_id uuid not null references public.households(id) on delete cascade,
 payload_hash bytea not null, response jsonb, primary key(actor_user_id,command_id)
);
alter table public.tag_command_receipts enable row level security;
revoke all on public.tag_command_receipts from public,anon,authenticated;

create function public.apply_task_tags(target public.tasks, names jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare n jsonb; normalized text; tag_id uuid; seen text[] := '{}';
begin
 if jsonb_typeof(names) is distinct from 'array' or jsonb_array_length(names)>10 then
  raise exception 'invalid task tags' using errcode='22023'; end if;
 delete from public.task_tag_links l where l.task_id=target.id;
 for n in select value from jsonb_array_elements(names) loop
  if jsonb_typeof(n) is distinct from 'string' then raise exception 'invalid task tags' using errcode='22023'; end if;
  normalized:=regexp_replace(trim(n#>>'{}'),'\s+',' ','g');
  if char_length(normalized) not between 1 and 32 or lower(normalized)=any(seen) then raise exception 'invalid task tags' using errcode='22023'; end if;
  seen:=array_append(seen,lower(normalized));
  select g.id into tag_id from public.task_tags g where g.household_id=target.household_id and g.visibility=target.visibility
   and (g.visibility='household' or g.owner_user_id=target.owner_user_id) and lower(g.name)=lower(normalized);
  if tag_id is null then
   insert into public.task_tags(household_id,owner_user_id,visibility,name)
   values(target.household_id,coalesce(target.owner_user_id,auth.uid()),target.visibility,normalized) returning id into tag_id;
  end if;
  insert into public.task_tag_links values(target.id,tag_id);
 end loop;
end; $$;
revoke all on function public.apply_task_tags(public.tasks,jsonb) from public,anon,authenticated;

create function public.task_tag_names(target_id uuid) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(g.name order by lower(g.name),g.id),'[]'::jsonb)
 from public.task_tag_links l join public.task_tags g on g.id=l.tag_id where l.task_id=target_id
$$;
revoke all on function public.task_tag_names(uuid) from public,anon,authenticated;

-- SECURITY INVOKER: row selection remains protected by task/catalog/link RLS.
create function public.list_tasks_page(page_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if page_offset < 0 or page_offset > 1000000 then raise exception 'invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(item),'[]'::jsonb) into result from (
  select jsonb_build_object('id',t.id,'householdId',t.household_id,'ownerUserId',t.owner_user_id,'createdBy',t.created_by,'assigneeUserId',t.assignee_user_id,'title',t.title,'dueAt',t.due_at,'visibility',t.visibility,'recurrence',t.recurrence,'status',t.status,'completedAt',t.completed_at,'version',t.version,'createdAt',t.created_at,'updatedAt',t.updated_at) || case when t.recurrence='custom' then jsonb_build_object('recurrenceRule',t.recurrence_rule) else '{}'::jsonb end
   || jsonb_build_object('tags',coalesce((select jsonb_agg(g.name order by lower(g.name),g.id) from public.task_tag_links l join public.task_tags g on g.id=l.tag_id where l.task_id=t.id),'[]'::jsonb)) item
  from public.tasks t order by t.created_at desc,t.id offset page_offset limit 500
 ) rows;
 return result;
end; $$;
revoke all on function public.list_tasks_page(integer) from public,anon;
grant execute on function public.list_tasks_page(integer) to authenticated;

create function public.execute_tag_command(command_id uuid, command jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare actor uuid:=auth.uid(); household uuid; g public.task_tags; r public.tag_command_receipts; h bytea; n text; result jsonb;
begin
 if actor is null then raise exception 'authentication required' using errcode='28000'; end if;
 select household_id into household from public.household_members where user_id=actor;
 if household is null then raise exception 'operation not allowed' using errcode='42501'; end if;
 if command_id is null or jsonb_typeof(command) is distinct from 'object'
  or not(command ?& array['type','tagId','expectedVersion'])
  or jsonb_typeof(command->'type') is distinct from 'string' or command->>'type' not in ('rename','delete')
  or jsonb_typeof(command->'tagId') is distinct from 'string'
  or jsonb_typeof(command->'expectedVersion') is distinct from 'number' or command->>'expectedVersion' !~ '^[1-9][0-9]*$'
  or exists(select 1 from jsonb_object_keys(command) k where k not in ('type','tagId','expectedVersion','name'))
  or (command->>'type'='rename' and jsonb_typeof(command->'name') is distinct from 'string')
  or (command->>'type'='delete' and command ? 'name') then raise exception 'invalid tag command' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(household::text,91));
 h:=extensions.digest(command::text,'sha256');
 insert into public.tag_command_receipts values(actor,command_id,household,h,null) on conflict do nothing;
 select * into r from public.tag_command_receipts x where x.actor_user_id=actor and x.command_id=execute_tag_command.command_id for update;
 if r.household_id<>household or r.payload_hash<>h then raise exception 'idempotency conflict' using errcode='22023'; end if;
 if r.response is not null then return r.response || '{"replayed":true}'::jsonb; end if;
 select * into g from public.task_tags x where x.id=(command->>'tagId')::uuid and x.household_id=household
  and (x.visibility='household' or x.owner_user_id=actor) and x.version=(command->>'expectedVersion')::integer for update;
 if g.id is null then raise exception 'tag conflict or unavailable' using errcode='40001'; end if;
 update public.tasks t set version=version+1,updated_at=now() where exists(select 1 from public.task_tag_links l where l.task_id=t.id and l.tag_id=g.id);
 if command->>'type'='rename' then
  n:=regexp_replace(trim(command->>'name'),'\s+',' ','g');
  if char_length(n) not between 1 and 32 then raise exception 'invalid tag name' using errcode='22023'; end if;
  update public.task_tags set name=n,version=version+1 where id=g.id;
 else delete from public.task_tags where id=g.id; end if;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(household,actor,'tag.'||(command->>'type'),'task_tag',g.id,jsonb_build_object('command_id',command_id));
 result:=jsonb_build_object('ok',true,'replayed',false);
 update public.tag_command_receipts x set response=result where x.actor_user_id=actor and x.command_id=execute_tag_command.command_id;
 return result;
exception when unique_violation or invalid_text_representation or numeric_value_out_of_range then
 raise exception 'invalid or duplicate tag' using errcode='22023';
end; $$;
revoke all on function public.execute_tag_command(uuid,jsonb) from public,anon;
grant execute on function public.execute_tag_command(uuid,jsonb) to authenticated;

create or replace function public.execute_task_command(command_id uuid, command jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  actor_id uuid := auth.uid();
  actor_household_id uuid;
  command_type text;
  payload jsonb;
  command_hash bytea;
  receipt public.task_command_receipts%rowtype;
  task_row public.tasks%rowtype;
  spawned_row public.tasks%rowtype;
  target_task_id uuid;
  expected_version integer;
  new_due_at timestamptz;
  result jsonb;
  allowed_keys text[];
  violated_constraint text;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if command_id is null
    or command is null
    or jsonb_typeof(command) <> 'object'
    or not (command ?& array['type', 'payload'])
    or (select count(*) from jsonb_object_keys(command)) <> 2
    or jsonb_typeof(command -> 'type') <> 'string'
    or jsonb_typeof(command -> 'payload') <> 'object'
  then
    raise exception 'invalid task command' using errcode = '22023';
  end if;

  command_type := command ->> 'type';
  payload := command -> 'payload';
  if command_type not in ('create', 'update', 'set_status') then
    raise exception 'invalid task command' using errcode = '22023';
  end if;

  select household_id into actor_household_id
  from public.household_members where user_id = actor_id;
  if actor_household_id is null then
    raise exception 'operation not allowed' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_household_id::text,91));
  command_hash := extensions.digest(command::text, 'sha256');
  insert into public.task_command_receipts (actor_user_id, command_id, household_id, payload_hash)
  values (actor_id, command_id, actor_household_id, command_hash)
  on conflict on constraint task_command_receipts_pkey do nothing;

  select * into receipt from public.task_command_receipts r
  where r.actor_user_id = actor_id and r.command_id = execute_task_command.command_id
  for update;
  if receipt.household_id <> actor_household_id or receipt.payload_hash <> command_hash then
    raise exception 'idempotency conflict' using errcode = '22023';
  end if;
  if receipt.response is not null then
    return jsonb_set(receipt.response, '{replayed}', 'true'::jsonb);
  end if;

  if command_type = 'create' then
    allowed_keys := array['title', 'visibility', 'assigneeUserId', 'dueAt', 'recurrence', 'recurrenceRule', 'tags'];
    if not (payload ? 'title')
      or exists (select 1 from jsonb_object_keys(payload) key where not (key = any(allowed_keys)))
      or jsonb_typeof(payload -> 'title') <> 'string'
      or char_length(trim(payload ->> 'title')) not between 1 and 240
      or (payload ? 'visibility' and jsonb_typeof(payload -> 'visibility') <> 'string')
      or (payload ? 'assigneeUserId' and jsonb_typeof(payload -> 'assigneeUserId') not in ('string', 'null'))
      or (payload ? 'dueAt' and jsonb_typeof(payload -> 'dueAt') not in ('string', 'null'))
      or (payload ? 'recurrence' and jsonb_typeof(payload -> 'recurrence') <> 'string')
      or (coalesce(payload ->> 'recurrence', 'none') <> 'none' and nullif(payload ->> 'dueAt', '') is null)
    then raise exception 'invalid task command' using errcode = '22023';
    end if;

    insert into public.tasks (
      household_id, owner_user_id, created_by, assignee_user_id, visibility,
      title, due_at, recurrence, recurrence_rule, idempotency_key
    ) values (
      actor_household_id, actor_id, actor_id,
      case when payload -> 'assigneeUserId' = 'null'::jsonb then null else (payload ->> 'assigneeUserId')::uuid end,
      coalesce((payload ->> 'visibility')::public.visibility, 'household'), trim(payload ->> 'title'),
      case when payload -> 'dueAt' = 'null'::jsonb then null else (payload ->> 'dueAt')::timestamptz end,
      coalesce((payload ->> 'recurrence')::public.task_recurrence, 'none'), nullif(payload -> 'recurrenceRule', 'null'::jsonb), extensions.gen_random_uuid()
    ) returning * into task_row;

  elsif command_type = 'update' then
    allowed_keys := array['taskId', 'expectedVersion', 'title', 'visibility', 'assigneeUserId', 'dueAt', 'recurrence', 'recurrenceRule', 'tags'];
    if not (payload ?& array['taskId', 'expectedVersion'])
      or (select count(*) from jsonb_object_keys(payload)) <= 2
      or exists (select 1 from jsonb_object_keys(payload) key where not (key = any(allowed_keys)))
      or jsonb_typeof(payload -> 'taskId') <> 'string'
      or jsonb_typeof(payload -> 'expectedVersion') <> 'number'
      or (payload ->> 'expectedVersion') !~ '^[1-9][0-9]*$'
      or (payload ? 'title' and (jsonb_typeof(payload -> 'title') <> 'string' or char_length(trim(payload ->> 'title')) not between 1 and 240))
      or (payload ? 'visibility' and jsonb_typeof(payload -> 'visibility') <> 'string')
      or (payload ? 'assigneeUserId' and jsonb_typeof(payload -> 'assigneeUserId') not in ('string', 'null'))
      or (payload ? 'dueAt' and jsonb_typeof(payload -> 'dueAt') not in ('string', 'null'))
      or (payload ? 'recurrence' and jsonb_typeof(payload -> 'recurrence') <> 'string')
    then raise exception 'invalid task command' using errcode = '22023';
    end if;
    target_task_id := (payload ->> 'taskId')::uuid;
    expected_version := (payload ->> 'expectedVersion')::integer;

    if payload ? 'visibility' and exists (
      select 1 from public.tasks t join public.task_tag_links l on l.task_id=t.id
      where t.id=target_task_id and t.household_id=actor_household_id
        and (t.visibility='household' or t.owner_user_id=actor_id)
        and t.visibility::text<>payload->>'visibility'
    ) and (not(payload ? 'tags') or payload->'tags'<>'[]'::jsonb) then
      raise exception 'clear tags before changing visibility' using errcode='22023';
    end if;
    update public.tasks existing set
      title = case when payload ? 'title' then trim(payload ->> 'title') else existing.title end,
      visibility = case when payload ? 'visibility' then (payload ->> 'visibility')::public.visibility else existing.visibility end,
      assignee_user_id = case when payload ? 'assigneeUserId' then nullif(payload ->> 'assigneeUserId', '')::uuid else existing.assignee_user_id end,
      due_at = case when payload ? 'dueAt' then nullif(payload ->> 'dueAt', '')::timestamptz else existing.due_at end,
      recurrence = case when payload ? 'recurrence' then (payload ->> 'recurrence')::public.task_recurrence else existing.recurrence end,
      recurrence_rule = case when payload ? 'recurrenceRule' then nullif(payload -> 'recurrenceRule', 'null'::jsonb) when payload ? 'recurrence' and payload->>'recurrence' <> 'custom' then null else existing.recurrence_rule end,
      version = existing.version + 1, updated_at = now()
    where existing.id = target_task_id
      and existing.household_id = actor_household_id
      and (existing.visibility = 'household' or existing.owner_user_id = actor_id)
      and existing.status in ('open', 'in_progress') and existing.version = expected_version
      and (not (payload ? 'visibility') or (payload ->> 'visibility') <> 'private' or existing.owner_user_id = actor_id)
    returning existing.* into task_row;
    if task_row.id is null then
      raise exception 'task conflict or unavailable' using errcode = '40001';
    end if;

  else
    allowed_keys := array['taskId', 'expectedVersion', 'status'];
    if not (payload ?& allowed_keys)
      or (select count(*) from jsonb_object_keys(payload)) <> 3
      or exists (select 1 from jsonb_object_keys(payload) key where not (key = any(allowed_keys)))
      or jsonb_typeof(payload -> 'taskId') <> 'string'
      or jsonb_typeof(payload -> 'expectedVersion') <> 'number'
      or (payload ->> 'expectedVersion') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(payload -> 'status') <> 'string'
      or (payload ->> 'status') not in ('open', 'in_progress', 'completed', 'cancelled')
    then raise exception 'invalid task command' using errcode = '22023';
    end if;
    target_task_id := (payload ->> 'taskId')::uuid;
    expected_version := (payload ->> 'expectedVersion')::integer;

    update public.tasks existing set
      status = (payload ->> 'status')::public.task_status,
      completed_at = case when (payload ->> 'status') = 'completed' then now() else null end,
      version = existing.version + 1, updated_at = now()
    where existing.id = target_task_id
      and existing.household_id = actor_household_id
      and (existing.visibility = 'household' or existing.owner_user_id = actor_id)
      and (existing.status in ('open', 'in_progress') or (payload ->> 'status') = 'open')
      and existing.version = expected_version
    returning existing.* into task_row;
    if task_row.id is null then
      raise exception 'task conflict or unavailable' using errcode = '40001';
    end if;

    if task_row.status = 'completed' and task_row.recurrence <> 'none' then
      new_due_at := public.next_task_recurrence_due_at(task_row.due_at, task_row.recurrence, task_row.recurrence_rule);
      if new_due_at is not null then
      insert into public.tasks (
        household_id, owner_user_id, created_by, assignee_user_id, visibility,
        title, due_at, recurrence, recurrence_rule, idempotency_key, previous_occurrence_id
      ) values (
        task_row.household_id, task_row.owner_user_id, actor_id, task_row.assignee_user_id,
        task_row.visibility, task_row.title, new_due_at, task_row.recurrence, task_row.recurrence_rule,
        extensions.gen_random_uuid(), task_row.id
      ) returning * into spawned_row;
      end if;
    end if;
  end if;

  if command_type in ('create','update') and payload ? 'tags' then
    perform public.apply_task_tags(task_row,payload->'tags');
  end if;
  if spawned_row.id is not null then
    insert into public.task_tag_links(task_id,tag_id) select spawned_row.id,l.tag_id from public.task_tag_links l where l.task_id=task_row.id;
  end if;
  insert into public.audit_log (household_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    actor_household_id, actor_id, 'task.' || command_type, 'task', task_row.id,
    jsonb_strip_nulls(jsonb_build_object('command_id', command_id, 'version', task_row.version, 'spawned_task_id', spawned_row.id))
  );
  result := jsonb_build_object(
    'commandId', command_id, 'replayed', false, 'task', public.task_to_json(task_row) || case when payload ? 'tags' then jsonb_build_object('tags',public.task_tag_names(task_row.id)) else '{}'::jsonb end || case when task_row.recurrence = 'custom' then jsonb_build_object('recurrenceRule', task_row.recurrence_rule) else '{}'::jsonb end
  );
  update public.task_command_receipts r set response = result
  where r.actor_user_id = actor_id and r.command_id = execute_task_command.command_id;
  return result;
exception
  when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'valid_custom_task_recurrence' then
      raise exception 'invalid task command' using errcode = '22023';
    end if;
    raise;
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'invalid task command' using errcode = '22023';
end;
$$;


revoke all on function public.execute_task_command(uuid, jsonb) from public, anon;
grant execute on function public.execute_task_command(uuid, jsonb) to authenticated;

begin;
alter table public.tasks add column kind text not null default 'task' check(kind in ('task','event')),add column event_ends_at timestamptz;
alter table public.tasks add constraint valid_task_event_interval check ((kind='task' and event_ends_at is null) or (kind='event' and due_at is not null and event_ends_at is not null and isfinite(due_at) and isfinite(event_ends_at) and event_ends_at>due_at));
-- Retain previous-provider identities until remote cleanup has been acknowledged.
alter table public.task_calendar_links drop constraint task_calendar_links_connection_id_task_id_target_kind_key;
alter table public.task_calendar_links add constraint task_projection_provider_unique unique(connection_id,task_id,target_kind,provider);
create or replace function public.task_to_json(task_row public.tasks)
returns jsonb language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'id', task_row.id, 'householdId', task_row.household_id,
    'ownerUserId', task_row.owner_user_id, 'createdBy', task_row.created_by,
    'assigneeUserId', task_row.assignee_user_id, 'title', task_row.title,
    'dueAt', task_row.due_at, 'visibility', task_row.visibility,
    'recurrence', task_row.recurrence, 'status', task_row.status,
    'completedAt', task_row.completed_at, 'version', task_row.version,
    'createdAt', task_row.created_at, 'updatedAt', task_row.updated_at
  ) || case when task_row.kind='event' then jsonb_build_object('kind',task_row.kind,'eventEndsAt',task_row.event_ends_at) else '{}'::jsonb end;
$$;
create or replace function public.list_tasks_page(page_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if page_offset < 0 or page_offset > 1000000 then raise exception 'invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(item),'[]'::jsonb) into result from (
  select jsonb_build_object('id',t.id,'householdId',t.household_id,'ownerUserId',t.owner_user_id,'createdBy',t.created_by,'assigneeUserId',t.assignee_user_id,'title',t.title,'dueAt',t.due_at,'visibility',t.visibility,'recurrence',t.recurrence,'status',t.status,'completedAt',t.completed_at,'version',t.version,'createdAt',t.created_at,'updatedAt',t.updated_at) || case when t.recurrence='custom' then jsonb_build_object('recurrenceRule',t.recurrence_rule) else '{}'::jsonb end
   || jsonb_build_object('tags',coalesce((select jsonb_agg(g.name order by lower(g.name),g.id) from public.task_tag_links l join public.task_tags g on g.id=l.tag_id where l.task_id=t.id),'[]'::jsonb)) item
  from public.tasks t where t.kind='task' order by t.created_at desc,t.id offset page_offset limit 500
 ) rows;
 return result;
end; $$;
create or replace function public.list_tasks_page_v2(page_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if page_offset < 0 or page_offset > 1000000 then raise exception 'invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(item),'[]'::jsonb) into result from (
  select jsonb_build_object('id',t.id,'householdId',t.household_id,'ownerUserId',t.owner_user_id,'createdBy',t.created_by,'assigneeUserId',t.assignee_user_id,'title',t.title,'dueAt',t.due_at,'visibility',t.visibility,'recurrence',t.recurrence,'status',t.status,'completedAt',t.completed_at,'version',t.version,'createdAt',t.created_at,'updatedAt',t.updated_at) || case when t.recurrence='custom' then jsonb_build_object('recurrenceRule',t.recurrence_rule) else '{}'::jsonb end
   || case when t.kind='event' then jsonb_build_object('kind',t.kind,'eventEndsAt',t.event_ends_at) else '{}'::jsonb end
   || jsonb_build_object('tags',coalesce((select jsonb_agg(g.name order by lower(g.name),g.id) from public.task_tag_links l join public.task_tags g on g.id=l.tag_id where l.task_id=t.id),'[]'::jsonb)) item
  from public.tasks t order by t.created_at desc,t.id offset page_offset limit 500
 ) rows;
 return result;
end; $$;
revoke all on function public.list_tasks_page_v2(integer) from public,anon;
grant execute on function public.list_tasks_page_v2(integer) to authenticated;
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
    allowed_keys := array['title', 'visibility', 'assigneeUserId', 'dueAt', 'recurrence', 'recurrenceRule', 'tags', 'kind', 'eventEndsAt'];
    if not (payload ? 'title')
      or exists (select 1 from jsonb_object_keys(payload) key where not (key = any(allowed_keys)))
      or jsonb_typeof(payload -> 'title') <> 'string'
      or char_length(trim(payload ->> 'title')) not between 1 and 240
      or (payload ? 'visibility' and jsonb_typeof(payload -> 'visibility') <> 'string')
      or (payload ? 'assigneeUserId' and jsonb_typeof(payload -> 'assigneeUserId') not in ('string', 'null'))
      or (payload ? 'dueAt' and jsonb_typeof(payload -> 'dueAt') not in ('string', 'null'))
      or (payload ? 'kind' and (jsonb_typeof(payload->'kind') is distinct from 'string' or payload->>'kind' not in ('task','event')))
      or (payload ? 'eventEndsAt' and jsonb_typeof(payload->'eventEndsAt') not in ('string','null'))
      or (payload ? 'recurrence' and jsonb_typeof(payload -> 'recurrence') <> 'string')
      or (coalesce(payload ->> 'recurrence', 'none') <> 'none' and nullif(payload ->> 'dueAt', '') is null)
    then raise exception 'invalid task command' using errcode = '22023';
    end if;

    insert into public.tasks (
      household_id, owner_user_id, created_by, assignee_user_id, visibility,
      title, due_at, recurrence, recurrence_rule, idempotency_key, kind, event_ends_at
    ) values (
      actor_household_id, actor_id, actor_id,
      case when payload -> 'assigneeUserId' = 'null'::jsonb then null else (payload ->> 'assigneeUserId')::uuid end,
      coalesce((payload ->> 'visibility')::public.visibility, 'household'), trim(payload ->> 'title'),
      case when payload -> 'dueAt' = 'null'::jsonb then null else (payload ->> 'dueAt')::timestamptz end,
      coalesce((payload ->> 'recurrence')::public.task_recurrence, 'none'), nullif(payload -> 'recurrenceRule', 'null'::jsonb), extensions.gen_random_uuid(), coalesce(payload->>'kind','task'), nullif(payload->>'eventEndsAt','')::timestamptz
    ) returning * into task_row;

  elsif command_type = 'update' then
    allowed_keys := array['taskId', 'expectedVersion', 'title', 'visibility', 'assigneeUserId', 'dueAt', 'recurrence', 'recurrenceRule', 'tags', 'kind', 'eventEndsAt'];
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
      or (payload ? 'kind' and (jsonb_typeof(payload->'kind') is distinct from 'string' or payload->>'kind' not in ('task','event')))
      or (payload ? 'eventEndsAt' and jsonb_typeof(payload->'eventEndsAt') not in ('string','null'))
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
      kind=case when payload ? 'kind' then payload->>'kind' else existing.kind end,
      event_ends_at=case when payload ? 'kind' and payload->>'kind'='task' then null when payload ? 'eventEndsAt' then nullif(payload->>'eventEndsAt','')::timestamptz else existing.event_ends_at end,
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
        title, due_at, recurrence, recurrence_rule, idempotency_key, previous_occurrence_id, kind, event_ends_at
      ) values (
        task_row.household_id, task_row.owner_user_id, actor_id, task_row.assignee_user_id,
        task_row.visibility, task_row.title, new_due_at, task_row.recurrence, task_row.recurrence_rule,
        extensions.gen_random_uuid(), task_row.id, task_row.kind, case when task_row.kind='event' then new_due_at+(task_row.event_ends_at-task_row.due_at) else null end
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
    if violated_constraint in ('valid_custom_task_recurrence','valid_task_event_interval','tasks_kind_check') then
      raise exception 'invalid task command' using errcode = '22023';
    end if;
    raise;
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'invalid task command' using errcode = '22023';
end;
$$;



create or replace function public.gc_queue_task(target_task uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare t public.tasks; i record; link_id uuid;
begin
 select * into t from public.tasks where id=target_task;
 if t.id is not null and t.status<>'cancelled' then
  for i in select x.* from app_private.google_export_intents x join public.google_calendar_connections c on c.id=x.connection_id
   where x.task_id=t.id and c.household_id=t.household_id and c.status in ('connected','reconnect') and (x.provider='google_tasks' or t.due_at is not null)
   and exists(select 1 from public.household_members m where m.household_id=c.household_id and m.user_id=c.user_id)
   and ((t.visibility='household' and c.export_household) or (t.visibility='private' and c.export_private and c.user_id=t.owner_user_id))
  loop
   insert into public.task_calendar_links(connection_id,task_id,target_kind,event_id,provider)
   values(i.connection_id,t.id,t.visibility,'g'||md5(i.connection_id::text||t.id::text||t.visibility::text),i.provider) on conflict(connection_id,task_id,target_kind,provider) do nothing;
  end loop;
 end if;
 for link_id in select id from public.task_calendar_links where task_id=target_task loop perform public.gc_enqueue_link(link_id); end loop;
end; $$;
create or replace function public.gc_task_changed() returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; activation timestamptz;
begin
 if tg_op='INSERT' or (tg_op='UPDATE' and new.kind is distinct from old.kind) then
  select activated_at into activation from app_private.google_export_settings where singleton;
  if tg_op='UPDATE' then update app_private.google_export_intents i set provider=case when new.kind='event' or activation is null then 'google_calendar' else g.new_task_destination end from public.google_calendar_connections g where i.connection_id=g.id and i.task_id=new.id;end if;
  for c in select g.* from public.google_calendar_connections g where g.household_id=new.household_id and g.status in ('connected','reconnect')
   and exists(select 1 from public.household_members m where m.household_id=g.household_id and m.user_id=g.user_id)
   and ((new.visibility='household' and g.export_household) or (new.visibility='private' and g.export_private and g.user_id=new.owner_user_id))
   order by g.id for update
  loop
   insert into app_private.google_export_intents(connection_id,task_id,provider)
   values(c.id,new.id,case when new.kind='event' or activation is null then 'google_calendar' else c.new_task_destination end) on conflict(connection_id,task_id) do update set provider=excluded.provider;
  end loop;
 end if;
 perform public.gc_queue_task(case when tg_op='DELETE' then old.id else new.id end); return null;
end; $$;
create or replace function public.gc_job_payload(job_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; q public.outbox_events; l public.task_calendar_links; t public.tasks; target public.google_calendar_targets; token text; eligible boolean; task_target public.google_task_targets;
begin
 select * into strict q from public.outbox_events where id=job_id;
 select * into strict c from public.google_calendar_connections where id=q.gc_connection_id;
 select token_cipher into token from app_private.google_calendar_credentials where connection_id=c.id;
 if q.topic='google_calendar.revoke' then
  return jsonb_build_object('jobId',q.id,'leaseToken',q.gc_lease_token,'connectionId',c.id,'userId',c.user_id,'householdId',c.household_id,'tokenCipher',token,'action','revoke','task',null,'calendarId',null,'targetKind','household','eventId','grevoke','etag',null,'reminderMinutes',c.reminder_minutes,'attempts',q.attempts,'targetState','missing');
 end if;
 select * into strict l from public.task_calendar_links where id=q.gc_link_id;
 select * into t from public.tasks where id=l.task_id;
 eligible:=(t.kind<>'event' or l.provider='google_calendar') and exists(select 1 from app_private.google_export_intents i where i.connection_id=c.id and i.task_id=l.task_id and i.provider=l.provider) and t.id is not null and t.household_id=c.household_id and c.status='connected' and (l.provider='google_tasks' or t.due_at is not null) and t.status<>'cancelled' and (l.provider='google_calendar' or t.status<>'completed' or l.remote_task_id is not null or l.insertion_attempted) and t.visibility=l.target_kind
 and exists(select 1 from public.household_members m where m.household_id=c.household_id and m.user_id=c.user_id)
 and ((t.visibility='household' and c.export_household) or (t.visibility='private' and c.export_private and t.owner_user_id=c.user_id));
 if l.provider='google_tasks' then
 select * into task_target from public.google_task_targets where connection_id=c.id and target_kind=l.target_kind;
 return jsonb_build_object('provider','google_tasks','jobId',q.id,'leaseToken',q.gc_lease_token,'connectionId',c.id,'userId',c.user_id,'householdId',c.household_id,'tokenCipher',token,'action',case when eligible then 'upsert' else 'delete' end,
 'task',case when eligible then jsonb_build_object('id',t.id,'title',t.title,'dueAt',t.due_at,'status',t.status,'version',t.version) else null end,
 'calendarId',task_target.list_id,'targetKind',l.target_kind,'eventId',l.event_id,'remoteTaskId',l.remote_task_id,'insertionAttempted',l.insertion_attempted,'etag',null,'reminderMinutes',null,'attempts',q.attempts,'targetState',coalesce(task_target.state,'missing'));
 end if;
 select * into target from public.google_calendar_targets where connection_id=c.id and target_kind=l.target_kind;
 return jsonb_build_object('jobId',q.id,'leaseToken',q.gc_lease_token,'connectionId',c.id,'userId',c.user_id,'householdId',c.household_id,'tokenCipher',token,'action',case when eligible then 'upsert' else 'delete' end,
 'task',case when eligible then jsonb_build_object('id',t.id,'title',t.title,'dueAt',t.due_at,'status',t.status,'version',t.version,'visibility',t.visibility,'kind',t.kind,'eventEndsAt',t.event_ends_at) else null end,
 'calendarId',target.calendar_id,'targetKind',l.target_kind,'eventId',l.event_id,'etag',l.etag,'reminderMinutes',c.reminder_minutes,'attempts',q.attempts,'targetState',coalesce(target.state,'missing'));
end; $$;
create or replace function public.gc_claim_jobs_v2(batch_size integer default 10,tasks_enabled boolean default false,tasks_supported boolean default true) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; q public.outbox_events; lease uuid; output jsonb:='[]'; reconcile_link uuid; used integer; budget_day date:=(now() at time zone 'UTC')::date;
begin
 if batch_size<1 or batch_size>25 then raise exception 'invalid batch size'; end if;
 insert into app_private.google_calendar_budget(day,claims) values(budget_day,0) on conflict(day) do nothing;
 select claims into used from app_private.google_calendar_budget where day=budget_day for update;
 if used>=2880 then return output; end if;
 -- Reconcile only existing projections, never backfill unconsented historic tasks.
 for c in select g.* from public.google_calendar_connections g where g.status='connected' and g.last_reconciled_at<=now()-interval '1 day'
 and (g.worker_lease_until is null or g.worker_lease_until<now()) order by g.last_reconciled_at for update skip locked limit batch_size
 loop
  for reconcile_link in select id from public.task_calendar_links where connection_id=c.id and sync_status='synced' order by last_checked_at nulls first,id limit 100
  loop perform public.gc_enqueue_link(reconcile_link); end loop;
  update public.google_calendar_connections set last_reconciled_at=now() where id=c.id;
 end loop;
 -- Connection-level lease serializes remote writes even across worker invocations.
 for c in select g.* from public.google_calendar_connections g where g.status in ('connected','disconnecting') and (g.worker_lease_until is null or g.worker_lease_until<now())
 and exists(select 1 from public.outbox_events o where o.gc_connection_id=g.id and o.processed_at is null and not o.gc_terminal and o.available_at<=now()) order by g.updated_at for update skip locked limit batch_size
 loop
  select * into q from public.outbox_events o where o.gc_connection_id=c.id and o.processed_at is null and not o.gc_terminal and o.available_at<=now()
   and (o.gc_link_id is null or exists(select 1 from public.task_calendar_links l where l.id=o.gc_link_id and (l.provider='google_calendar' or (public.gc_job_payload(o.id)->>'action'='delete' and l.remote_task_id is null and not l.insertion_attempted) or (tasks_enabled and c.scopes ? 'https://www.googleapis.com/auth/tasks'))))
   and not exists(select 1 from public.task_calendar_links current_link join public.task_calendar_links old_link on old_link.task_id=current_link.task_id join public.outbox_events cleanup on cleanup.gc_link_id=old_link.id where current_link.id=o.gc_link_id and public.gc_job_payload(o.id)->>'action'='upsert' and cleanup.processed_at is null and public.gc_job_payload(cleanup.id)->>'action'='delete')
   and (tasks_supported or not exists(select 1 from public.task_calendar_links where id=o.gc_link_id and provider='google_tasks'))
   and (o.topic<>'google_calendar.revoke' or not exists(select 1 from public.outbox_events other where other.gc_connection_id=c.id and other.topic='google_calendar.task' and other.processed_at is null))
   order by case when o.topic='google_calendar.revoke' then 2 when public.gc_job_payload(o.id)->>'action'='delete' then 0 else 1 end,o.created_at limit 1 for update skip locked;
  if not found then continue; end if;
  exit when used>=2880;
  if not exists(select 1 from app_private.google_calendar_credentials where connection_id=c.id) then update public.outbox_events set gc_terminal=true where id=q.id; continue; end if;
  used:=used+1; update app_private.google_calendar_budget set claims=used where day=budget_day;
  lease:=gen_random_uuid();
  update public.google_calendar_connections set worker_lease=lease,worker_lease_until=now()+interval '5 minutes' where id=c.id;
  update public.outbox_events set locked_at=now(),gc_lease_token=lease,gc_claimed_generation=gc_generation,attempts=attempts+1 where id=q.id;
  output:=output||jsonb_build_array(public.gc_job_payload(q.id));
 end loop; return output;
end; $$;
create or replace function public.gc_repair_targets(actor uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.google_calendar_connections; kind public.visibility; link_id uuid;
begin
 select g.* into strict c from public.google_calendar_connections g where g.user_id=actor and g.status='connected'
 and exists(select 1 from public.household_members m where m.household_id=g.household_id and m.user_id=actor) for update;
 if c.last_repair_at>now()-interval '2 minutes' then raise exception 'repair rate limited' using errcode='54000'; end if;
 if c.worker_lease_until>now() then raise exception 'calendar worker busy' using errcode='40001'; end if;
 for kind in delete from public.google_calendar_targets t where t.connection_id=c.id and
 ((t.state='creating' and t.calendar_id is null) or (t.state='ready' and exists(select 1 from public.task_calendar_links l where l.connection_id=t.connection_id and l.target_kind=t.target_kind and l.provider='google_calendar' and l.sync_status='failed' and l.error_code='remote_calendar_deleted'))) returning t.target_kind
 loop
  update public.task_calendar_links set projection_epoch=projection_epoch+1,event_id='g'||md5(gen_random_uuid()::text),etag=null where connection_id=c.id and provider='google_calendar' and target_kind=kind;
  for link_id in select id from public.task_calendar_links where connection_id=c.id and provider='google_calendar' and target_kind=kind loop perform public.gc_enqueue_link(link_id); end loop;
 end loop;
 update public.google_calendar_connections set last_repair_at=now() where id=c.id;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id) values(c.household_id,actor,'google_calendar.targets_repaired','integration',c.id);
end; $$;
-- Existing grants are preserved; list_tasks_page_v2 is the authenticated, RLS-bound read API.
commit;

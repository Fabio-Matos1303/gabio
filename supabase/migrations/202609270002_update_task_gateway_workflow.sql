
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
    allowed_keys := array['title', 'visibility', 'assigneeUserId', 'dueAt', 'recurrence'];
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
      title, due_at, recurrence, idempotency_key
    ) values (
      actor_household_id, actor_id, actor_id,
      case when payload -> 'assigneeUserId' = 'null'::jsonb then null else (payload ->> 'assigneeUserId')::uuid end,
      coalesce((payload ->> 'visibility')::public.visibility, 'household'), trim(payload ->> 'title'),
      case when payload -> 'dueAt' = 'null'::jsonb then null else (payload ->> 'dueAt')::timestamptz end,
      coalesce((payload ->> 'recurrence')::public.task_recurrence, 'none'), extensions.gen_random_uuid()
    ) returning * into task_row;

  elsif command_type = 'update' then
    allowed_keys := array['taskId', 'expectedVersion', 'title', 'visibility', 'assigneeUserId', 'dueAt', 'recurrence'];
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

    update public.tasks existing set
      title = case when payload ? 'title' then trim(payload ->> 'title') else existing.title end,
      visibility = case when payload ? 'visibility' then (payload ->> 'visibility')::public.visibility else existing.visibility end,
      assignee_user_id = case when payload ? 'assigneeUserId' then nullif(payload ->> 'assigneeUserId', '')::uuid else existing.assignee_user_id end,
      due_at = case when payload ? 'dueAt' then nullif(payload ->> 'dueAt', '')::timestamptz else existing.due_at end,
      recurrence = case when payload ? 'recurrence' then (payload ->> 'recurrence')::public.task_recurrence else existing.recurrence end,
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
      new_due_at := case task_row.recurrence
        when 'daily' then task_row.due_at + interval '1 day'
        when 'weekly' then task_row.due_at + interval '1 week'
        when 'monthly' then task_row.due_at + interval '1 month'
      end;
      insert into public.tasks (
        household_id, owner_user_id, created_by, assignee_user_id, visibility,
        title, due_at, recurrence, idempotency_key, previous_occurrence_id
      ) values (
        task_row.household_id, task_row.owner_user_id, actor_id, task_row.assignee_user_id,
        task_row.visibility, task_row.title, new_due_at, task_row.recurrence,
        extensions.gen_random_uuid(), task_row.id
      ) returning * into spawned_row;
    end if;
  end if;

  insert into public.audit_log (household_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    actor_household_id, actor_id, 'task.' || command_type, 'task', task_row.id,
    jsonb_strip_nulls(jsonb_build_object('command_id', command_id, 'version', task_row.version, 'spawned_task_id', spawned_row.id))
  );
  result := jsonb_build_object(
    'commandId', command_id, 'replayed', false, 'task', public.task_to_json(task_row)
  );
  update public.task_command_receipts r set response = result
  where r.actor_user_id = actor_id and r.command_id = execute_task_command.command_id;
  return result;
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'invalid task command' using errcode = '22023';
end;
$$;


revoke all on function public.execute_task_command(uuid, jsonb) from public;
grant execute on function public.execute_task_command(uuid, jsonb) to authenticated;

alter table public.tasks add column recurrence_rule jsonb;

create function public.valid_task_recurrence_rule(rule jsonb, due_at timestamptz)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare
  day_value jsonb;
  seen_days integer[] := '{}';
  end_date date;
  local_due timestamp;
begin
  if rule is null or due_at is null or not isfinite(due_at) or jsonb_typeof(rule) <> 'object' then return false; end if;
  if not (rule ?& array['frequency','interval','weekdays','until','timeZone'])
    or (select count(*) from jsonb_object_keys(rule)) <> 5
    or jsonb_typeof(rule->'frequency') <> 'string'
    or rule->>'frequency' not in ('daily','weekly','monthly','yearly')
    or jsonb_typeof(rule->'interval') <> 'number'
    or (rule->>'interval') !~ '^[1-9][0-9]{0,2}$'
    or (rule->>'interval')::integer > 365
    or jsonb_typeof(rule->'weekdays') <> 'array'
    or jsonb_typeof(rule->'until') not in ('string','null')
    or jsonb_typeof(rule->'timeZone') <> 'string'
    or rule->>'timeZone' <> 'America/Bahia'
  then return false; end if;
  if jsonb_array_length(rule->'weekdays') > 7 then return false; end if;
  for day_value in select value from jsonb_array_elements(rule->'weekdays') loop
    if jsonb_typeof(day_value) <> 'number' or day_value::text !~ '^[0-6]$' then return false; end if;
    if day_value::text::integer = any(seen_days) then return false; end if;
    seen_days := array_append(seen_days, day_value::text::integer);
  end loop;
  local_due := due_at at time zone 'America/Bahia';
  if cardinality(seen_days) > 0 and (rule->>'frequency' <> 'weekly'
    or not (extract(dow from local_due)::integer = any(seen_days))) then return false; end if;
  if rule->>'until' is not null then
    if (rule->>'until') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
    end_date := (rule->>'until')::date;
    if end_date < local_due::date then return false; end if;
  end if;
  return true;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then return false;
end;
$$;
revoke all on function public.valid_task_recurrence_rule(jsonb,timestamptz) from public, anon, authenticated;

alter table public.tasks add constraint valid_custom_task_recurrence check (
  case when recurrence = 'custom' then public.valid_task_recurrence_rule(recurrence_rule, due_at)
       else recurrence_rule is null end
);

create function public.next_task_recurrence_due_at(due_at timestamptz, recurrence public.task_recurrence, rule jsonb)
returns timestamptz language plpgsql stable set search_path = pg_catalog as $$
declare
  local_due timestamp;
  next_due timestamp;
  frequency text;
  step integer;
  current_day integer;
  selected_days integer[];
  later_day integer;
begin
  if recurrence = 'none' then return null; end if;
  if recurrence <> 'custom' then
    return case recurrence when 'daily' then due_at + interval '1 day'
      when 'weekly' then due_at + interval '1 week' when 'monthly' then due_at + interval '1 month' end;
  end if;
  if not public.valid_task_recurrence_rule(rule, due_at) then
    raise exception 'invalid task recurrence' using errcode = '22023';
  end if;
  local_due := due_at at time zone 'America/Bahia';
  frequency := rule->>'frequency'; step := (rule->>'interval')::integer;
  if frequency = 'daily' then next_due := local_due + make_interval(days => step);
  elsif frequency in ('monthly','yearly') then
    next_due := local_due + make_interval(months => step * case when frequency = 'yearly' then 12 else 1 end);
  else
    current_day := (extract(dow from local_due)::integer + 6) % 7;
    select array_agg((value::text::integer + 6) % 7 order by (value::text::integer + 6) % 7)
      into selected_days from jsonb_array_elements(rule->'weekdays');
    if selected_days is null then selected_days := array[current_day]; end if;
    select min(day) into later_day from unnest(selected_days) day where day > current_day;
    next_due := local_due + make_interval(days => coalesce(later_day - current_day, step * 7 - current_day + selected_days[1]));
  end if;
  if rule->>'until' is not null and next_due::date > (rule->>'until')::date then return null; end if;
  return next_due at time zone 'America/Bahia';
end;
$$;
revoke all on function public.next_task_recurrence_due_at(timestamptz,public.task_recurrence,jsonb) from public, anon, authenticated;

-- Preserve the existing authenticated gateway, receipt locking, RLS scope and audit.

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
    allowed_keys := array['title', 'visibility', 'assigneeUserId', 'dueAt', 'recurrence', 'recurrenceRule'];
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
    allowed_keys := array['taskId', 'expectedVersion', 'title', 'visibility', 'assigneeUserId', 'dueAt', 'recurrence', 'recurrenceRule'];
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

  insert into public.audit_log (household_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    actor_household_id, actor_id, 'task.' || command_type, 'task', task_row.id,
    jsonb_strip_nulls(jsonb_build_object('command_id', command_id, 'version', task_row.version, 'spawned_task_id', spawned_row.id))
  );
  result := jsonb_build_object(
    'commandId', command_id, 'replayed', false, 'task', public.task_to_json(task_row) || case when task_row.recurrence = 'custom' then jsonb_build_object('recurrenceRule', task_row.recurrence_rule) else '{}'::jsonb end
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

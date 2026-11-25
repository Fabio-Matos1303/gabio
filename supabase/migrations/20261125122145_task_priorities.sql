begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.tasks add column priority text not null default 'medium'
  constraint tasks_priority_check check (priority in ('low','medium','high'));

-- Keep older readers and strict receipts unchanged during rolling updates.
create function public.list_tasks_page_v4(page_offset integer default 0) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(entry || jsonb_build_object('priority',t.priority) order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(public.list_tasks_page_v3(page_offset)) with ordinality as rows(entry,ordinal)
  join public.tasks t on t.id=(entry->>'id')::uuid;
$$;

create function public.copy_task_priority() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if new.previous_occurrence_id is not null then
    select t.priority into new.priority from public.tasks t
    where t.id=new.previous_occurrence_id and t.household_id=new.household_id;
    if not found then raise exception 'invalid recurrence parent' using errcode='22023'; end if;
  end if;
  return new;
end;
$$;
create trigger copy_task_priority before insert on public.tasks
for each row execute function public.copy_task_priority();

create function public.execute_task_priority_command(command_id uuid, command jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare
  actor uuid := auth.uid();
  house uuid;
  payload jsonb;
  target uuid;
  expected integer;
  task_row public.tasks%rowtype;
  receipt public.task_command_receipts%rowtype;
  command_hash bytea;
  result jsonb;
begin
  if actor is null then raise exception 'authentication required' using errcode='28000'; end if;
  if command_id is null or command is null or jsonb_typeof(command) is distinct from 'object'
    or not(command ?& array['type','payload']) or (select count(*) from jsonb_object_keys(command))<>2
    or command->>'type' is distinct from 'update' or jsonb_typeof(command->'payload') is distinct from 'object'
  then raise exception 'invalid priority command' using errcode='22023'; end if;
  payload:=command->'payload';
  if not(payload ?& array['taskId','expectedVersion','priority'])
    or (select count(*) from jsonb_object_keys(payload))<>3
    or jsonb_typeof(payload->'taskId') is distinct from 'string'
    or jsonb_typeof(payload->'expectedVersion') is distinct from 'number'
    or (payload->>'expectedVersion') !~ '^[1-9][0-9]*$'
    or jsonb_typeof(payload->'priority') is distinct from 'string'
    or payload->>'priority' not in ('low','medium','high')
  then raise exception 'invalid priority command' using errcode='22023'; end if;
  target:=(payload->>'taskId')::uuid;
  expected:=(payload->>'expectedVersion')::integer;
  select household_id into house from public.household_members where user_id=actor;
  if house is null then raise exception 'operation not allowed' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(house::text,91));
  select * into task_row from public.tasks t where t.id=target and t.household_id=house
    and (t.visibility='household' or t.owner_user_id=actor) for update;
  if not found then raise exception 'task conflict or unavailable' using errcode='40001'; end if;

  -- Isolate receipts from legacy RPC replay paths, which hash unprefixed JSON.
  command_hash:=extensions.digest('task_priority:' || command::text,'sha256');
  insert into public.task_command_receipts(actor_user_id,command_id,household_id,payload_hash)
    values(actor,command_id,house,command_hash) on conflict on constraint task_command_receipts_pkey do nothing;
  select * into receipt from public.task_command_receipts r
    where r.actor_user_id=actor and r.command_id=execute_task_priority_command.command_id for update;
  if receipt.household_id<>house or receipt.payload_hash<>command_hash then
    raise exception 'idempotency conflict' using errcode='22023';
  end if;
  if receipt.response is not null then return jsonb_set(receipt.response,'{replayed}','true'::jsonb); end if;

  if task_row.version<>expected or task_row.status not in ('open','in_progress') then
    raise exception 'task conflict or unavailable' using errcode='40001';
  end if;
  update public.tasks t set priority=payload->>'priority',version=t.version+1,updated_at=now()
    where t.id=target returning * into task_row;
  result:=jsonb_build_object('commandId',command_id,'replayed',false,'task',
    public.task_to_json(task_row) || jsonb_build_object('priority',task_row.priority,'tags',public.task_tag_names(target))
    || case when task_row.recurrence='custom' then jsonb_build_object('recurrenceRule',task_row.recurrence_rule) else '{}'::jsonb end);
  insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id,metadata)
    values(house,actor,'task.priority','task',target,jsonb_build_object('command_id',command_id,'version',task_row.version));
  update public.task_command_receipts r set response=result
    where r.actor_user_id=actor and r.command_id=execute_task_priority_command.command_id;
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid priority command' using errcode='22023';
end;
$$;

revoke all on function public.copy_task_priority(),public.list_tasks_page_v4(integer),
  public.execute_task_priority_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.list_tasks_page_v4(integer),public.execute_task_priority_command(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

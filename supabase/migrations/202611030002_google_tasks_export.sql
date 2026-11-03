begin;
-- Additive projection metadata; existing links remain Google Calendar.
alter table public.google_calendar_connections add column new_task_destination text not null default 'google_tasks' check(new_task_destination in ('google_tasks','google_calendar')), add column preferences_version integer not null default 1;
alter table public.task_calendar_links add column provider text not null default 'google_calendar' check(provider in ('google_tasks','google_calendar')), add column remote_task_id text check(length(remote_task_id) between 1 and 1024), add column insertion_attempted boolean not null default false;
create table app_private.google_export_settings(singleton boolean primary key default true check(singleton), activated_at timestamptz);
insert into app_private.google_export_settings values(true,null);
alter table app_private.google_export_settings enable row level security;
create table app_private.google_export_intents(
 connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
 task_id uuid not null, provider text not null check(provider in ('google_tasks','google_calendar')),
 created_at timestamptz not null default now(),primary key(connection_id,task_id)
);
alter table app_private.google_export_intents enable row level security;
insert into app_private.google_export_intents(connection_id,task_id,provider) select distinct connection_id,task_id,'google_calendar' from public.task_calendar_links;
create table public.google_task_targets(
 connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,target_kind public.visibility not null,
 list_id text check(length(list_id) between 1 and 1024),state text not null check(state in ('creating','ready')),
 primary key(connection_id,target_kind),check((state='ready')=(list_id is not null))
);
alter table public.google_task_targets enable row level security;
revoke all on public.google_task_targets from public,anon,authenticated;
revoke all on app_private.google_export_settings,app_private.google_export_intents from public,anon,authenticated;
create table app_private.google_preference_receipts(actor uuid not null references public.profiles(id) on delete cascade,command_id uuid not null,payload jsonb not null,primary key(actor,command_id));
alter table app_private.google_preference_receipts enable row level security;
revoke all on app_private.google_preference_receipts from public,anon,authenticated;

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
   values(i.connection_id,t.id,t.visibility,'g'||md5(i.connection_id::text||t.id::text||t.visibility::text),i.provider) on conflict(connection_id,task_id,target_kind) do nothing;
  end loop;
 end if;
 for link_id in select id from public.task_calendar_links where task_id=target_task loop perform public.gc_enqueue_link(link_id); end loop;
end; $$;
create or replace function public.gc_task_changed() returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; activation timestamptz;
begin
 if tg_op='INSERT' then
  select activated_at into activation from app_private.google_export_settings where singleton;
  for c in select g.* from public.google_calendar_connections g where g.household_id=new.household_id and g.status in ('connected','reconnect')
   and exists(select 1 from public.household_members m where m.household_id=g.household_id and m.user_id=g.user_id)
   and ((new.visibility='household' and g.export_household) or (new.visibility='private' and g.export_private and g.user_id=new.owner_user_id))
   order by g.id for update
  loop
   insert into app_private.google_export_intents(connection_id,task_id,provider)
   values(c.id,new.id,case when activation is null then 'google_calendar' else c.new_task_destination end) on conflict do nothing;
  end loop;
 end if;
 perform public.gc_queue_task(case when tg_op='DELETE' then old.id else new.id end); return null;
end; $$;

create function public.gc_export_status(actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections;
begin
 select * into c from public.google_calendar_connections g where g.user_id=actor and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=g.household_id);
 return jsonb_build_object('newTaskDestination',coalesce(c.new_task_destination,'google_tasks'),'version',coalesce(c.preferences_version,1),'tasksAuthorized',coalesce(c.status='connected' and c.scopes ? 'https://www.googleapis.com/auth/tasks' and exists(select 1 from app_private.google_calendar_credentials where connection_id=c.id),false),'routingEnabled',exists(select 1 from app_private.google_export_settings where activated_at is not null));
end; $$;
create function public.gc_export_preferences(actor uuid,command_id uuid,expected_version integer,destination text) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; receipt app_private.google_preference_receipts; payload jsonb;
begin
 if command_id is null or expected_version is null or expected_version<1 or destination is null or destination not in ('google_tasks','google_calendar') then raise exception 'invalid export preferences';end if;
 select * into strict c from public.google_calendar_connections g where user_id=actor and status in ('connected','reconnect') and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=g.household_id) for update;
 payload:=jsonb_build_object('version',expected_version,'destination',destination,'connection',c.id);
 select * into receipt from app_private.google_preference_receipts r where r.actor=gc_export_preferences.actor and r.command_id=gc_export_preferences.command_id;
 if found then if receipt.payload<>payload then raise exception 'idempotency conflict';end if;return;end if;
 if c.preferences_version<>expected_version then raise exception 'preferences conflict' using errcode='40001';end if;
 update public.google_calendar_connections set new_task_destination=destination,preferences_version=preferences_version+1 where id=c.id;
 insert into app_private.google_preference_receipts values(actor,command_id,payload);
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id) values(c.household_id,actor,'google.export_preferences','integration',c.id);
end; $$;

-- Tasks destinations are never adopted by title. Only an already leased job may register one.
create function public.gc_tasks_target(job_id uuid,lease_token uuid,list_id text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare j jsonb; kind public.visibility; conn uuid;
begin
 j:=public.gc_validate_job(job_id,lease_token);if j is null or j->>'provider' is distinct from 'google_tasks' or j->>'action' is distinct from 'upsert' then raise exception 'stale task job';end if;
 if list_id is not null and length(list_id) not between 1 and 1024 then raise exception 'invalid list';end if;
 conn:=(j->>'connectionId')::uuid;kind:=(j->>'targetKind')::public.visibility;
 insert into public.google_task_targets values(conn,kind,list_id,case when list_id is null then 'creating' else 'ready' end)
 on conflict(connection_id,target_kind) do update set list_id=excluded.list_id,state=excluded.state where google_task_targets.state='creating';
end; $$;
create function public.gc_tasks_attempt(job_id uuid,lease_token uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare j jsonb;
begin
 j:=public.gc_validate_job(job_id,lease_token);if j is null or j->>'provider' is distinct from 'google_tasks' or j->>'action' is distinct from 'upsert' then raise exception 'stale task job';end if;
 update public.task_calendar_links l set insertion_attempted=true from public.outbox_events q where q.id=job_id and l.id=q.gc_link_id and not l.insertion_attempted and l.remote_task_id is null;
 if not found then raise exception 'insertion already attempted';end if;
end; $$;
-- Identity persistence is allowed after a local generation change, but only within the same credential/lease.
create function public.gc_tasks_identity(job_id uuid,lease_token uuid,remote_id text,previous_cipher text) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
begin
 if remote_id is null or length(remote_id) not between 1 and 1024 then raise exception 'invalid task identity';end if;
 update public.task_calendar_links l set remote_task_id=remote_id from public.outbox_events q,public.google_calendar_connections c,app_private.google_calendar_credentials cred
 where q.id=job_id and q.gc_link_id=l.id and l.provider='google_tasks' and l.insertion_attempted and l.remote_task_id is null
 and c.id=q.gc_connection_id and c.worker_lease=lease_token and c.worker_lease_until>now() and q.gc_lease_token=lease_token and cred.connection_id=c.id and cred.token_cipher=previous_cipher;
 if not found then raise exception 'task identity persistence failed';end if;
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
 eligible:=t.id is not null and t.household_id=c.household_id and c.status='connected' and (l.provider='google_tasks' or t.due_at is not null) and t.status<>'cancelled' and (l.provider='google_calendar' or t.status<>'completed' or l.remote_task_id is not null or l.insertion_attempted) and t.visibility=l.target_kind
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
 'task',case when eligible then jsonb_build_object('id',t.id,'title',t.title,'dueAt',t.due_at,'status',t.status,'version',t.version,'visibility',t.visibility) else null end,
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
   and not exists(select 1 from public.task_calendar_links current_link join public.task_calendar_links old_link on old_link.task_id=current_link.task_id join public.outbox_events cleanup on cleanup.gc_link_id=old_link.id where current_link.id=o.gc_link_id and current_link.provider='google_tasks' and public.gc_job_payload(o.id)->>'action'='upsert' and cleanup.processed_at is null and public.gc_job_payload(cleanup.id)->>'action'='delete')
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
create or replace function public.gc_claim_jobs(batch_size integer default 10) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.gc_claim_jobs_v2(batch_size,false,false); $$;
create or replace function public.gc_validate_job(job_id uuid,lease_token uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.outbox_events;
begin
 select o.* into q from public.outbox_events o join public.google_calendar_connections c on c.id=o.gc_connection_id
 where o.id=job_id and o.gc_lease_token=lease_token and c.worker_lease=lease_token and c.worker_lease_until>now() and o.processed_at is null for update of o;
 if not found then return null; end if;
 if q.gc_claimed_generation<>q.gc_generation then
  update public.outbox_events set locked_at=null,gc_lease_token=null,available_at=now() where id=q.id;
  update public.google_calendar_connections set worker_lease=null,worker_lease_until=null where id=q.gc_connection_id and worker_lease=lease_token;
  return null;
 end if;
 if exists(select 1 from public.task_calendar_links l join public.google_calendar_connections c on c.id=l.connection_id where l.id=q.gc_link_id and l.provider='google_tasks' and not(c.scopes ? 'https://www.googleapis.com/auth/tasks') and (l.remote_task_id is not null or l.insertion_attempted or public.gc_job_payload(q.id)->>'action'='upsert')) then
  update public.outbox_events set locked_at=null,gc_lease_token=null,attempts=greatest(0,attempts-1) where id=q.id;
  update public.google_calendar_connections set worker_lease=null,worker_lease_until=null where id=q.gc_connection_id and worker_lease=lease_token;
  return null;
 end if;
 return public.gc_job_payload(q.id);
end; $$;
create or replace function public.gc_finish_job(job_id uuid,lease_token uuid,result jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare q public.outbox_events; state text:=result->>'status'; err text:=result->>'errorCode';
begin
 if (result ? 'sentVersion' and (jsonb_typeof(result->'sentVersion')<>'number' or (result->>'sentVersion')!~'^[0-9]{1,9}$')) or state is null or state not in ('synced','deleted','retry','reconnect','failed') or jsonb_typeof(result)<>'object' or (err is not null and err!~'^[a-zA-Z0-9_:-]{1,80}$')
 or exists(select 1 from jsonb_object_keys(result) k where k not in ('status','etag','errorCode','sentVersion')) or (result ? 'etag' and jsonb_typeof(result->'etag') not in ('null','string')) then raise exception 'invalid worker result'; end if;
 select o.* into strict q from public.outbox_events o join public.google_calendar_connections c on c.id=o.gc_connection_id
 where o.id=job_id and o.gc_lease_token=lease_token and c.worker_lease=lease_token and c.worker_lease_until>now() for update of o;
 if state='deleted' and q.gc_link_id is not null then update public.task_calendar_links set remote_task_id=null,insertion_attempted=false where id=q.gc_link_id and provider='google_tasks';end if;
 -- A confirmed remote deletion tombstones the old ID even when superseded locally.
 if (state='deleted' or (state='retry' and err='remote_event_deleted')) and q.gc_link_id is not null and exists(select 1 from public.task_calendar_links where id=q.gc_link_id and provider='google_calendar') then
  update public.task_calendar_links set projection_epoch=projection_epoch+1,event_id='g'||md5(gen_random_uuid()::text),etag=null where id=q.gc_link_id;
 end if;
 if q.gc_generation<>q.gc_claimed_generation then
  update public.outbox_events set locked_at=null,gc_lease_token=null,available_at=now() where id=q.id;
 else
  update public.outbox_events set processed_at=case when state in ('synced','deleted') then now() else null end,locked_at=null,gc_lease_token=null,
   gc_terminal=(state='failed' or (state='retry' and attempts>=8) or (state='reconnect' and exists(select 1 from public.google_calendar_connections c where c.id=q.gc_connection_id and c.status='disconnecting'))),available_at=case when state='retry' then now()+make_interval(secs=>least(3600,power(2,least(attempts,11))::integer*15+floor(random()*15)::integer)) else now() end where id=q.id;
  if q.gc_link_id is not null then update public.task_calendar_links set last_checked_at=now(),sync_status=case when state='synced' then 'synced' when state='deleted' then 'deleted' when state='failed' or (state='retry' and q.attempts>=8) then 'failed' else 'pending' end,
   remote_task_id=case when state='deleted' and provider='google_tasks' then null else remote_task_id end,insertion_attempted=case when state='deleted' and provider='google_tasks' then false else insertion_attempted end,etag=coalesce(result->>'etag',etag),error_code=err,synced_version=case when state='synced' then coalesce((result->>'sentVersion')::integer,synced_version) else synced_version end where id=q.gc_link_id; end if;
  if q.topic='google_calendar.revoke' and state in ('synced','deleted') then delete from app_private.google_calendar_credentials where connection_id=q.gc_connection_id; update public.google_calendar_connections set status='disconnected' where id=q.gc_connection_id; end if;
 end if;
 update public.google_calendar_connections set worker_lease=null,worker_lease_until=null,last_synced_at=case when state in ('synced','deleted') then now() else last_synced_at end,
 status=case when state='reconnect' and status<>'disconnecting' then 'reconnect' else status end where id=q.gc_connection_id;
end; $$;
create or replace function public.gc_finish_oauth(actor uuid,household uuid,token_cipher text,scopes jsonb,preferences jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare conn uuid; t uuid;
begin
 perform public.gc_validate_preferences(preferences);
 if not exists(select 1 from public.household_members where user_id=actor and household_id=household) then raise exception 'membership required' using errcode='42501'; end if;
 if jsonb_typeof(scopes) is distinct from 'array' or not scopes ? 'https://www.googleapis.com/auth/calendar.app.created' then raise exception 'calendar scope required'; end if;
 insert into public.google_calendar_connections(user_id,household_id,status,export_household,export_private,reminder_minutes,scopes)
 values(actor,household,'connected',(preferences->>'exportHousehold')::boolean,(preferences->>'exportPrivate')::boolean,(preferences->>'reminderMinutes')::integer,scopes)
 on conflict(user_id) do update set status='connected',scopes=excluded.scopes,last_reconciled_at=now(),worker_lease=null,worker_lease_until=null,updated_at=now()
 where google_calendar_connections.household_id=excluded.household_id and google_calendar_connections.status<>'disconnecting' returning id into conn;
 if conn is null then raise exception 'connection context changed'; end if;
 insert into app_private.google_calendar_credentials(connection_id,token_cipher) values(conn,token_cipher) on conflict(connection_id) do update set token_cipher=excluded.token_cipher;
 for t in select id from public.task_calendar_links where connection_id=conn loop perform public.gc_enqueue_link(t); end loop;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id) values(household,actor,'google_calendar.connected','integration',conn);
end; $$;
create or replace function public.gc_begin_oauth(actor uuid,state_hash text,verifier_cipher text,preferences jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare household uuid;
begin
 perform public.gc_validate_preferences(preferences);
 if exists(select 1 from public.google_calendar_connections where user_id=actor and status in ('connected','reconnect')) then
  select jsonb_build_object('exportHousehold',export_household,'exportPrivate',export_private,'reminderMinutes',reminder_minutes,'importUpcoming',false,'readSources',coalesce((preferences->>'readSources')::boolean,false),'writeTasks',coalesce((preferences->>'writeTasks')::boolean,false)) into preferences from public.google_calendar_connections where user_id=actor;
 end if;
 select household_id into strict household from public.household_members where user_id=actor;
 if exists(select 1 from public.google_calendar_connections where user_id=actor and status='disconnecting') then raise exception 'calendar disconnect in progress'; end if;
 delete from app_private.google_calendar_oauth_states s where s.user_id=actor or s.expires_at<=now();
 insert into app_private.google_calendar_oauth_states(state_hash,user_id,household_id,verifier_cipher,preferences) values(state_hash,actor,household,verifier_cipher,preferences);
end; $$;
create or replace function public.gc_validate_preferences(preferences jsonb) returns void language plpgsql set search_path=pg_catalog,public as $$
begin
 if jsonb_typeof(preferences) is distinct from 'object'
 or exists(select 1 from jsonb_object_keys(preferences) k where k not in ('exportHousehold','exportPrivate','reminderMinutes','importUpcoming','readSources','writeTasks'))
 or jsonb_typeof(preferences->'exportHousehold') is distinct from 'boolean' or jsonb_typeof(preferences->'exportPrivate') is distinct from 'boolean'
 or (preferences ? 'importUpcoming' and jsonb_typeof(preferences->'importUpcoming') is distinct from 'boolean')
 or (preferences ? 'readSources' and jsonb_typeof(preferences->'readSources') is distinct from 'boolean')
 or (preferences ? 'writeTasks' and jsonb_typeof(preferences->'writeTasks') is distinct from 'boolean')
 or not(preferences ? 'reminderMinutes')
 or (preferences->'reminderMinutes'<>'null'::jsonb and (jsonb_typeof(preferences->'reminderMinutes')<>'number' or (preferences->>'reminderMinutes')!~'^[0-9]+$' or (preferences->>'reminderMinutes')::numeric>10080))
 then raise exception 'invalid calendar preferences' using errcode='22023';end if;
end; $$;
create or replace function public.gc_read_context(actor uuid,claim boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; token text; links jsonb; annotations jsonb; budget integer;
begin
 select * into c from public.google_calendar_connections g where g.user_id=actor
 and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=g.household_id) for update;
 if c.id is null then return jsonb_build_object('state','consent_required'); end if;
 if c.status<>'connected' then return jsonb_build_object('state','reconnect');end if;
 if not((c.scopes ? 'https://www.googleapis.com/auth/tasks.readonly' or c.scopes ? 'https://www.googleapis.com/auth/tasks') and c.scopes ?& array['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly']) then return jsonb_build_object('state','consent_required');end if;
 if claim then
  if c.read_claimed_at>now()-interval '60 seconds' then return jsonb_build_object('state','rate_limited','generation',c.read_generation);end if;
  insert into app_private.google_read_budget values(actor,current_date,0) on conflict do nothing;
  update app_private.google_read_budget b set claims=claims+1 where b.user_id=actor and b.day=current_date and b.claims<120 returning claims into budget;
  if budget is null then return jsonb_build_object('state','rate_limited','generation',c.read_generation);end if;
  update public.google_calendar_connections set read_claimed_at=now() where id=c.id;
 end if;
 select token_cipher into token from app_private.google_calendar_credentials where connection_id=c.id;
 if token is null then return jsonb_build_object('state','reconnect');end if;
 select coalesce(jsonb_agg(jsonb_build_object('calendarId',t.calendar_id,'eventId',l.event_id)),'[]'::jsonb) into links
 from public.task_calendar_links l join public.google_calendar_targets t on t.connection_id=l.connection_id and t.target_kind=l.target_kind
 where l.connection_id=c.id and l.provider='google_calendar' and t.calendar_id is not null;
 select links||coalesce(jsonb_agg(jsonb_build_object('calendarId',t.list_id,'eventId',l.remote_task_id,'provider','google_tasks')),'[]'::jsonb) into links from public.task_calendar_links l join public.google_task_targets t on t.connection_id=l.connection_id and t.target_kind=l.target_kind where l.connection_id=c.id and l.provider='google_tasks' and l.remote_task_id is not null and t.list_id is not null;
 select coalesce(jsonb_agg(jsonb_build_object('listId',list_id,'taskId',task_id,'tags',tags)),'[]'::jsonb) into annotations
 from public.external_task_tags where connection_id=c.id and generation=c.read_generation;
 return jsonb_build_object('state','connected','connectionId',c.id,'generation',c.read_generation,'userId',c.user_id,'householdId',c.household_id,'tokenCipher',token,'links',links,'annotations',annotations);
end; $$;
create or replace function public.gc_save_external_tags(actor uuid,command_id uuid,generation uuid,list_id text,task_id text,tags jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare c public.google_calendar_connections; r public.tag_command_receipts; h bytea; n jsonb; name text; normalized jsonb:='[]';seen text[]:='{}';
begin
 select * into c from public.google_calendar_connections x where x.user_id=actor and x.read_generation=generation and x.status='connected'
 and (x.scopes ? 'https://www.googleapis.com/auth/tasks.readonly' or x.scopes ? 'https://www.googleapis.com/auth/tasks')
 and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=x.household_id) for update;
 if c.id is null then raise exception 'connection unavailable' using errcode='42501'; end if;
 if command_id is null or list_id is null or task_id is null or length(list_id) not between 1 and 1024 or length(task_id) not between 1 and 1024 or jsonb_typeof(tags) is distinct from 'array' or jsonb_array_length(tags)>10 then raise exception 'invalid external tags' using errcode='22023';end if;
 for n in select value from jsonb_array_elements(tags) loop
  if jsonb_typeof(n) is distinct from 'string' then raise exception 'invalid external tags' using errcode='22023';end if;
  name:=regexp_replace(trim(n#>>'{}'),'\s+',' ','g');
  if length(name) not between 1 and 32 or lower(name)=any(seen) then raise exception 'invalid external tags' using errcode='22023';end if;
  seen:=array_append(seen,lower(name));normalized:=normalized||jsonb_build_array(name);
 end loop;
 h:=extensions.digest(jsonb_build_object('generation',generation,'list',list_id,'task',task_id,'tags',tags)::text,'sha256');
 insert into public.tag_command_receipts values(actor,command_id,c.household_id,h,null) on conflict do nothing;
 select * into r from public.tag_command_receipts x where x.actor_user_id=actor and x.command_id=gc_save_external_tags.command_id for update;
 if r.household_id<>c.household_id or r.payload_hash<>h then raise exception 'idempotency conflict' using errcode='22023';end if;
 if r.response is not null then return;end if;
 insert into public.external_task_tags values(c.id,generation,list_id,task_id,normalized)
 on conflict on constraint external_task_tags_pkey do update set tags=excluded.tags;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(c.household_id,actor,'external_task.tags','integration',c.id,jsonb_build_object('command_id',command_id));
 update public.tag_command_receipts x set response='{"ok":true}' where x.actor_user_id=actor and x.command_id=gc_save_external_tags.command_id;
end; $$;
create or replace function public.gc_read_permission_status(actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections;
begin
 select * into c from public.google_calendar_connections g
 where g.user_id=actor and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=g.household_id);
 if c.id is null or c.status='disconnected' then return jsonb_build_object('state','not_authorized'); end if;
 if c.status='disconnecting' then return jsonb_build_object('state','disconnecting'); end if;
 if c.status='reconnect' then return jsonb_build_object('state','reconnect'); end if;
 if jsonb_typeof(c.scopes) is distinct from 'array' or not ((c.scopes ? 'https://www.googleapis.com/auth/tasks.readonly' or c.scopes ? 'https://www.googleapis.com/auth/tasks') and c.scopes ?& array['https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly']) then
  return jsonb_build_object('state','not_authorized');
 end if;
 if not exists(select 1 from app_private.google_calendar_credentials cred where cred.connection_id=c.id) then return jsonb_build_object('state','reconnect'); end if;
 return jsonb_build_object('state','authorized');
end; $$;
create function public.gc_tasks_repair_lists(actor uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.google_calendar_connections; kind public.visibility; link_id uuid;
begin
 select g.* into strict c from public.google_calendar_connections g where g.user_id=actor and g.status='connected' and exists(select 1 from public.household_members m where m.household_id=g.household_id and m.user_id=actor) for update;
 if c.last_repair_at>now()-interval '2 minutes' then raise exception 'repair rate limited';end if;
 if c.worker_lease_until>now() then raise exception 'worker busy';end if;
 for kind in delete from public.google_task_targets where connection_id=c.id and state='creating' and list_id is null returning target_kind loop
  for link_id in select id from public.task_calendar_links where connection_id=c.id and provider='google_tasks' and target_kind=kind and not insertion_attempted and remote_task_id is null loop perform public.gc_enqueue_link(link_id);end loop;
 end loop;
 update public.google_calendar_connections set last_repair_at=now() where id=c.id;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id) values(c.household_id,actor,'google.tasks_lists_repair','integration',c.id);
end; $$;
create function public.gc_export_oauth_context(actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; targets jsonb;
begin
 select * into c from public.google_calendar_connections g where g.user_id=actor and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=g.household_id);
 select coalesce(jsonb_agg(t.list_id),'[]'::jsonb) into targets from public.google_task_targets t where t.connection_id=c.id and t.state='ready';
 return jsonb_build_object('scopes',coalesce(c.scopes,'[]'::jsonb),'taskLists',targets);
end; $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (left(p.proname,10)='gc_export_' or left(p.proname,9)='gc_tasks_' or p.proname='gc_claim_jobs_v2')
 loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end; $$;
commit;

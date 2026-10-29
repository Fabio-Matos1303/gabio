-- Credentials and one-use OAuth state are server-only and encrypted by the Edge Function.
create schema if not exists app_private;
revoke all on schema app_private from public,anon,authenticated;
create table public.google_calendar_connections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 status text not null check(status in ('connected','reconnect','disconnecting','disconnected')),
 export_household boolean not null default true, export_private boolean not null default false,
 reminder_minutes integer check(reminder_minutes between 0 and 10080), scopes jsonb not null check(jsonb_typeof(scopes)='array'),
 last_reconciled_at timestamptz not null default now(),last_repair_at timestamptz,last_synced_at timestamptz,worker_lease uuid,worker_lease_until timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table app_private.google_calendar_budget (day date primary key,claims integer not null check(claims between 0 and 2880));
alter table app_private.google_calendar_budget enable row level security;
revoke all on app_private.google_calendar_budget from public,anon,authenticated;
create table app_private.google_calendar_credentials (
 connection_id uuid primary key references public.google_calendar_connections(id) on delete cascade,
 token_cipher text not null check(length(token_cipher) between 16 and 20000)
);
create table app_private.google_calendar_oauth_states (
 state_hash text primary key check(state_hash ~ '^([A-Za-z0-9_-]{43}|[a-f0-9]{64})$'),user_id uuid not null references public.profiles(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 verifier_cipher text not null check(length(verifier_cipher) between 16 and 2000),preferences jsonb not null,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create table app_private.google_calendar_pending_oauth (
 ticket_hash text primary key check(ticket_hash ~ '^([A-Za-z0-9_-]{43}|[a-f0-9]{64})$'),
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade,
 token_cipher text not null check(length(token_cipher) between 16 and 20000),scopes jsonb not null,preferences jsonb not null,
 expires_at timestamptz not null default now()+interval '5 minutes'
);
alter table app_private.google_calendar_pending_oauth enable row level security;
revoke all on app_private.google_calendar_pending_oauth from public,anon,authenticated;
create table public.google_calendar_targets (
 connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,target_kind public.visibility not null,
 calendar_id text check(length(calendar_id) between 1 and 1024),state text not null default 'creating' check(state in ('creating','ready')),
 primary key(connection_id,target_kind),check((state='ready')=(calendar_id is not null))
);
create table public.task_calendar_links (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
 task_id uuid not null,target_kind public.visibility not null,event_id text not null check(length(event_id) between 5 and 1024 and event_id ~ '^[0-9a-v]+$'),etag text,
 last_checked_at timestamptz,projection_epoch integer not null default 0,synced_version integer,sync_status text not null default 'pending' check(sync_status in ('pending','synced','deleted','failed')),
 error_code text check(length(error_code)<=80),unique(connection_id,task_id,target_kind)
);
alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_targets enable row level security;
alter table public.task_calendar_links enable row level security;
alter table app_private.google_calendar_credentials enable row level security;
alter table app_private.google_calendar_oauth_states enable row level security;
revoke all on public.google_calendar_connections,public.google_calendar_targets,public.task_calendar_links from public,anon,authenticated;
grant select on public.google_calendar_connections,public.google_calendar_targets,public.task_calendar_links to authenticated;
create policy gc_connection_owner on public.google_calendar_connections for select to authenticated using(user_id=auth.uid() and public.is_household_member(household_id));
create policy gc_target_owner on public.google_calendar_targets for select to authenticated using(exists(select 1 from public.google_calendar_connections c where c.id=connection_id and c.user_id=auth.uid()));
create policy gc_link_owner on public.task_calendar_links for select to authenticated using(exists(select 1 from public.google_calendar_connections c where c.id=connection_id and c.user_id=auth.uid()));
revoke all on app_private.google_calendar_credentials,app_private.google_calendar_oauth_states from public,anon,authenticated;
alter table public.outbox_events add column gc_connection_id uuid references public.google_calendar_connections(id) on delete cascade,
 add column gc_link_id uuid references public.task_calendar_links(id) on delete cascade,add column gc_generation bigint not null default 1,
 add column gc_lease_token uuid,add column gc_claimed_generation bigint,add column gc_terminal boolean not null default false;
create index gc_outbox_ready_idx on public.outbox_events(available_at) where gc_connection_id is not null and processed_at is null and not gc_terminal;

create function public.gc_validate_preferences(preferences jsonb) returns void language plpgsql set search_path=pg_catalog,public as $$
begin
 if jsonb_typeof(preferences) is distinct from 'object'
 or exists(select 1 from jsonb_object_keys(preferences) k where k not in ('exportHousehold','exportPrivate','reminderMinutes','importUpcoming'))
 or jsonb_typeof(preferences->'exportHousehold') is distinct from 'boolean' or jsonb_typeof(preferences->'exportPrivate') is distinct from 'boolean'
 or (preferences ? 'importUpcoming' and jsonb_typeof(preferences->'importUpcoming') is distinct from 'boolean')
 or not (preferences ? 'reminderMinutes')
 or (preferences->'reminderMinutes'<>'null'::jsonb and (jsonb_typeof(preferences->'reminderMinutes')<>'number' or (preferences->>'reminderMinutes')!~'^[0-9]+$' or (preferences->>'reminderMinutes')::numeric>10080))
 then raise exception 'invalid calendar preferences' using errcode='22023'; end if;
end; $$;
create function public.gc_enqueue_link(link_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.task_calendar_links;
begin
 select * into strict l from public.task_calendar_links where id=link_id;
 insert into public.outbox_events(household_id,topic,payload,deduplication_key,gc_connection_id,gc_link_id)
 select c.household_id,'google_calendar.task','{}',l.id,c.id,l.id from public.google_calendar_connections c where c.id=l.connection_id
 on conflict(household_id,topic,deduplication_key) do update set processed_at=null,available_at=now(),attempts=0,gc_terminal=false,gc_generation=outbox_events.gc_generation+1;
 update public.task_calendar_links set sync_status='pending',error_code=null where id=link_id;
end; $$;
create function public.gc_queue_task(target_task uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.tasks; c public.google_calendar_connections; link_id uuid;
begin
 select * into t from public.tasks where id=target_task;
 if found and t.due_at is not null and t.status<>'cancelled' then
  for c in select g.* from public.google_calendar_connections g join public.household_members m on m.household_id=g.household_id and m.user_id=g.user_id
   where g.household_id=t.household_id and g.status='connected' and ((t.visibility='household' and g.export_household) or (t.visibility='private' and g.export_private and t.owner_user_id=g.user_id))
  loop
   insert into public.task_calendar_links(connection_id,task_id,target_kind,event_id) values(c.id,t.id,t.visibility,'g'||md5(c.id::text||t.id::text||t.visibility::text)) on conflict(connection_id,task_id,target_kind) do nothing;
  end loop;
 end if;
 for link_id in select id from public.task_calendar_links where task_id=target_task loop perform public.gc_enqueue_link(link_id); end loop;
end; $$;
create function public.gc_task_changed() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.gc_queue_task(case when tg_op='DELETE' then old.id else new.id end); return null; end; $$;
create trigger tasks_google_calendar_outbox after insert or update or delete on public.tasks for each row execute function public.gc_task_changed();

create function public.gc_status(actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.google_calendar_connections; result jsonb;
begin
 select * into c from public.google_calendar_connections g where g.user_id=actor and exists(select 1 from public.household_members m where m.household_id=g.household_id and m.user_id=actor);
 if not found then return jsonb_build_object('connection',null); end if;
 select jsonb_build_object('status',c.status,'exportHousehold',c.export_household,'exportPrivate',c.export_private,'reminderMinutes',c.reminder_minutes,'lastSyncedAt',c.last_synced_at,
 'pendingCount',count(*) filter(where not q.gc_terminal),'failedCount',count(*) filter(where q.gc_terminal)) into result from public.outbox_events q where q.gc_connection_id=c.id and q.processed_at is null;
 return jsonb_build_object('connection',result);
end; $$;
create function public.gc_begin_oauth(actor uuid,state_hash text,verifier_cipher text,preferences jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare household uuid;
begin
 perform public.gc_validate_preferences(preferences); select household_id into strict household from public.household_members where user_id=actor;
 if exists(select 1 from public.google_calendar_connections where user_id=actor and status='disconnecting') then raise exception 'calendar disconnect in progress'; end if;
 delete from app_private.google_calendar_oauth_states s where s.user_id=actor or s.expires_at<=now();
 insert into app_private.google_calendar_oauth_states(state_hash,user_id,household_id,verifier_cipher,preferences) values(state_hash,actor,household,verifier_cipher,preferences);
end; $$;
create function public.gc_consume_oauth(state_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare s app_private.google_calendar_oauth_states;
begin
 delete from app_private.google_calendar_oauth_states x where x.state_hash=gc_consume_oauth.state_hash and x.expires_at>now() returning * into s;
 if not found or not exists(select 1 from public.household_members m where m.user_id=s.user_id and m.household_id=s.household_id) then raise exception 'invalid oauth state' using errcode='22023'; end if;
 return jsonb_build_object('user_id',s.user_id,'household_id',s.household_id,'verifier_cipher',s.verifier_cipher,'preferences',s.preferences);
end; $$;
create function public.gc_finish_oauth(actor uuid,household uuid,token_cipher text,scopes jsonb,preferences jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare conn uuid; t uuid;
begin
 perform public.gc_validate_preferences(preferences);
 if not exists(select 1 from public.household_members where user_id=actor and household_id=household) then raise exception 'membership required' using errcode='42501'; end if;
 if jsonb_typeof(scopes) is distinct from 'array' or not scopes ? 'https://www.googleapis.com/auth/calendar.app.created' then raise exception 'calendar scope required'; end if;
 insert into public.google_calendar_connections(user_id,household_id,status,export_household,export_private,reminder_minutes,scopes)
 values(actor,household,'connected',(preferences->>'exportHousehold')::boolean,(preferences->>'exportPrivate')::boolean,(preferences->>'reminderMinutes')::integer,scopes)
 on conflict(user_id) do update set status='connected',export_household=excluded.export_household,export_private=excluded.export_private,reminder_minutes=excluded.reminder_minutes,scopes=excluded.scopes,last_reconciled_at=now(),worker_lease=null,worker_lease_until=null,updated_at=now()
 where google_calendar_connections.household_id=excluded.household_id and google_calendar_connections.status<>'disconnecting' returning id into conn;
 if conn is null then raise exception 'connection context changed'; end if;
 insert into app_private.google_calendar_credentials(connection_id,token_cipher) values(conn,token_cipher) on conflict(connection_id) do update set token_cipher=excluded.token_cipher;
 for t in select id from public.tasks where coalesce((preferences->>'importUpcoming')::boolean,true) and household_id=household and due_at>=date_trunc('day',now() at time zone 'America/Bahia') at time zone 'America/Bahia' and status in ('open','in_progress') loop perform public.gc_queue_task(t); end loop;
 for t in select id from public.task_calendar_links where connection_id=conn loop perform public.gc_enqueue_link(t); end loop;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id) values(household,actor,'google_calendar.connected','integration',conn);
end; $$;
create function public.gc_oauth_target_ids(actor uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(t.calendar_id),'[]'::jsonb) from public.google_calendar_targets t join public.google_calendar_connections c on c.id=t.connection_id
 where c.user_id=actor and t.state='ready' and exists(select 1 from public.household_members m where m.household_id=c.household_id and m.user_id=actor);
$$;
create function public.gc_stage_oauth(actor uuid,household uuid,token_cipher text,scopes jsonb,preferences jsonb,ticket_hash text) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
begin
 perform public.gc_validate_preferences(preferences);
 if not exists(select 1 from public.household_members where user_id=actor and household_id=household) then raise exception 'membership required' using errcode='42501'; end if;
 if jsonb_typeof(scopes) is distinct from 'array' or not scopes ? 'https://www.googleapis.com/auth/calendar.app.created' then raise exception 'calendar scope required'; end if;
 delete from app_private.google_calendar_pending_oauth p where p.user_id=actor or p.expires_at<=now();
 insert into app_private.google_calendar_pending_oauth(ticket_hash,user_id,household_id,token_cipher,scopes,preferences) values(ticket_hash,actor,household,token_cipher,scopes,preferences);
end; $$;
create function public.gc_complete_oauth(actor uuid,ticket_hash text) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare p app_private.google_calendar_pending_oauth;
begin
 delete from app_private.google_calendar_pending_oauth s where s.ticket_hash=gc_complete_oauth.ticket_hash and s.user_id=actor and s.expires_at>now() returning * into p;
 if not found then raise exception 'invalid oauth confirmation' using errcode='22023'; end if;
 perform public.gc_finish_oauth(actor,p.household_id,p.token_cipher,p.scopes,p.preferences);
end; $$;
create function public.gc_preferences(actor uuid,preferences jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.google_calendar_connections; t uuid;
begin
 perform public.gc_validate_preferences(preferences);
 update public.google_calendar_connections g set export_household=(preferences->>'exportHousehold')::boolean,export_private=(preferences->>'exportPrivate')::boolean,reminder_minutes=(preferences->>'reminderMinutes')::integer,updated_at=now()
 where user_id=actor and status='connected' and exists(select 1 from public.household_members m where m.household_id=g.household_id and m.user_id=actor) returning * into c;
 if not found then raise exception 'active connection required'; end if;
 for t in select id from public.tasks where household_id=c.household_id and due_at>=now() and status in ('open','in_progress') loop perform public.gc_queue_task(t); end loop;
 for t in select id from public.task_calendar_links where connection_id=c.id loop perform public.gc_enqueue_link(t); end loop;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id) values(c.household_id,actor,'google_calendar.preferences','integration',c.id);
end; $$;
create function public.gc_request_sync(actor uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.google_calendar_connections; t uuid;
begin
 select * into strict c from public.google_calendar_connections g where user_id=actor and status='connected' and exists(select 1 from public.household_members m where m.household_id=g.household_id and m.user_id=actor);
 for t in select id from public.tasks where household_id=c.household_id and due_at>=now() and status in ('open','in_progress') loop perform public.gc_queue_task(t); end loop;
 for t in select id from public.task_calendar_links where connection_id=c.id loop perform public.gc_enqueue_link(t); end loop;
end; $$;
create function public.gc_disconnect(actor uuid,remove_events boolean) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; link_id uuid;
begin
 select * into c from public.google_calendar_connections where user_id=actor for update;
 if not found then return jsonb_build_object('connection',null); end if;
 update public.google_calendar_connections set status='disconnecting',updated_at=now() where id=c.id;
 delete from app_private.google_calendar_oauth_states where user_id=actor;
 delete from app_private.google_calendar_pending_oauth where user_id=actor;
 if remove_events then
  for link_id in select id from public.task_calendar_links where connection_id=c.id and sync_status<>'deleted' loop perform public.gc_enqueue_link(link_id); end loop;
 else
  update public.outbox_events set processed_at=now(),gc_terminal=false,gc_generation=gc_generation+1 where gc_connection_id=c.id;
 end if;
 insert into public.outbox_events(household_id,topic,payload,deduplication_key,gc_connection_id) values(c.household_id,'google_calendar.revoke','{}',c.id,c.id)
 on conflict(household_id,topic,deduplication_key) do update set processed_at=null,available_at=now(),gc_terminal=false,attempts=0,gc_generation=outbox_events.gc_generation+1;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id) values(c.household_id,actor,'google_calendar.disconnect_requested','integration',c.id);
 return public.gc_status(actor);
end; $$;

-- Payload is built from CURRENT task authorization; deletion jobs never include task text.
create function public.gc_job_payload(job_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; q public.outbox_events; l public.task_calendar_links; t public.tasks; target public.google_calendar_targets; token text; eligible boolean;
begin
 select * into strict q from public.outbox_events where id=job_id;
 select * into strict c from public.google_calendar_connections where id=q.gc_connection_id;
 select token_cipher into token from app_private.google_calendar_credentials where connection_id=c.id;
 if q.topic='google_calendar.revoke' then
  return jsonb_build_object('jobId',q.id,'leaseToken',q.gc_lease_token,'connectionId',c.id,'userId',c.user_id,'householdId',c.household_id,'tokenCipher',token,'action','revoke','task',null,'calendarId',null,'targetKind','household','eventId','grevoke','etag',null,'reminderMinutes',c.reminder_minutes,'attempts',q.attempts,'targetState','missing');
 end if;
 select * into strict l from public.task_calendar_links where id=q.gc_link_id;
 select * into t from public.tasks where id=l.task_id;
 eligible:=t.id is not null and t.household_id=c.household_id and c.status='connected' and t.due_at is not null and t.status<>'cancelled' and t.visibility=l.target_kind
 and exists(select 1 from public.household_members m where m.household_id=c.household_id and m.user_id=c.user_id)
 and ((t.visibility='household' and c.export_household) or (t.visibility='private' and c.export_private and t.owner_user_id=c.user_id));
 select * into target from public.google_calendar_targets where connection_id=c.id and target_kind=l.target_kind;
 return jsonb_build_object('jobId',q.id,'leaseToken',q.gc_lease_token,'connectionId',c.id,'userId',c.user_id,'householdId',c.household_id,'tokenCipher',token,'action',case when eligible then 'upsert' else 'delete' end,
 'task',case when eligible then jsonb_build_object('id',t.id,'title',t.title,'dueAt',t.due_at,'status',t.status,'version',t.version,'visibility',t.visibility) else null end,
 'calendarId',target.calendar_id,'targetKind',l.target_kind,'eventId',l.event_id,'etag',l.etag,'reminderMinutes',c.reminder_minutes,'attempts',q.attempts,'targetState',coalesce(target.state,'missing'));
end; $$;
create function public.gc_claim_jobs(batch_size integer default 10) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
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
create function public.gc_validate_job(job_id uuid,lease_token uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
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
 return public.gc_job_payload(q.id);
end; $$;
create function public.gc_set_target(job_id uuid,lease_token uuid,calendar_id text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.outbox_events; kind public.visibility;
begin
 select o.* into strict q from public.outbox_events o join public.google_calendar_connections c on c.id=o.gc_connection_id
 where o.id=job_id and o.gc_lease_token=lease_token and c.worker_lease=lease_token and c.worker_lease_until>now() for update of o;
 select target_kind into strict kind from public.task_calendar_links where id=q.gc_link_id;
 insert into public.google_calendar_targets(connection_id,target_kind,calendar_id,state) values(q.gc_connection_id,kind,calendar_id,case when calendar_id is null then 'creating' else 'ready' end)
 on conflict(connection_id,target_kind) do update set calendar_id=excluded.calendar_id,state=excluded.state where google_calendar_targets.state='creating';
end; $$;
create function public.gc_update_token(connection_id uuid,token_cipher text,previous_cipher text,job_id uuid,lease_token uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
begin
 update app_private.google_calendar_credentials cred set token_cipher=gc_update_token.token_cipher
 where cred.connection_id=gc_update_token.connection_id and cred.token_cipher=previous_cipher
 and exists(select 1 from public.google_calendar_connections c join public.outbox_events o on o.gc_connection_id=c.id
 where c.id=gc_update_token.connection_id and c.worker_lease=lease_token and c.worker_lease_until>now()
 and o.id=job_id and o.gc_lease_token=lease_token and o.gc_claimed_generation=o.gc_generation and o.processed_at is null);
 if not found then raise exception 'connection credential generation changed' using errcode='40001'; end if;
end; $$;
create function public.gc_finish_job(job_id uuid,lease_token uuid,result jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare q public.outbox_events; state text:=result->>'status'; err text:=result->>'errorCode';
begin
 if state is null or state not in ('synced','deleted','retry','reconnect','failed') or jsonb_typeof(result)<>'object' or (err is not null and err!~'^[a-zA-Z0-9_:-]{1,80}$')
 or exists(select 1 from jsonb_object_keys(result) k where k not in ('status','etag','errorCode')) or (result ? 'etag' and jsonb_typeof(result->'etag') not in ('null','string')) then raise exception 'invalid worker result'; end if;
 select o.* into strict q from public.outbox_events o join public.google_calendar_connections c on c.id=o.gc_connection_id
 where o.id=job_id and o.gc_lease_token=lease_token and c.worker_lease=lease_token and c.worker_lease_until>now() for update of o;
 -- A confirmed remote deletion tombstones the old ID even when superseded locally.
 if (state='deleted' or (state='retry' and err='remote_event_deleted')) and q.gc_link_id is not null then
  update public.task_calendar_links set projection_epoch=projection_epoch+1,event_id='g'||md5(gen_random_uuid()::text),etag=null where id=q.gc_link_id;
 end if;
 if q.gc_generation<>q.gc_claimed_generation then
  update public.outbox_events set locked_at=null,gc_lease_token=null,available_at=now() where id=q.id;
 else
  update public.outbox_events set processed_at=case when state in ('synced','deleted') then now() else null end,locked_at=null,gc_lease_token=null,
   gc_terminal=(state='failed' or (state='retry' and attempts>=8) or (state='reconnect' and exists(select 1 from public.google_calendar_connections c where c.id=q.gc_connection_id and c.status='disconnecting'))),available_at=case when state='retry' then now()+make_interval(secs=>least(3600,power(2,least(attempts,11))::integer*15+floor(random()*15)::integer)) else now() end where id=q.id;
  if q.gc_link_id is not null then update public.task_calendar_links set last_checked_at=now(),sync_status=case when state='synced' then 'synced' when state='deleted' then 'deleted' when state='failed' or (state='retry' and q.attempts>=8) then 'failed' else 'pending' end,
   etag=coalesce(result->>'etag',etag),error_code=err,synced_version=case when state='synced' then (select version from public.tasks where id=task_calendar_links.task_id) else synced_version end where id=q.gc_link_id; end if;
  if q.topic='google_calendar.revoke' and state in ('synced','deleted') then delete from app_private.google_calendar_credentials where connection_id=q.gc_connection_id; update public.google_calendar_connections set status='disconnected' where id=q.gc_connection_id; end if;
 end if;
 update public.google_calendar_connections set worker_lease=null,worker_lease_until=null,last_synced_at=case when state in ('synced','deleted') then now() else last_synced_at end,
 status=case when state='reconnect' and status<>'disconnecting' then 'reconnect' else status end where id=q.gc_connection_id;
end; $$;
create function public.gc_membership_removed() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.gc_disconnect(old.user_id,true); return null; end; $$;
create trigger household_members_google_calendar_removed after delete on public.household_members for each row execute function public.gc_membership_removed();
create function public.gc_repair_targets(actor uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.google_calendar_connections; kind public.visibility; link_id uuid;
begin
 select g.* into strict c from public.google_calendar_connections g where g.user_id=actor and g.status='connected'
 and exists(select 1 from public.household_members m where m.household_id=g.household_id and m.user_id=actor) for update;
 if c.last_repair_at>now()-interval '2 minutes' then raise exception 'repair rate limited' using errcode='54000'; end if;
 if c.worker_lease_until>now() then raise exception 'calendar worker busy' using errcode='40001'; end if;
 for kind in delete from public.google_calendar_targets t where t.connection_id=c.id and
 ((t.state='creating' and t.calendar_id is null) or (t.state='ready' and exists(select 1 from public.task_calendar_links l where l.connection_id=t.connection_id and l.target_kind=t.target_kind and l.sync_status='failed' and l.error_code='remote_calendar_deleted'))) returning t.target_kind
 loop
  update public.task_calendar_links set projection_epoch=projection_epoch+1,event_id='g'||md5(gen_random_uuid()::text),etag=null where connection_id=c.id and target_kind=kind;
  for link_id in select id from public.task_calendar_links where connection_id=c.id and target_kind=kind loop perform public.gc_enqueue_link(link_id); end loop;
 end loop;
 update public.google_calendar_connections set last_repair_at=now() where id=c.id;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id) values(c.household_id,actor,'google_calendar.targets_repaired','integration',c.id);
end; $$;
-- Remove explicit default grants as well as PUBLIC execution.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,3)='gc_'
 loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature); end loop;
end; $$;

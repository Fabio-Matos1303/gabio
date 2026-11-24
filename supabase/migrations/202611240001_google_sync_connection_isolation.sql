-- Keep cleanup ordering within each personal Google connection.
-- A disconnected account must not block another authorized connection.
begin;
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
   and not exists(select 1 from public.task_calendar_links current_link join public.task_calendar_links old_link on old_link.task_id=current_link.task_id and old_link.connection_id=current_link.connection_id join public.outbox_events cleanup on cleanup.gc_link_id=old_link.id where current_link.id=o.gc_link_id and public.gc_job_payload(o.id)->>'action'='upsert' and cleanup.processed_at is null and public.gc_job_payload(cleanup.id)->>'action'='delete')
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
commit;

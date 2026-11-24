-- Read-only diagnostics. Do not select titles, IDs, token values or event content.
begin read only;

select c.status as connection_status, l.provider, l.sync_status, l.error_code,
  l.synced_version=t.version as current_version,
  t.completed_at<now()-interval '5 minutes' as completed_over_five_minutes_ago,
  count(*) as completed_projections
from public.task_calendar_links l
join public.tasks t on t.id=l.task_id
join public.google_calendar_connections c on c.id=l.connection_id
where t.status='completed'
group by c.status,l.provider,l.sync_status,l.error_code,current_version,completed_over_five_minutes_ago;

select c.status as connection_status,l.provider,o.attempts,o.gc_terminal,
  count(*) as pending,min(o.available_at) as earliest_available_at
from public.outbox_events o
join public.google_calendar_connections c on c.id=o.gc_connection_id
left join public.task_calendar_links l on l.id=o.gc_link_id
where o.processed_at is null
group by c.status,l.provider,o.attempts,o.gc_terminal;

select c.status as connection_status,b.claims,
  extract(epoch from now()-c.read_claimed_at)::integer as seconds_since_last_read
from app_private.google_read_budget b
join public.google_calendar_connections c on c.user_id=b.user_id
where b.day=current_date;

rollback;

-- Read-only operational diagnostics. Run with authorized operator access.
-- Do not select cron command text, HTTP bodies, Vault values, user IDs or user content.
begin read only;

select jobid, schedule, active
from cron.job where jobname = 'gabio-google-calendar-worker';

select d.status, count(*) as executions, max(d.end_time) as last_finished_at
from cron.job_run_details d
join cron.job j using (jobid)
where j.jobname = 'gabio-google-calendar-worker'
  and d.start_time > now() - interval '24 hours'
group by d.status;

-- A successful cron run only proves HTTP dispatch, not a successful worker call.
select status_code, timed_out, count(*) as responses
from net._http_response
where created > now() - interval '1 hour'
group by status_code, timed_out;

select name, count(*) as configured
from vault.secrets
where name in ('gabio_google_calendar_project_url', 'gabio_google_calendar_worker_secret')
group by name;

select gc_terminal, count(*) as pending, min(available_at) as earliest_available_at
from public.outbox_events
where gc_connection_id is not null and processed_at is null
group by gc_terminal;

select provider, sync_status, error_code, count(*) as projections
from public.task_calendar_links
group by provider, sync_status, error_code;

select status, new_task_destination,
  scopes ? 'https://www.googleapis.com/auth/tasks' as tasks_write_authorized,
  count(*) as connections
from public.google_calendar_connections
group by status, new_task_destination, tasks_write_authorized;

select activated_at is not null as tasks_routing_active
from app_private.google_export_settings where singleton;

rollback;

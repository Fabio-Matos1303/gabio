-- Run only after the reviewed migration/functions and internal secrets are configured.
-- Values are provisioned into Vault by the deployment process, never committed here.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'gabio-google-calendar-worker',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := project.decrypted_secret || '/functions/v1/google-calendar-worker',
    headers := jsonb_build_object('Authorization','Bearer ' || worker.decrypted_secret,'Content-Type','application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  from vault.decrypted_secrets project
  cross join vault.decrypted_secrets worker
  where project.name='gabio_google_calendar_project_url'
    and worker.name='gabio_google_calendar_worker_secret'
    and exists(select 1 from public.google_calendar_connections where status in ('connected','disconnecting'))
  $job$
);

-- Authorized one-time backlog recovery; preserves the normal two-minute job.
-- Fixed expiry is embedded at scheduling time. Never embed credential values.
begin;
select cron.schedule(
  'gabio-google-sync-catchup',
  '5 seconds',
  format($job$
  do $run$
  begin
    if clock_timestamp() >= %L::timestamptz or not exists (
      select 1 from public.outbox_events o
      join public.google_calendar_connections c on c.id=o.gc_connection_id
      where c.status='connected' and o.processed_at is null
        and not o.gc_terminal and o.available_at<=clock_timestamp()
    ) then
      perform cron.unschedule('gabio-google-sync-catchup');
      return;
    end if;
    perform net.http_post(
      url := project.decrypted_secret || '/functions/v1/google-calendar-worker',
      headers := jsonb_build_object('Authorization','Bearer ' || worker.decrypted_secret,'Content-Type','application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    )
    from vault.decrypted_secrets project
    cross join vault.decrypted_secrets worker
    where project.name='gabio_google_calendar_project_url'
      and worker.name='gabio_google_calendar_worker_secret';
  end $run$;
  $job$, clock_timestamp()+interval '15 minutes')
);
commit;

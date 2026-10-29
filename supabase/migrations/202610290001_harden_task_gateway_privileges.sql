-- Some hosted projects retain explicit default grants to anon even after PUBLIC is revoked.
-- The function still checks auth.uid(); remove the redundant anonymous entry point.
revoke all on function public.execute_task_command(uuid, jsonb) from public, anon;
grant execute on function public.execute_task_command(uuid, jsonb) to authenticated;

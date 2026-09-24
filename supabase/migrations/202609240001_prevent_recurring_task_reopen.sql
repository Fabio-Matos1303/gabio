create or replace function public.prevent_recurring_task_reopen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'completed'
    and old.recurrence <> 'none'
    and new.status = 'open'
  then
    raise exception 'completed recurring tasks cannot be reopened'
      using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_recurring_task_reopen on public.tasks;
create trigger prevent_recurring_task_reopen
before update of status on public.tasks
for each row execute function public.prevent_recurring_task_reopen();

revoke all on function public.prevent_recurring_task_reopen() from public;

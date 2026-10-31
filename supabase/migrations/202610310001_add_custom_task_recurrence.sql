-- Commit the enum value before functions and constraints use it.
alter type public.task_recurrence add value if not exists 'custom';

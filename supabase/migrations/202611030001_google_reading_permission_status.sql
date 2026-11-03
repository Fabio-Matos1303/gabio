-- Permission metadata only: no credentials, annotations or Google item content.
begin;
create function public.gc_read_permission_status(actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections;
begin
 select * into c from public.google_calendar_connections g
 where g.user_id=actor and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=g.household_id);
 if c.id is null or c.status='disconnected' then return jsonb_build_object('state','not_authorized'); end if;
 if c.status='disconnecting' then return jsonb_build_object('state','disconnecting'); end if;
 if c.status='reconnect' then return jsonb_build_object('state','reconnect'); end if;
 if jsonb_typeof(c.scopes) is distinct from 'array' or not (c.scopes ?& array['https://www.googleapis.com/auth/tasks.readonly','https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly']) then
  return jsonb_build_object('state','not_authorized');
 end if;
 if not exists(select 1 from app_private.google_calendar_credentials cred where cred.connection_id=c.id) then return jsonb_build_object('state','reconnect'); end if;
 return jsonb_build_object('state','authorized');
end; $$;
revoke all on function public.gc_read_permission_status(uuid) from public,anon,authenticated;
grant execute on function public.gc_read_permission_status(uuid) to service_role;
commit;

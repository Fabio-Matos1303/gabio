alter table public.google_calendar_connections add column read_generation uuid not null default extensions.gen_random_uuid(), add column read_claimed_at timestamptz;
create table public.external_task_tags (
 connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
 generation uuid not null, list_id text not null check(length(list_id) between 1 and 1024),
 task_id text not null check(length(task_id) between 1 and 1024),
 tags jsonb not null check(jsonb_typeof(tags)='array' and jsonb_array_length(tags)<=10),
 primary key(connection_id,generation,list_id,task_id)
);
alter table public.external_task_tags enable row level security;
revoke all on public.external_task_tags from public,anon,authenticated;
grant select on public.external_task_tags to authenticated;
create policy external_task_tags_owner on public.external_task_tags for select to authenticated using (
 exists(select 1 from public.google_calendar_connections c where c.id=connection_id and c.user_id=auth.uid() and c.status='connected' and c.read_generation=generation
 and public.is_household_member(c.household_id))
);
create table app_private.google_read_budget(user_id uuid not null references auth.users(id) on delete cascade,day date not null,claims integer not null check(claims between 0 and 120),primary key(user_id,day));
alter table app_private.google_read_budget enable row level security;
revoke all on app_private.google_read_budget from public,anon,authenticated;

create function public.gc_rotate_read_generation() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 new.read_generation:=extensions.gen_random_uuid();new.read_claimed_at:=null;
 delete from public.external_task_tags where connection_id=new.id;
 return new;
end; $$;
revoke all on function public.gc_rotate_read_generation() from public,anon,authenticated;
create trigger gc_new_read_generation before update of scopes on public.google_calendar_connections for each row execute function public.gc_rotate_read_generation();
create trigger gc_end_read_generation before update of status on public.google_calendar_connections for each row when(new.status<>'connected') execute function public.gc_rotate_read_generation();

create or replace function public.gc_validate_preferences(preferences jsonb) returns void language plpgsql set search_path=pg_catalog,public as $$
begin
 if jsonb_typeof(preferences) is distinct from 'object'
 or exists(select 1 from jsonb_object_keys(preferences) k where k not in ('exportHousehold','exportPrivate','reminderMinutes','importUpcoming','readSources'))
 or jsonb_typeof(preferences->'exportHousehold') is distinct from 'boolean' or jsonb_typeof(preferences->'exportPrivate') is distinct from 'boolean'
 or (preferences ? 'importUpcoming' and jsonb_typeof(preferences->'importUpcoming') is distinct from 'boolean')
 or (preferences ? 'readSources' and jsonb_typeof(preferences->'readSources') is distinct from 'boolean')
 or not(preferences ? 'reminderMinutes')
 or (preferences->'reminderMinutes'<>'null'::jsonb and (jsonb_typeof(preferences->'reminderMinutes')<>'number' or (preferences->>'reminderMinutes')!~'^[0-9]+$' or (preferences->>'reminderMinutes')::numeric>10080))
 then raise exception 'invalid calendar preferences' using errcode='22023';end if;
end; $$;

-- Service-only; authentication is resolved by Edge Function, never from browser payload.
create function public.gc_read_context(actor uuid,claim boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare c public.google_calendar_connections; token text; links jsonb; annotations jsonb; budget integer;
begin
 select * into c from public.google_calendar_connections g where g.user_id=actor
 and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=g.household_id) for update;
 if c.id is null then return jsonb_build_object('state','consent_required'); end if;
 if c.status<>'connected' then return jsonb_build_object('state','reconnect');end if;
 if not(c.scopes ?& array['https://www.googleapis.com/auth/tasks.readonly','https://www.googleapis.com/auth/calendar.events.readonly','https://www.googleapis.com/auth/calendar.calendarlist.readonly']) then return jsonb_build_object('state','consent_required');end if;
 if claim then
  if c.read_claimed_at>now()-interval '60 seconds' then return jsonb_build_object('state','rate_limited','generation',c.read_generation);end if;
  insert into app_private.google_read_budget values(actor,current_date,0) on conflict do nothing;
  update app_private.google_read_budget b set claims=claims+1 where b.user_id=actor and b.day=current_date and b.claims<120 returning claims into budget;
  if budget is null then return jsonb_build_object('state','rate_limited','generation',c.read_generation);end if;
  update public.google_calendar_connections set read_claimed_at=now() where id=c.id;
 end if;
 select token_cipher into token from app_private.google_calendar_credentials where connection_id=c.id;
 if token is null then return jsonb_build_object('state','reconnect');end if;
 select coalesce(jsonb_agg(jsonb_build_object('calendarId',t.calendar_id,'eventId',l.event_id)),'[]'::jsonb) into links
 from public.task_calendar_links l join public.google_calendar_targets t on t.connection_id=l.connection_id and t.target_kind=l.target_kind
 where l.connection_id=c.id and t.calendar_id is not null;
 select coalesce(jsonb_agg(jsonb_build_object('listId',list_id,'taskId',task_id,'tags',tags)),'[]'::jsonb) into annotations
 from public.external_task_tags where connection_id=c.id and generation=c.read_generation;
 return jsonb_build_object('state','connected','connectionId',c.id,'generation',c.read_generation,'userId',c.user_id,'householdId',c.household_id,'tokenCipher',token,'links',links,'annotations',annotations);
end; $$;
revoke all on function public.gc_read_context(uuid,boolean) from public,anon,authenticated;
grant execute on function public.gc_read_context(uuid,boolean) to service_role;

create function public.gc_read_update_token(actor uuid,generation uuid,previous_cipher text,token_cipher text) returns boolean language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare changed integer;
begin
 update app_private.google_calendar_credentials cred set token_cipher=gc_read_update_token.token_cipher
 from public.google_calendar_connections c where c.id=cred.connection_id and c.user_id=actor and c.read_generation=generation and c.status='connected'
 and cred.token_cipher=previous_cipher and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=c.household_id);
 get diagnostics changed=row_count;return changed=1;
end; $$;
revoke all on function public.gc_read_update_token(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gc_read_update_token(uuid,uuid,text,text) to service_role;

create function public.gc_save_external_tags(actor uuid,command_id uuid,generation uuid,list_id text,task_id text,tags jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare c public.google_calendar_connections; r public.tag_command_receipts; h bytea; n jsonb; name text; normalized jsonb:='[]';seen text[]:='{}';
begin
 select * into c from public.google_calendar_connections x where x.user_id=actor and x.read_generation=generation and x.status='connected'
 and x.scopes ? 'https://www.googleapis.com/auth/tasks.readonly'
 and exists(select 1 from public.household_members m where m.user_id=actor and m.household_id=x.household_id) for update;
 if c.id is null then raise exception 'connection unavailable' using errcode='42501'; end if;
 if command_id is null or list_id is null or task_id is null or length(list_id) not between 1 and 1024 or length(task_id) not between 1 and 1024 or jsonb_typeof(tags) is distinct from 'array' or jsonb_array_length(tags)>10 then raise exception 'invalid external tags' using errcode='22023';end if;
 for n in select value from jsonb_array_elements(tags) loop
  if jsonb_typeof(n) is distinct from 'string' then raise exception 'invalid external tags' using errcode='22023';end if;
  name:=regexp_replace(trim(n#>>'{}'),'\s+',' ','g');
  if length(name) not between 1 and 32 or lower(name)=any(seen) then raise exception 'invalid external tags' using errcode='22023';end if;
  seen:=array_append(seen,lower(name));normalized:=normalized||jsonb_build_array(name);
 end loop;
 h:=extensions.digest(jsonb_build_object('generation',generation,'list',list_id,'task',task_id,'tags',tags)::text,'sha256');
 insert into public.tag_command_receipts values(actor,command_id,c.household_id,h,null) on conflict do nothing;
 select * into r from public.tag_command_receipts x where x.actor_user_id=actor and x.command_id=gc_save_external_tags.command_id for update;
 if r.household_id<>c.household_id or r.payload_hash<>h then raise exception 'idempotency conflict' using errcode='22023';end if;
 if r.response is not null then return;end if;
 insert into public.external_task_tags values(c.id,generation,list_id,task_id,normalized)
 on conflict on constraint external_task_tags_pkey do update set tags=excluded.tags;
 insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(c.household_id,actor,'external_task.tags','integration',c.id,jsonb_build_object('command_id',command_id));
 update public.tag_command_receipts x set response='{"ok":true}' where x.actor_user_id=actor and x.command_id=gc_save_external_tags.command_id;
end; $$;
revoke all on function public.gc_save_external_tags(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.gc_save_external_tags(uuid,uuid,uuid,text,text,jsonb) to service_role;

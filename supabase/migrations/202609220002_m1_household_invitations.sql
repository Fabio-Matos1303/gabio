create unique index household_members_one_household_per_user_idx
on public.household_members (user_id);

create or replace function public.enforce_household_member_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1 from public.households where id = new.household_id for update;
  if (
    select count(*) from public.household_members
    where household_id = new.household_id
  ) >= 2 then
    raise exception 'household member limit reached' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger household_members_enforce_limit
before insert on public.household_members
for each row execute procedure public.enforce_household_member_limit();

create or replace function public.create_initial_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_household_id uuid;
  new_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if household_name is null or char_length(trim(household_name)) not between 1 and 120 then
    raise exception 'invalid household name' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select household_id into existing_household_id
  from public.household_members
  where user_id = auth.uid();
  if existing_household_id is not null then
    return existing_household_id;
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), 'Novo usuário')
  on conflict (id) do nothing;

  insert into public.households (name, created_by)
  values (trim(household_name), auth.uid())
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, auth.uid(), 'owner');

  insert into public.audit_log (
    household_id, actor_user_id, action, resource_type, resource_id
  ) values (
    new_household_id,
    auth.uid(),
    'household.created',
    'household',
    new_household_id
  );

  return new_household_id;
end;
$$;

create or replace function public.update_own_profile(
  new_display_name text,
  new_timezone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if new_display_name is null or char_length(trim(new_display_name)) not between 1 and 120 then
    raise exception 'invalid display name' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = new_timezone) then
    raise exception 'invalid timezone' using errcode = '22023';
  end if;

  update public.profiles
  set display_name = trim(new_display_name), timezone = new_timezone, updated_at = now()
  where id = auth.uid();
end;
$$;

create or replace function public.get_my_household_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', household.id,
    'name', household.name,
    'role', current_member.role,
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', member.user_id,
          'displayName', profile.display_name,
          'role', member.role
        ) order by member.joined_at
      )
      from public.household_members member
      join public.profiles profile on profile.id = member.user_id
      where member.household_id = household.id
    ), '[]'::jsonb)
  )
  from public.household_members current_member
  join public.households household on household.id = current_member.household_id
  where current_member.user_id = auth.uid();
$$;

revoke update on table public.profiles from authenticated;
revoke insert, update, delete on table public.households from authenticated;
revoke insert, update, delete on table public.household_members from authenticated;
drop policy if exists "profiles_update_self" on public.profiles;
revoke all on function public.update_own_profile(text, text) from public;
revoke all on function public.get_my_household_context() from public;
grant execute on function public.update_own_profile(text, text) to authenticated;
grant execute on function public.get_my_household_context() to authenticated;

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  invited_email text not null check (
    invited_email = lower(trim(invited_email))
    and char_length(invited_email) between 3 and 254
    and invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  token_hash bytea not null unique,
  invited_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitation_expiry_after_creation check (expires_at > created_at),
  constraint invitation_acceptance_complete check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  ),
  constraint invitation_not_accepted_and_revoked check (
    accepted_at is null or revoked_at is null
  )
);

create index household_invitations_active_idx
on public.household_invitations (household_id, expires_at)
where accepted_at is null and revoked_at is null;

alter table public.household_invitations enable row level security;

create or replace function public.create_household_invitation(
  target_household_id uuid,
  invite_email text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_email text := lower(trim(invite_email));
  invitation_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if normalized_email is null
    or char_length(normalized_email) not between 3 and 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'invalid invitation email' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'only a household owner can invite members' using errcode = '42501';
  end if;
  if (
    select count(*) from public.household_members
    where household_id = target_household_id
  ) >= 2 then
    raise exception 'household member limit reached' using errcode = '54000';
  end if;
  if exists (
    select 1
    from auth.users
    join public.household_members on household_members.user_id = auth.users.id
    where lower(auth.users.email) = normalized_email
  ) then
    raise exception 'email already belongs to a household member' using errcode = '23505';
  end if;
  if (
    select count(*)
    from public.household_invitations
    where household_id = target_household_id
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
  ) >= 5 then
    raise exception 'too many active invitations' using errcode = '54000';
  end if;

  update public.household_invitations
  set expires_at = now()
  where household_id = target_household_id
    and invited_email = normalized_email
    and accepted_at is null
    and revoked_at is null
    and expires_at > now();

  insert into public.household_invitations (
    household_id,
    invited_email,
    token_hash,
    invited_by,
    expires_at
  ) values (
    target_household_id,
    normalized_email,
    extensions.digest(invitation_token, 'sha256'),
    auth.uid(),
    now() + interval '24 hours'
  );

  insert into public.audit_log (
    household_id,
    actor_user_id,
    action,
    resource_type,
    metadata
  ) values (
    target_household_id,
    auth.uid(),
    'household.invitation.created',
    'household_invitation',
    jsonb_build_object('expires_in_hours', 24)
  );

  return invitation_token;
end;
$$;

create or replace function public.revoke_household_invitation(invitation_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  invitation public.household_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if invitation_token is null or invitation_token !~ '^[a-f0-9]{64}$' then
    raise exception 'invitation unavailable' using errcode = '22023';
  end if;

  select * into invitation
  from public.household_invitations
  where token_hash = extensions.digest(invitation_token, 'sha256')
  for update;

  if invitation.id is null or invitation.accepted_at is not null then
    raise exception 'invitation unavailable' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.household_members
    where household_id = invitation.household_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'operation not allowed' using errcode = '42501';
  end if;

  update public.household_invitations
  set revoked_at = coalesce(revoked_at, now()), expires_at = least(expires_at, now())
  where id = invitation.id;

  insert into public.audit_log (
    household_id, actor_user_id, action, resource_type, resource_id
  ) values (
    invitation.household_id,
    auth.uid(),
    'household.invitation.revoked',
    'household_invitation',
    invitation.id
  );

  return true;
end;
$$;

create or replace function public.accept_household_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  invitation public.household_invitations%rowtype;
  authenticated_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if invitation_token is null or invitation_token !~ '^[a-f0-9]{64}$' then
    raise exception 'invitation unavailable' using errcode = '22023';
  end if;

  select lower(email) into authenticated_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;

  select * into invitation
  from public.household_invitations
  where token_hash = extensions.digest(invitation_token, 'sha256')
  for update;

  if invitation.id is null then
    raise exception 'invitation unavailable' using errcode = 'P0002';
  end if;
  if invitation.accepted_by = auth.uid() then
    return invitation.household_id;
  end if;
  if invitation.accepted_at is not null then
    raise exception 'invitation unavailable' using errcode = '23505';
  end if;
  if invitation.expires_at <= now() or invitation.revoked_at is not null then
    raise exception 'invitation unavailable' using errcode = '22023';
  end if;
  if authenticated_email is null or authenticated_email <> invitation.invited_email then
    raise exception 'invitation unavailable' using errcode = '42501';
  end if;

  perform 1 from public.households where id = invitation.household_id for update;
  if (
    select count(*) from public.household_members
    where household_id = invitation.household_id
  ) >= 2 then
    raise exception 'household member limit reached' using errcode = '54000';
  end if;
  if exists (
    select 1 from public.household_members where user_id = auth.uid()
  ) then
    raise exception 'user already belongs to a household' using errcode = '23505';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), 'Novo usuário')
  on conflict (id) do nothing;

  insert into public.household_members (household_id, user_id, role)
  values (invitation.household_id, auth.uid(), 'member');

  update public.household_invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = invitation.id;

  insert into public.audit_log (
    household_id,
    actor_user_id,
    action,
    resource_type,
    resource_id
  ) values (
    invitation.household_id,
    auth.uid(),
    'household.invitation.accepted',
    'household_invitation',
    invitation.id
  );

  return invitation.household_id;
end;
$$;

revoke all on table public.household_invitations from anon, authenticated;
revoke all on function public.create_household_invitation(uuid, text) from public;
revoke all on function public.revoke_household_invitation(text) from public;
revoke all on function public.accept_household_invitation(text) from public;
grant execute on function public.create_household_invitation(uuid, text) to authenticated;
grant execute on function public.revoke_household_invitation(text) to authenticated;
grant execute on function public.accept_household_invitation(text) to authenticated;

comment on table public.household_invitations is 'Server-mediated, single-use household invitations; plaintext tokens are never stored.';

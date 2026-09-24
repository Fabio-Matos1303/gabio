create or replace function public.request_household_invitation(
  target_household_id uuid,
  invite_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_email text := lower(trim(invite_email));
  new_invitation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if normalized_email is null
    or char_length(normalized_email) not between 3 and 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'invitation unavailable' using errcode = '22023';
  end if;

  perform 1 from public.households where id = target_household_id for update;
  if not exists (
    select 1 from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'operation not allowed' using errcode = '42501';
  end if;
  if (
    select count(*) from public.household_members
    where household_id = target_household_id
  ) >= 2 then
    raise exception 'invitation unavailable' using errcode = '54000';
  end if;

  -- Rate limits count every attempt, not only active invitations.
  if exists (
    select 1 from public.household_invitations
    where household_id = target_household_id
      and invited_email = normalized_email
      and created_at > now() - interval '5 minutes'
  ) or (
    select count(*) from public.household_invitations
    where household_id = target_household_id
      and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'invitation temporarily unavailable' using errcode = '54000';
  end if;

  update public.household_invitations
  set revoked_at = coalesce(revoked_at, now())
  where household_id = target_household_id
    and invited_email = normalized_email
    and accepted_at is null
    and revoked_at is null;

  if (
    select count(*) from public.household_invitations
    where household_id = target_household_id
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
  ) >= 5 then
    raise exception 'invitation temporarily unavailable' using errcode = '54000';
  end if;

  insert into public.household_invitations (
    household_id,
    invited_email,
    token_hash,
    invited_by,
    expires_at
  ) values (
    target_household_id,
    normalized_email,
    extensions.digest(extensions.gen_random_bytes(32), 'sha256'),
    auth.uid(),
    now() + interval '24 hours'
  ) returning id into new_invitation_id;

  insert into public.audit_log (
    household_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    target_household_id,
    auth.uid(),
    'household.invitation.created',
    'household_invitation',
    new_invitation_id,
    jsonb_build_object('expires_in_hours', 24)
  );

  return new_invitation_id;
end;
$$;

create or replace function public.revoke_household_invitation_by_id(invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.household_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into invitation
  from public.household_invitations
  where id = invitation_id
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
  if invitation.revoked_at is not null then
    return true;
  end if;

  update public.household_invitations
  set revoked_at = now()
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

create or replace function public.accept_pending_household_invitation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.household_invitations%rowtype;
  authenticated_email text;
  existing_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select household_id into existing_household_id
  from public.household_members
  where user_id = auth.uid();
  if existing_household_id is not null then
    return existing_household_id;
  end if;

  select lower(email) into authenticated_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;
  if authenticated_email is null then
    raise exception 'invitation unavailable' using errcode = '42501';
  end if;

  select * into invitation
  from public.household_invitations
  where invited_email = authenticated_email
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if invitation.id is null then
    raise exception 'invitation unavailable' using errcode = 'P0002';
  end if;

  perform 1 from public.households where id = invitation.household_id for update;
  if (
    select count(*) from public.household_members
    where household_id = invitation.household_id
  ) >= 2 then
    raise exception 'invitation unavailable' using errcode = '54000';
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
    household_id, actor_user_id, action, resource_type, resource_id
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

-- Disable the token-based v1 RPCs without rewriting applied migrations.
revoke all on function public.create_household_invitation(uuid, text) from authenticated;
revoke all on function public.revoke_household_invitation(text) from authenticated;
revoke all on function public.accept_household_invitation(text) from authenticated;

revoke all on function public.request_household_invitation(uuid, text) from public;
revoke all on function public.revoke_household_invitation_by_id(uuid) from public;
revoke all on function public.accept_pending_household_invitation() from public;
grant execute on function public.request_household_invitation(uuid, text) to authenticated;
grant execute on function public.revoke_household_invitation_by_id(uuid) to authenticated;
grant execute on function public.accept_pending_household_invitation() to authenticated;

-- Recover correlation only for the authenticated, confirmed recipient.
-- Acceptance still requires the explicit invitation UUID and user confirmation.
create or replace function public.get_my_pending_household_invitation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_email text;
  invitation_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select lower(email) into recipient_email from auth.users
  where id = auth.uid() and email_confirmed_at is not null;
  if recipient_email is null then
    raise exception 'invitation unavailable' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    return null;
  end if;
  select array_agg(id) into invitation_ids from public.household_invitations
  where invited_email = recipient_email and accepted_at is null
    and revoked_at is null and expires_at > now();
  if cardinality(invitation_ids) > 1 then
    raise exception 'use the original invitation link' using errcode = '22023';
  end if;
  return invitation_ids[1];
end;
$$;

revoke all on function public.get_my_pending_household_invitation() from public, anon;
grant execute on function public.get_my_pending_household_invitation() to authenticated;

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
  select household_id into existing_household_id from public.household_members
  where user_id = auth.uid();
  if existing_household_id is not null then
    return existing_household_id;
  end if;
  if exists (
    select 1 from public.household_invitations i
    join auth.users u on lower(u.email) = i.invited_email
    where u.id = auth.uid() and i.accepted_at is null
      and i.revoked_at is null and i.expires_at > now()
  ) then
    raise exception 'accept the pending household invitation first' using errcode = '42501';
  end if;
  insert into public.profiles(id, display_name) values (auth.uid(), 'Novo usuário')
  on conflict (id) do nothing;
  insert into public.households(name, created_by) values (trim(household_name), auth.uid())
  returning id into new_household_id;
  insert into public.household_members(household_id, user_id, role)
  values (new_household_id, auth.uid(), 'owner');
  insert into public.audit_log(household_id, actor_user_id, action, resource_type, resource_id)
  values (new_household_id, auth.uid(), 'household.created', 'household', new_household_id);
  return new_household_id;
end;
$$;
create or replace function public.accept_pending_household_invitation(invitation_id uuid)
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

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select lower(email) into authenticated_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;
  if authenticated_email is null then
    raise exception 'invitation unavailable' using errcode = '42501';
  end if;

  select * into invitation
  from public.household_invitations
  where id = invitation_id
    and invited_email = authenticated_email
  for update;

  if invitation.id is null then
    raise exception 'invitation unavailable' using errcode = 'P0002';
  end if;

  select household_id into existing_household_id
  from public.household_members
  where user_id = auth.uid();
  if existing_household_id is not null then
    if invitation.accepted_by = auth.uid()
      and invitation.household_id = existing_household_id
    then
      return existing_household_id;
    end if;
    raise exception 'invitation unavailable' using errcode = '42501';
  end if;

  if invitation.accepted_at is not null
    or invitation.revoked_at is not null
    or invitation.expires_at <= now()
  then
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

revoke all on function public.accept_pending_household_invitation() from authenticated;
revoke all on function public.accept_pending_household_invitation(uuid) from public;
grant execute on function public.accept_pending_household_invitation(uuid) to authenticated;


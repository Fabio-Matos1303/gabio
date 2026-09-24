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

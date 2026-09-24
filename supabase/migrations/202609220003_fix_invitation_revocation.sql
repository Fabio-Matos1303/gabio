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
  set revoked_at = coalesce(revoked_at, now())
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

revoke all on function public.revoke_household_invitation(text) from public;
grant execute on function public.revoke_household_invitation(text) to authenticated;

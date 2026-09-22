create extension if not exists pgcrypto with schema extensions;

create type public.visibility as enum ('household', 'private');
create type public.member_role as enum ('owner', 'member');
create type public.task_status as enum ('open', 'completed', 'cancelled');
create type public.transaction_direction as enum ('income', 'expense');
create type public.inbox_status as enum (
  'received',
  'awaiting_interpretation',
  'awaiting_confirmation',
  'executed',
  'failed'
);
create type public.input_source as enum ('pwa', 'telegram', 'local-agent', 'scheduler');
create type public.data_sensitivity as enum ('low', 'household', 'private', 'secret');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  timezone text not null default 'America/Bahia',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Novo usuário')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.create_initial_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if char_length(trim(household_name)) not between 1 and 120 then
    raise exception 'invalid household name';
  end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'user already belongs to a household';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), 'Novo usuário')
  on conflict (id) do nothing;

  insert into public.households (name, created_by)
  values (trim(household_name), auth.uid())
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, auth.uid(), 'owner');

  return new_household_id;
end;
$$;

revoke all on function public.create_initial_household(text) from public;
grant execute on function public.create_initial_household(text) to authenticated;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete restrict,
  created_by uuid not null references public.profiles (id),
  assignee_user_id uuid references public.profiles (id) on delete set null,
  visibility public.visibility not null default 'household',
  title text not null check (char_length(title) between 1 and 240),
  status public.task_status not null default 'open',
  due_at timestamptz,
  completed_at timestamptz,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_task_has_owner check (visibility = 'household' or owner_user_id is not null),
  constraint completed_task_has_timestamp check (status <> 'completed' or completed_at is not null),
  unique (household_id, idempotency_key)
);

create index tasks_household_due_idx on public.tasks (household_id, due_at) where status = 'open';

create or replace function public.validate_task_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.household_members
    where household_id = new.household_id and user_id = new.created_by
  ) then
    raise exception 'task creator must be a household member';
  end if;
  if new.owner_user_id is not null and not exists (
    select 1 from public.household_members
    where household_id = new.household_id and user_id = new.owner_user_id
  ) then
    raise exception 'task owner must be a household member';
  end if;
  if new.assignee_user_id is not null and not exists (
    select 1 from public.household_members
    where household_id = new.household_id and user_id = new.assignee_user_id
  ) then
    raise exception 'task assignee must be a household member';
  end if;
  return new;
end;
$$;

create trigger tasks_validate_membership
before insert or update on public.tasks
for each row execute procedure public.validate_task_membership();

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete restrict,
  visibility public.visibility not null default 'household',
  name text not null check (char_length(name) between 1 and 120),
  account_type text not null check (account_type in ('cash', 'checking', 'savings', 'credit_card', 'other')),
  currency_code text not null default 'BRL' check (currency_code ~ '^[A-Z]{3}$'),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_account_has_owner check (visibility = 'household' or owner_user_id is not null),
  unique (id, household_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null,
  created_by uuid not null references public.profiles (id),
  direction public.transaction_direction not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'BRL' check (currency_code ~ '^[A-Z]{3}$'),
  description text not null check (char_length(description) between 1 and 500),
  occurred_on date not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, idempotency_key),
  constraint transactions_account_household_fk
    foreign key (account_id, household_id)
    references public.financial_accounts (id, household_id)
    on delete restrict
);

create index transactions_account_date_idx on public.transactions (account_id, occurred_on desc);

create or replace function public.validate_account_owner_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_user_id is not null and not exists (
    select 1 from public.household_members
    where household_id = new.household_id and user_id = new.owner_user_id
  ) then
    raise exception 'account owner must be a household member';
  end if;
  return new;
end;
$$;

create trigger accounts_validate_owner_membership
before insert or update on public.financial_accounts
for each row execute procedure public.validate_account_owner_membership();

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 240),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Bahia',
  google_event_id text,
  google_etag text,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed', 'cancelled')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_calendar_interval check (starts_at < ends_at),
  unique (household_id, idempotency_key)
);

create index calendar_events_household_interval_idx on public.calendar_events (household_id, starts_at, ends_at);

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  actor_user_id uuid not null references public.profiles (id),
  source public.input_source not null,
  external_id text,
  raw_text text not null check (char_length(raw_text) between 1 and 4000),
  sensitivity public.data_sensitivity not null default 'household',
  status public.inbox_status not null default 'received',
  idempotency_key uuid not null,
  interpretation jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (household_id, idempotency_key)
);

create unique index inbox_external_id_unique_idx
on public.inbox_items (source, external_id)
where external_id is not null;

create table public.audit_log (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  topic text not null,
  payload jsonb not null,
  deduplication_key uuid not null,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, topic, deduplication_key)
);

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.tasks enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.calendar_events enable row level security;
alter table public.inbox_items enable row level security;
alter table public.audit_log enable row level security;
alter table public.outbox_events enable row level security;

create policy "profiles_read_self"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "households_read_member"
on public.households for select to authenticated
using (public.is_household_member(id));

create policy "members_read_household"
on public.household_members for select to authenticated
using (public.is_household_member(household_id));

create policy "tasks_read_visible"
on public.tasks for select to authenticated
using (
  public.is_household_member(household_id)
  and (visibility = 'household' or owner_user_id = auth.uid())
);

create policy "accounts_read_visible"
on public.financial_accounts for select to authenticated
using (
  public.is_household_member(household_id)
  and (visibility = 'household' or owner_user_id = auth.uid())
);

create policy "transactions_read_through_account"
on public.transactions for select to authenticated
using (
  exists (
    select 1
    from public.financial_accounts account
    where account.id = transactions.account_id
      and account.household_id = transactions.household_id
      and public.is_household_member(account.household_id)
      and (account.visibility = 'household' or account.owner_user_id = auth.uid())
  )
);

create policy "calendar_events_read_member"
on public.calendar_events for select to authenticated
using (public.is_household_member(household_id));

create policy "inbox_read_own"
on public.inbox_items for select to authenticated
using (actor_user_id = auth.uid() and public.is_household_member(household_id));

create policy "inbox_insert_own"
on public.inbox_items for insert to authenticated
with check (
  actor_user_id = auth.uid()
  and source = 'pwa'
  and public.is_household_member(household_id)
);

comment on table public.audit_log is 'Append-only server-side audit trail; no authenticated client policy by design.';
comment on table public.outbox_events is 'Server-side integration outbox; no authenticated client policy by design.';
comment on table public.inbox_items is 'Raw input is transient and must be purged after expires_at; secret material must not be intentionally retained.';
comment on table public.tasks is 'Mutations are server-side through the Command Gateway; authenticated clients have read-only access.';
comment on table public.financial_accounts is 'No direct client mutation or deletion; closing an account uses audited archival through the Command Gateway.';

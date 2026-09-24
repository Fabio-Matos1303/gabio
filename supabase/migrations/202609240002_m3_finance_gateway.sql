-- M3 finance: immutable ledger, private/shared resources and confirmed command gateway.
create type public.finance_category_kind as enum ('income', 'expense', 'both');
create type public.finance_recurrence_frequency as enum ('weekly', 'monthly', 'yearly');

alter table public.financial_accounts
  add column created_by uuid references public.profiles (id) on delete restrict,
  add column version integer not null default 1 check (version > 0),
  add column archived_at timestamptz;

update public.financial_accounts
set created_by = coalesce(owner_user_id, (
  select hm.user_id from public.household_members hm
  where hm.household_id = financial_accounts.household_id
  order by (hm.role = 'owner') desc, hm.joined_at limit 1
))
where created_by is null;
alter table public.financial_accounts alter column created_by set not null;

create table public.finance_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  visibility public.visibility not null default 'household',
  name text not null check (char_length(trim(name)) between 1 and 120),
  kind public.finance_category_kind not null default 'both',
  is_archived boolean not null default false,
  archived_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_category_has_owner check (visibility = 'household' or owner_user_id is not null),
  unique (id, household_id)
);

alter table public.transactions
  add column category_id uuid,
  add column owner_user_id uuid references public.profiles (id) on delete restrict,
  add column visibility public.visibility not null default 'household',
  add column status text not null default 'posted' check (status in ('posted', 'reversed')),
  add column reversal_of_id uuid references public.transactions (id) on delete restrict,
  add column installment_plan_id uuid,
  add column installment_number integer check (installment_number is null or installment_number > 0),
  add column recurrence_id uuid,
  add column version integer not null default 1 check (version > 0),
  add constraint private_transaction_has_owner check (visibility = 'household' or owner_user_id is not null),
  add constraint reversal_shape check (
    (reversal_of_id is null and status = 'posted') or
    (reversal_of_id is not null and status = 'posted') or
    (reversal_of_id is null and status = 'reversed')
  );

alter table public.transactions
  add constraint transactions_category_household_fk foreign key (category_id, household_id)
    references public.finance_categories (id, household_id) on delete restrict;
create unique index transactions_one_reversal_idx on public.transactions (reversal_of_id) where reversal_of_id is not null;

create table public.finance_budgets (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  visibility public.visibility not null default 'household',
  category_id uuid not null,
  month date not null check (month = date_trunc('month', month)::date),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'BRL' check (currency_code ~ '^[A-Z]{3}$'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_budget_has_owner check (visibility = 'household' or owner_user_id is not null),
  constraint budgets_category_household_fk foreign key (category_id, household_id)
    references public.finance_categories (id, household_id) on delete restrict,
  unique nulls not distinct (household_id, owner_user_id, visibility, category_id, month)
);

create table public.finance_recurrences (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  visibility public.visibility not null default 'household',
  account_id uuid not null,
  category_id uuid,
  direction public.transaction_direction not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'BRL' check (currency_code ~ '^[A-Z]{3}$'),
  description text not null check (char_length(trim(description)) between 1 and 500),
  frequency public.finance_recurrence_frequency not null,
  next_due_on date not null,
  is_archived boolean not null default false,
  archived_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_recurrence_has_owner check (visibility = 'household' or owner_user_id is not null),
  constraint recurrence_account_fk foreign key (account_id, household_id)
    references public.financial_accounts (id, household_id) on delete restrict,
  constraint recurrence_category_fk foreign key (category_id, household_id)
    references public.finance_categories (id, household_id) on delete restrict,
  unique (id, household_id)
);

create table public.installment_plans (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_user_id uuid references public.profiles (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  visibility public.visibility not null default 'household',
  account_id uuid not null,
  category_id uuid,
  description text not null check (char_length(trim(description)) between 1 and 500),
  total_amount_minor bigint not null check (total_amount_minor > 0),
  installment_count integer not null check (installment_count between 2 and 360),
  currency_code text not null default 'BRL' check (currency_code ~ '^[A-Z]{3}$'),
  
  first_due_on date not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint private_installment_has_owner check (visibility = 'household' or owner_user_id is not null),
  constraint installment_account_fk foreign key (account_id, household_id)
    references public.financial_accounts (id, household_id) on delete restrict,
  constraint installment_category_fk foreign key (category_id, household_id)
    references public.finance_categories (id, household_id) on delete restrict,
  unique (id, household_id)
);

alter table public.transactions
  add constraint transaction_installment_fk foreign key (installment_plan_id, household_id)
    references public.installment_plans (id, household_id) on delete restrict,
  add constraint transaction_recurrence_fk foreign key (recurrence_id, household_id)
    references public.finance_recurrences (id, household_id) on delete restrict;


create table public.finance_command_receipts (
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  command_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  command_hash bytea not null check (octet_length(command_hash) = 32),
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, command_id)
);


create table public.finance_command_proposals (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  household_id uuid not null references public.households (id) on delete cascade,
  canonical_command jsonb not null,
  command_hash bytea not null check (octet_length(command_hash) = 32),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  consumed_by_command_id uuid,
  created_at timestamptz not null default now(),
  constraint proposal_consumption_shape check (consumed_by_command_id is not null)
);
create index finance_command_proposals_actor_expiry_idx
  on public.finance_command_proposals(actor_user_id, expires_at);

alter table public.finance_categories enable row level security;
alter table public.finance_budgets enable row level security;
alter table public.finance_recurrences enable row level security;
alter table public.installment_plans enable row level security;
alter table public.finance_command_receipts enable row level security;
alter table public.finance_command_proposals enable row level security;

create policy categories_read_visible on public.finance_categories for select to authenticated
using (public.is_household_member(household_id) and (visibility = 'household' or owner_user_id = auth.uid()));
create policy budgets_read_visible on public.finance_budgets for select to authenticated
using (public.is_household_member(household_id) and (visibility = 'household' or owner_user_id = auth.uid()));
create policy recurrences_read_visible on public.finance_recurrences for select to authenticated
using (public.is_household_member(household_id) and (visibility = 'household' or owner_user_id = auth.uid()));
create policy installments_read_visible on public.installment_plans for select to authenticated
using (public.is_household_member(household_id) and (visibility = 'household' or owner_user_id = auth.uid()));

drop policy transactions_read_through_account on public.transactions;
create policy transactions_read_visible on public.transactions for select to authenticated
using (
  public.is_household_member(household_id)
  and (visibility = 'household' or owner_user_id = auth.uid())
  and exists (select 1 from public.financial_accounts a where a.id = account_id and a.household_id = transactions.household_id
    and (a.visibility = 'household' or a.owner_user_id = auth.uid()))
);

create or replace function public.validate_finance_membership()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.created_by is not null and not exists (select 1 from public.household_members where household_id=new.household_id and user_id=new.created_by) then
    raise exception 'finance creator must be a household member';
  end if;
  if new.owner_user_id is not null and not exists (select 1 from public.household_members where household_id=new.household_id and user_id=new.owner_user_id) then
    raise exception 'finance owner must be a household member';
  end if;
  return new;
end $$;
create trigger finance_categories_validate before insert or update on public.finance_categories for each row execute function public.validate_finance_membership();
create trigger finance_accounts_validate_creator before insert or update on public.financial_accounts for each row execute function public.validate_finance_membership();
create trigger finance_transactions_validate before insert or update on public.transactions for each row execute function public.validate_finance_membership();
create trigger finance_budgets_validate before insert or update on public.finance_budgets for each row execute function public.validate_finance_membership();
create trigger finance_recurrences_validate before insert or update on public.finance_recurrences for each row execute function public.validate_finance_membership();
create trigger installment_plans_validate before insert or update on public.installment_plans for each row execute function public.validate_finance_membership();

-- Only a compact, closed command surface is exposed. More mutation types are added incrementally.
create or replace function public.execute_finance_command(command_id uuid, command jsonb, confirmation_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  actor_id uuid := auth.uid(); actor_household_id uuid; command_type text; payload jsonb;
  calculated_hash bytea; receipt public.finance_command_receipts%rowtype; result jsonb;
  account_row public.financial_accounts%rowtype; category_row public.finance_categories%rowtype;
  transaction_row public.transactions%rowtype; reversal_row public.transactions%rowtype;
  budget_row public.finance_budgets%rowtype; recurrence_row public.finance_recurrences%rowtype;
  installment_row public.installment_plans%rowtype; target_id uuid; expected_version integer;
  allowed_keys text[]; part_count integer; part_base bigint; part_remainder bigint; part_index integer;
begin
  if actor_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if command_id is null or command is null or jsonb_typeof(command)<>'object'
    or not (command ?& array['type','payload']) or (select count(*) from jsonb_object_keys(command))<>2
    or jsonb_typeof(command->'type')<>'string' or jsonb_typeof(command->'payload')<>'object'
  then raise exception 'invalid finance command' using errcode='22023'; end if;
  command_type := command->>'type'; payload := command->'payload';
  if command_type not in ('create_account','update_account','archive_account','create_category','update_category','archive_category','create_transaction','reverse_transaction','set_budget','create_recurrence','update_recurrence','archive_recurrence','create_installment_plan')
  then raise exception 'invalid finance command' using errcode='22023'; end if;
  select household_id into actor_household_id from public.household_members where user_id=actor_id;
  if actor_household_id is null then raise exception 'operation not allowed' using errcode='42501'; end if;
  calculated_hash := extensions.digest(command::text,'sha256');
  if confirmation_hash is null or confirmation_hash !~ '^[0-9a-f]{64}$' or decode(confirmation_hash,'hex')<>calculated_hash
  then raise exception 'finance confirmation mismatch' using errcode='22023'; end if;
  insert into public.finance_command_receipts(actor_user_id,command_id,household_id,command_hash)
  values(actor_id,command_id,actor_household_id,calculated_hash) on conflict on constraint finance_command_receipts_pkey do nothing;
  select * into receipt from public.finance_command_receipts r where r.actor_user_id=actor_id and r.command_id=execute_finance_command.command_id for update;
  if receipt.household_id<>actor_household_id or receipt.command_hash<>calculated_hash then raise exception 'idempotency conflict' using errcode='22023'; end if;
  if receipt.response is not null then return jsonb_set(receipt.response,'{replayed}','true'::jsonb); end if;

  if command_type='create_account' then
    allowed_keys:=array['name','accountType','currencyCode','visibility'];
    if not (payload ?& array['name','accountType','currencyCode','visibility']) or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys)))
      or jsonb_typeof(payload->'name')<>'string' or char_length(trim(payload->>'name')) not between 1 and 120
      or payload->>'accountType' not in ('cash','checking','savings','credit_card','other') or payload->>'currencyCode' <> 'BRL'
      or payload->>'visibility' not in ('household','private') then raise exception 'invalid finance command' using errcode='22023'; end if;
    insert into public.financial_accounts(household_id,owner_user_id,created_by,visibility,name,account_type,currency_code)
    values(actor_household_id,case when payload->>'visibility'='private' then actor_id else null end,actor_id,(payload->>'visibility')::public.visibility,trim(payload->>'name'),payload->>'accountType',payload->>'currencyCode') returning * into account_row;
    result:=jsonb_build_object('resourceType','account','resourceId',account_row.id,'version',account_row.version);
  elsif command_type in ('update_account','archive_account') then
    allowed_keys:=case when command_type='archive_account' then array['accountId','expectedVersion'] else array['accountId','expectedVersion','name'] end;
    if not(payload ?& array['accountId','expectedVersion']) or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys)))
      or (payload->>'expectedVersion') !~ '^[1-9][0-9]*$' or (command_type='update_account' and (not(payload?'name') or char_length(trim(payload->>'name')) not between 1 and 120))
    then raise exception 'invalid finance command' using errcode='22023'; end if;
    target_id:=(payload->>'accountId')::uuid; expected_version:=(payload->>'expectedVersion')::integer;
    update public.financial_accounts a set name=case when command_type='update_account' then trim(payload->>'name') else a.name end,
      is_archived=case when command_type='archive_account' then true else a.is_archived end, archived_at=case when command_type='archive_account' then now() else a.archived_at end, version=a.version+1,updated_at=now()
    where a.id=target_id and a.household_id=actor_household_id and (a.visibility='household' or a.owner_user_id=actor_id) and a.version=expected_version returning a.* into account_row;
    if account_row.id is null then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    result:=jsonb_build_object('resourceType','account','resourceId',account_row.id,'version',account_row.version);
  elsif command_type='create_category' then
    allowed_keys:=array['name','kind','visibility'];
    if not(payload ?& allowed_keys) or (select count(*) from jsonb_object_keys(payload))<>3 or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys)))
      or char_length(trim(payload->>'name')) not between 1 and 120 or payload->>'kind' not in ('income','expense','both') or payload->>'visibility' not in ('household','private')
    then raise exception 'invalid finance command' using errcode='22023'; end if;
    insert into public.finance_categories(household_id,owner_user_id,created_by,visibility,name,kind)
    values(actor_household_id,case when payload->>'visibility'='private' then actor_id else null end,actor_id,(payload->>'visibility')::public.visibility,trim(payload->>'name'),(payload->>'kind')::public.finance_category_kind) returning * into category_row;
    result:=jsonb_build_object('resourceType','category','resourceId',category_row.id,'version',category_row.version);
  elsif command_type in ('update_category','archive_category') then
    allowed_keys:=case when command_type='archive_category' then array['categoryId','expectedVersion'] else array['categoryId','expectedVersion','name'] end;
    if not(payload ?& array['categoryId','expectedVersion']) or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys)))
      or (payload->>'expectedVersion') !~ '^[1-9][0-9]*$' or (command_type='update_category' and (not(payload?'name') or char_length(trim(payload->>'name')) not between 1 and 120))
    then raise exception 'invalid finance command' using errcode='22023'; end if;
    target_id:=(payload->>'categoryId')::uuid; expected_version:=(payload->>'expectedVersion')::integer;
    update public.finance_categories c set name=case when command_type='update_category' then trim(payload->>'name') else c.name end,
      is_archived=case when command_type='archive_category' then true else c.is_archived end, archived_at=case when command_type='archive_category' then now() else c.archived_at end,version=c.version+1,updated_at=now()
    where c.id=target_id and c.household_id=actor_household_id and (c.visibility='household' or c.owner_user_id=actor_id) and c.version=expected_version returning c.* into category_row;
    if category_row.id is null or (category_row.visibility='private' and payload->>'visibility'<>'private') then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    result:=jsonb_build_object('resourceType','category','resourceId',category_row.id,'version',category_row.version);
  elsif command_type='create_transaction' then
    allowed_keys:=array['accountId','categoryId','direction','amountMinor','currencyCode','description','occurredOn','visibility'];
    if not(payload ?& array['accountId','categoryId','direction','amountMinor','currencyCode','description','occurredOn','visibility']) or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys)))
      or (payload->>'amountMinor') !~ '^[1-9][0-9]*$' or payload->>'direction' not in ('income','expense') or payload->>'currencyCode' <> 'BRL'
      or char_length(trim(payload->>'description')) not between 1 and 500 or payload->>'visibility' not in ('household','private')
    then raise exception 'invalid finance command' using errcode='22023'; end if;
    target_id:=(payload->>'accountId')::uuid;
    select * into account_row from public.financial_accounts a where a.id=target_id and a.household_id=actor_household_id and not a.is_archived
      and (a.visibility='household' or a.owner_user_id=actor_id);
    if account_row.id is null or account_row.visibility::text <> payload->>'visibility' then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    if payload?'categoryId' and payload->'categoryId' <> 'null'::jsonb then select * into category_row from public.finance_categories c where c.id=(payload->>'categoryId')::uuid and c.household_id=actor_household_id and not c.is_archived
      and (c.visibility='household' or c.owner_user_id=actor_id) and c.kind::text in ('both',payload->>'direction');
      if category_row.id is null or (category_row.visibility='private' and payload->>'visibility'<>'private') then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    end if;
    insert into public.transactions(household_id,account_id,category_id,created_by,owner_user_id,visibility,direction,amount_minor,currency_code,description,occurred_on,idempotency_key)
    values(actor_household_id,account_row.id,category_row.id,actor_id,case when payload->>'visibility'='private' then actor_id else null end,(payload->>'visibility')::public.visibility,(payload->>'direction')::public.transaction_direction,(payload->>'amountMinor')::bigint,payload->>'currencyCode',trim(payload->>'description'),(payload->>'occurredOn')::date,extensions.gen_random_uuid()) returning * into transaction_row;
    result:=jsonb_build_object('resourceType','transaction','resourceId',transaction_row.id,'version',transaction_row.version);
  elsif command_type='reverse_transaction' then
    allowed_keys:=array['transactionId','reason'];
    if not(payload ?& allowed_keys) or (select count(*) from jsonb_object_keys(payload))<>2 or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys))) or char_length(trim(payload->>'reason')) not between 1 and 500
    then raise exception 'invalid finance command' using errcode='22023'; end if;
    target_id:=(payload->>'transactionId')::uuid;
    select * into transaction_row from public.transactions t where t.id=target_id and t.household_id=actor_household_id and t.status='posted' and t.reversal_of_id is null and (t.visibility='household' or t.owner_user_id=actor_id) and not exists (select 1 from public.transactions reversal where reversal.reversal_of_id=t.id) for update;
    if transaction_row.id is null then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    insert into public.transactions(household_id,account_id,category_id,created_by,owner_user_id,visibility,direction,amount_minor,currency_code,description,occurred_on,idempotency_key,reversal_of_id)
    values(transaction_row.household_id,transaction_row.account_id,transaction_row.category_id,actor_id,transaction_row.owner_user_id,transaction_row.visibility,
      case transaction_row.direction when 'income' then 'expense'::public.transaction_direction else 'income'::public.transaction_direction end,transaction_row.amount_minor,transaction_row.currency_code,trim(payload->>'reason'),current_date,extensions.gen_random_uuid(),transaction_row.id) returning * into reversal_row;
    result:=jsonb_build_object('resourceType','transaction','resourceId',reversal_row.id,'version',reversal_row.version,'reversalOfId',transaction_row.id);
  elsif command_type='set_budget' then
    allowed_keys:=array['categoryId','month','amountMinor','currencyCode','visibility','expectedVersion'];
    if not(payload ?& array['categoryId','month','amountMinor','currencyCode','visibility']) or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys)))
      or (payload->>'amountMinor') !~ '^[1-9][0-9]*$' or payload->>'currencyCode' <> 'BRL' or payload->>'visibility' not in ('household','private')
    then raise exception 'invalid finance command' using errcode='22023'; end if;
    select * into category_row from public.finance_categories c where c.id=(payload->>'categoryId')::uuid and c.household_id=actor_household_id and not c.is_archived and c.kind in ('expense','both') and (c.visibility='household' or c.owner_user_id=actor_id);
    if category_row.id is null or (category_row.visibility='private' and payload->>'visibility'<>'private') then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    if payload?'expectedVersion' then
      update public.finance_budgets b set amount_minor=(payload->>'amountMinor')::bigint,currency_code=payload->>'currencyCode',version=b.version+1,updated_at=now()
      where b.household_id=actor_household_id and b.category_id=category_row.id and b.month=date_trunc('month',(payload->>'month')::date)::date
        and b.visibility=(payload->>'visibility')::public.visibility and b.owner_user_id is not distinct from (case when payload->>'visibility'='private' then actor_id else null end)
        and b.version=(payload->>'expectedVersion')::integer returning b.* into budget_row;
      if budget_row.id is null then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    else
      insert into public.finance_budgets(household_id,owner_user_id,created_by,visibility,category_id,month,amount_minor,currency_code)
      values(actor_household_id,case when payload->>'visibility'='private' then actor_id else null end,actor_id,(payload->>'visibility')::public.visibility,category_row.id,date_trunc('month',(payload->>'month')::date)::date,(payload->>'amountMinor')::bigint,payload->>'currencyCode') returning * into budget_row;
    end if;
    result:=jsonb_build_object('resourceType','budget','resourceId',budget_row.id,'version',budget_row.version);
  elsif command_type='create_recurrence' then
    allowed_keys:=array['accountId','categoryId','direction','amountMinor','currencyCode','description','frequency','nextDueOn','visibility'];
    if not(payload ?& array['accountId','categoryId','direction','amountMinor','currencyCode','description','frequency','nextDueOn','visibility']) or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys)))
      or (payload->>'amountMinor') !~ '^[1-9][0-9]*$' or payload->>'direction' not in ('income','expense') or payload->>'currencyCode' <> 'BRL' or payload->>'frequency' not in ('weekly','monthly','yearly')
      or char_length(trim(payload->>'description')) not between 1 and 500 or payload->>'visibility' not in ('household','private') then raise exception 'invalid finance command' using errcode='22023'; end if;
    select * into account_row from public.financial_accounts a where a.id=(payload->>'accountId')::uuid and a.household_id=actor_household_id and not a.is_archived and (a.visibility='household' or a.owner_user_id=actor_id);
    if account_row.id is null or account_row.visibility::text <> payload->>'visibility' then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    if payload?'categoryId' and payload->'categoryId' <> 'null'::jsonb then select * into category_row from public.finance_categories c where c.id=(payload->>'categoryId')::uuid and c.household_id=actor_household_id and not c.is_archived and (c.visibility='household' or c.owner_user_id=actor_id); if category_row.id is null or (category_row.visibility='private' and payload->>'visibility'<>'private') then raise exception 'finance conflict or unavailable' using errcode='40001'; end if; end if;
    insert into public.finance_recurrences(household_id,owner_user_id,created_by,visibility,account_id,category_id,direction,amount_minor,currency_code,description,frequency,next_due_on)
    values(actor_household_id,case when payload->>'visibility'='private' then actor_id else null end,actor_id,(payload->>'visibility')::public.visibility,account_row.id,category_row.id,(payload->>'direction')::public.transaction_direction,(payload->>'amountMinor')::bigint,payload->>'currencyCode',trim(payload->>'description'),(payload->>'frequency')::public.finance_recurrence_frequency,(payload->>'nextDueOn')::date) returning * into recurrence_row;
    result:=jsonb_build_object('resourceType','recurrence','resourceId',recurrence_row.id,'version',recurrence_row.version);
  elsif command_type in ('update_recurrence','archive_recurrence') then
    allowed_keys:=case when command_type='archive_recurrence' then array['recurrenceId','expectedVersion'] else array['recurrenceId','expectedVersion','nextDueOn','amountMinor'] end;
    if not(payload ?& array['recurrenceId','expectedVersion']) or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys))) or (payload->>'expectedVersion') !~ '^[1-9][0-9]*$'
      or (command_type='update_recurrence' and not(payload?'nextDueOn') and not(payload?'amountMinor')) then raise exception 'invalid finance command' using errcode='22023'; end if;
    target_id:=(payload->>'recurrenceId')::uuid; expected_version:=(payload->>'expectedVersion')::integer;
    update public.finance_recurrences r set next_due_on=case when payload?'nextDueOn' then (payload->>'nextDueOn')::date else r.next_due_on end,
      amount_minor=case when payload?'amountMinor' then (payload->>'amountMinor')::bigint else r.amount_minor end,is_archived=case when command_type='archive_recurrence' then true else r.is_archived end, archived_at=case when command_type='archive_recurrence' then now() else r.archived_at end,version=r.version+1,updated_at=now()
    where r.id=target_id and r.household_id=actor_household_id and (r.visibility='household' or r.owner_user_id=actor_id) and r.version=expected_version returning r.* into recurrence_row;
    if recurrence_row.id is null then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    result:=jsonb_build_object('resourceType','recurrence','resourceId',recurrence_row.id,'version',recurrence_row.version);
  else
    allowed_keys:=array['accountId','categoryId','description','totalAmountMinor','installmentCount','currencyCode','firstDueOn','visibility'];
    if not(payload ?& array['accountId','categoryId','description','totalAmountMinor','installmentCount','currencyCode','firstDueOn','visibility']) or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys)))
      or (payload->>'totalAmountMinor') !~ '^[1-9][0-9]*$' or (payload->>'installmentCount') !~ '^[1-9][0-9]*$' or (payload->>'installmentCount')::integer not between 2 and 360
      or payload->>'currencyCode' <> 'BRL' or char_length(trim(payload->>'description')) not between 1 and 500 or payload->>'visibility' not in ('household','private') then raise exception 'invalid finance command' using errcode='22023'; end if;
    select * into account_row from public.financial_accounts a where a.id=(payload->>'accountId')::uuid and a.household_id=actor_household_id and not a.is_archived and (a.visibility='household' or a.owner_user_id=actor_id);
    if account_row.id is null or account_row.visibility::text <> payload->>'visibility' then raise exception 'finance conflict or unavailable' using errcode='40001'; end if;
    if payload?'categoryId' and payload->'categoryId' <> 'null'::jsonb then select * into category_row from public.finance_categories c where c.id=(payload->>'categoryId')::uuid and c.household_id=actor_household_id and not c.is_archived and c.kind in ('expense','both') and (c.visibility='household' or c.owner_user_id=actor_id); if category_row.id is null or (category_row.visibility='private' and payload->>'visibility'<>'private') then raise exception 'finance conflict or unavailable' using errcode='40001'; end if; end if;
    insert into public.installment_plans(household_id,owner_user_id,created_by,visibility,account_id,category_id,description,total_amount_minor,installment_count,currency_code,first_due_on)
    values(actor_household_id,case when payload->>'visibility'='private' then actor_id else null end,actor_id,(payload->>'visibility')::public.visibility,account_row.id,category_row.id,trim(payload->>'description'),(payload->>'totalAmountMinor')::bigint,(payload->>'installmentCount')::integer,payload->>'currencyCode',(payload->>'firstDueOn')::date) returning * into installment_row;
    part_count:=installment_row.installment_count; part_base:=installment_row.total_amount_minor/part_count; part_remainder:=installment_row.total_amount_minor%part_count;
    for part_index in 1..part_count loop
      insert into public.transactions(household_id,account_id,category_id,created_by,owner_user_id,visibility,direction,amount_minor,currency_code,description,occurred_on,idempotency_key,installment_plan_id,installment_number)
      values(actor_household_id,account_row.id,category_row.id,actor_id,installment_row.owner_user_id,installment_row.visibility,'expense',part_base+case when part_index<=part_remainder then 1 else 0 end,installment_row.currency_code,installment_row.description,(installment_row.first_due_on+(part_index-1)*interval '1 month')::date,extensions.gen_random_uuid(),installment_row.id,part_index);
    end loop;
    result:=jsonb_build_object('resourceType','installmentPlan','resourceId',installment_row.id,'installmentCount',installment_row.installment_count);
  end if;

  insert into public.audit_log(household_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(actor_household_id,actor_id,'finance.'||command_type,result->>'resourceType',(result->>'resourceId')::uuid,jsonb_build_object('command_id',command_id,'command_hash',encode(calculated_hash,'hex')));
  result:=jsonb_build_object('commandId',command_id,'replayed',false,'result',result);
  update public.finance_command_receipts r set response=result where r.actor_user_id=actor_id and r.command_id=execute_finance_command.command_id;
  return result;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'invalid finance command' using errcode='22023';
end $$;

revoke all on table public.financial_accounts,public.transactions,public.finance_categories,public.finance_budgets,public.finance_recurrences,public.installment_plans from authenticated,anon;
grant select on table public.financial_accounts,public.transactions,public.finance_categories,public.finance_budgets,public.finance_recurrences,public.installment_plans to authenticated;
revoke all on table public.finance_command_receipts from public,authenticated,anon;
revoke all on table public.finance_command_proposals from public,authenticated,anon;
revoke all on function public.execute_finance_command(uuid,jsonb,text) from public;
revoke all on function public.execute_finance_command(uuid,jsonb,text) from authenticated, anon;


comment on table public.transactions is 'Immutable ledger: corrections use reversal entries; no client update or delete.';
comment on table public.finance_command_receipts is 'Server-only confirmed finance command idempotency receipts; no client policy by design.';


create or replace function public.prepare_finance_command(command jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  actor_id uuid := auth.uid(); actor_household_id uuid; command_type text;
  command_hash bytea; proposal_id uuid; expires timestamptz; supplied_command_id uuid; review jsonb;
begin
  if actor_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if command is null or jsonb_typeof(command)<>'object'
    or not(command ?& array['commandId','type','payload'])
    or (select count(*) from jsonb_object_keys(command))<>3
    or jsonb_typeof(command->'commandId')<>'string'
    or jsonb_typeof(command->'type')<>'string'
    or jsonb_typeof(command->'payload')<>'object'
  then raise exception 'invalid finance command' using errcode='22023'; end if;
  supplied_command_id:=(command->>'commandId')::uuid;
  command_type:=command->>'type';
  if command_type not in ('create_account','update_account','archive_account','create_category','update_category','archive_category','create_transaction','reverse_transaction','set_budget','create_recurrence','update_recurrence','archive_recurrence','create_installment_plan')
  then raise exception 'invalid finance command' using errcode='22023'; end if;
  select household_id into actor_household_id from public.household_members where user_id=actor_id;
  if actor_household_id is null then raise exception 'operation not allowed' using errcode='42501'; end if;
  delete from public.finance_command_proposals where actor_user_id=actor_id and consumed_at is null and expires_at<=now();
  if (select count(*) from public.finance_command_proposals where actor_user_id=actor_id and consumed_at is null and expires_at>now()) >= 100
  then raise exception 'too many active finance proposals' using errcode='54000'; end if;
  command:=command-'commandId';
  command_hash:=extensions.digest(command::text,'sha256');
  expires:=now() + interval '10 minutes';
  
  begin
    perform public.execute_finance_command(supplied_command_id,command,encode(command_hash,'hex'));
    raise exception 'finance validation complete' using errcode='P0002';
  exception when sqlstate 'P0002' then null;
  end;
  review:=jsonb_strip_nulls(jsonb_build_object(
    'operation',command_type,
    'description',coalesce(command#>>'{payload,description}',command#>>'{payload,name}',command#>>'{payload,reason}'),
    'accountName',case when command#>>'{payload,accountId}' is not null then (select name from public.financial_accounts where id=(command#>>'{payload,accountId}')::uuid) end,
    'categoryName',case when command#>>'{payload,categoryId}' is not null then (select name from public.finance_categories where id=(command#>>'{payload,categoryId}')::uuid) end,
    'direction',command#>>'{payload,direction}',
    'amountMinor',coalesce(command#>>'{payload,amountMinor}',command#>>'{payload,totalAmountMinor}'),
    'date',coalesce(command#>>'{payload,occurredOn}',command#>>'{payload,nextDueOn}',command#>>'{payload,firstDueOn}',command#>>'{payload,month}'),
    'visibility',command#>>'{payload,visibility}',
    'installmentCount',command#>>'{payload,installmentCount}',
    'targetId',coalesce(command#>>'{payload,accountId}',command#>>'{payload,categoryId}',command#>>'{payload,transactionId}',command#>>'{payload,recurrenceId}'),
    'targetType',case when command_type like '%account' then 'account' when command_type like '%category' then 'category' when command_type like '%recurrence' then 'recurrence' when command_type='reverse_transaction' then 'transaction' end,
    'targetName',case
      when command_type like '%account' and command#>>'{payload,accountId}' is not null then (select name from public.financial_accounts where id=(command#>>'{payload,accountId}')::uuid)
      when command_type like '%category' and command#>>'{payload,categoryId}' is not null then (select name from public.finance_categories where id=(command#>>'{payload,categoryId}')::uuid)
      when command_type like '%recurrence' and command#>>'{payload,recurrenceId}' is not null then (select description from public.finance_recurrences where id=(command#>>'{payload,recurrenceId}')::uuid)
      when command_type='reverse_transaction' then (select description from public.transactions where id=(command#>>'{payload,transactionId}')::uuid) end,
    'originalAccountName',case when command_type='reverse_transaction' then (select a.name from public.transactions t join public.financial_accounts a on a.id=t.account_id where t.id=(command#>>'{payload,transactionId}')::uuid) end,
    'originalDirection',case when command_type='reverse_transaction' then (select direction::text from public.transactions where id=(command#>>'{payload,transactionId}')::uuid) end,
    'originalAmountMinor',case when command_type='reverse_transaction' then (select amount_minor::text from public.transactions where id=(command#>>'{payload,transactionId}')::uuid) end,
    'originalDate',case when command_type='reverse_transaction' then (select occurred_on::text from public.transactions where id=(command#>>'{payload,transactionId}')::uuid) end
  ));
  insert into public.finance_command_proposals(actor_user_id,household_id,canonical_command,command_hash,expires_at,consumed_by_command_id)
  values(actor_id,actor_household_id,command,command_hash,expires,supplied_command_id) returning id into proposal_id;
  return jsonb_build_object(
    'proposalId',proposal_id,'commandId',supplied_command_id,'commandHash',encode(command_hash,'hex'),'expiresAt',expires,
    'summary',left(command_type || coalesce(': ' || (command#>>'{payload,description}'), ': ' || (command#>>'{payload,name}'), ': confirmacao necessaria'),1000),'review',review
  );
exception when invalid_text_representation then
  raise exception 'invalid finance command' using errcode='22023';
end $$;

create or replace function public.confirm_finance_command(command_id uuid, proposal_id uuid, confirmation_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  actor_id uuid:=auth.uid(); proposal public.finance_command_proposals%rowtype; result jsonb;
begin
  if actor_id is null then raise exception 'authentication required' using errcode='28000'; end if;
  if command_id is null or proposal_id is null or confirmation_hash is null or confirmation_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid finance confirmation' using errcode='22023'; end if;
  select * into proposal from public.finance_command_proposals p where p.id=proposal_id for update;
  if proposal.id is null or proposal.actor_user_id<>actor_id
    or proposal.household_id is distinct from (select household_id from public.household_members where user_id=actor_id)
    or proposal.command_hash<>decode(confirmation_hash,'hex')
    or proposal.consumed_by_command_id<>command_id
  then raise exception 'finance confirmation unavailable' using errcode='42501'; end if;
  if proposal.consumed_at is null and proposal.expires_at<=now() then
    raise exception 'finance confirmation expired' using errcode='22023';
  end if;
  result:=public.execute_finance_command(command_id,proposal.canonical_command,confirmation_hash);
  if proposal.consumed_at is null then
    update public.finance_command_proposals set consumed_at=now() where id=proposal.id;
  end if;
  return jsonb_build_object(
    'commandId',command_id,'commandHash',encode(proposal.command_hash,'hex'),
    'replayed',coalesce((result->>'replayed')::boolean,false),
    'affectedIds',jsonb_build_array(result#>>'{result,resourceId}')
  );
end $$;

create or replace function public.reject_finance_ledger_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'finance ledger is append-only' using errcode='55000';
end $$;
create trigger transactions_append_only before update or delete on public.transactions
for each row execute function public.reject_finance_ledger_mutation();

revoke all on function public.prepare_finance_command(jsonb) from public;
revoke all on function public.prepare_finance_command(jsonb) from anon;
revoke all on function public.confirm_finance_command(uuid,uuid,text) from public;
revoke all on function public.confirm_finance_command(uuid,uuid,text) from anon;
grant execute on function public.prepare_finance_command(jsonb) to authenticated;
grant execute on function public.confirm_finance_command(uuid,uuid,text) to authenticated;

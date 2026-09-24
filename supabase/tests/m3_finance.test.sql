begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
 ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000001','authenticated','authenticated','owner-m3@example.test','',now(),now(),now(),'{}','{"display_name":"Owner"}'),
 ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000002','authenticated','authenticated','member-m3@example.test','',now(),now(),now(),'{}','{"display_name":"Member"}'),
 ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000003','authenticated','authenticated','outside-m3@example.test','',now(),now(),now(),'{}','{"display_name":"Outside"}');
insert into public.households (id,name,created_by) values
 ('92000000-0000-4000-8000-000000000001','Casa M3','91000000-0000-4000-8000-000000000001'),
 ('92000000-0000-4000-8000-000000000002','Outra casa','91000000-0000-4000-8000-000000000003');
insert into public.household_members (household_id,user_id,role) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','owner'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','member'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000003','owner');

create temporary table finance_results (
  kind text primary key,
  command_id uuid not null,
  proposal jsonb,
  receipt jsonb
);
grant select,insert,update on finance_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$select public.prepare_finance_command('{"commandId":"93000000-0000-4000-8000-000000000000","type":"create_account","payload":{"name":"Conta","accountType":"checking","currencyCode":"BRL","visibility":"household"}}')$$,
  '28000',null,'prepare requires authentication'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select lives_ok(
  $$select public.prepare_finance_command('{"commandId":"93000000-0000-4000-8000-000000000099","type":"create_account","payload":{"name":"Outra","accountType":"checking","currencyCode":"BRL","visibility":"household"}}')$$,
  'member of another household prepares only its own command'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into finance_results(kind,command_id,proposal) values (
 'shared_account','93000000-0000-4000-8000-000000000001',
 public.prepare_finance_command('{"commandId":"93000000-0000-4000-8000-000000000001","type":"create_account","payload":{"name":"Conta Casa","accountType":"checking","currencyCode":"BRL","visibility":"household"}}')
);
select is(
 (select array_agg(key order by key) from jsonb_object_keys((select proposal from finance_results where kind='shared_account')) key),
 array['commandHash','commandId','expiresAt','proposalId','review','summary'],
 'proposal projection is strict'
);
select is((select count(*) from public.financial_accounts where name='Conta Casa')::bigint,0::bigint,'prepare does not mutate');
select throws_ok(
 format('select public.confirm_finance_command(%L,%L,%L)',
  (select command_id from finance_results where kind='shared_account'),
  (select (proposal->>'proposalId')::uuid from finance_results where kind='shared_account'),
  repeat('0',64)),
 '42501',null,'altered confirmation hash is rejected'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select throws_ok(
 format('select public.confirm_finance_command(%L,%L,%L)',
  (select command_id from finance_results where kind='shared_account'),
  (select (proposal->>'proposalId')::uuid from finance_results where kind='shared_account'),
  (select proposal->>'commandHash' from finance_results where kind='shared_account')),
 '42501',null,'another household member cannot consume proposal'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
update finance_results set receipt=public.confirm_finance_command(
 command_id,(proposal->>'proposalId')::uuid,proposal->>'commandHash'
) where kind='shared_account';
select is((select jsonb_array_length(receipt->'affectedIds') from finance_results where kind='shared_account'),1,'confirmation returns affected id');
select is((select count(*) from public.financial_accounts where name='Conta Casa')::bigint,1::bigint,'confirmation creates one account');
select ok((public.confirm_finance_command(
 (select command_id from finance_results where kind='shared_account'),
 (select (proposal->>'proposalId')::uuid from finance_results where kind='shared_account'),
 (select proposal->>'commandHash' from finance_results where kind='shared_account')
)->>'replayed')::boolean,'confirmed command replay is stable');
select is((select count(*) from public.financial_accounts where name='Conta Casa')::bigint,1::bigint,'replay does not duplicate account');
select throws_ok($$select * from public.finance_command_proposals$$,'42501',null,'proposals have no client access');
select throws_ok($$select * from public.finance_command_receipts$$,'42501',null,'receipts have no client access');
select throws_ok($$insert into public.financial_accounts(household_id,owner_user_id,created_by,name,account_type,currency_code) values('92000000-0000-4000-8000-000000000001',null,auth.uid(),'Direta','cash','BRL')$$,'42501',null,'direct account insert is forbidden');

insert into finance_results(kind,command_id,proposal) values (
 'private_account','93000000-0000-4000-8000-000000000002',
 public.prepare_finance_command('{"commandId":"93000000-0000-4000-8000-000000000002","type":"create_account","payload":{"name":"Conta Privada","accountType":"savings","currencyCode":"BRL","visibility":"private"}}')
);
select lives_ok(format('select public.confirm_finance_command(%L,%L,%L)',
 (select command_id from finance_results where kind='private_account'),
 (select (proposal->>'proposalId')::uuid from finance_results where kind='private_account'),
 (select proposal->>'commandHash' from finance_results where kind='private_account')),'owner confirms private account');
select is((select count(*) from public.financial_accounts)::bigint,2::bigint,'owner reads shared and private accounts');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.financial_accounts)::bigint,1::bigint,'member cannot read owner private account');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into finance_results(kind,command_id,proposal) values (
 'category','93000000-0000-4000-8000-000000000003',
 public.prepare_finance_command('{"commandId":"93000000-0000-4000-8000-000000000003","type":"create_category","payload":{"name":"Mercado","kind":"expense","visibility":"household"}}')
);
select lives_ok(format('select public.confirm_finance_command(%L,%L,%L)',
 (select command_id from finance_results where kind='category'),
 (select (proposal->>'proposalId')::uuid from finance_results where kind='category'),
 (select proposal->>'commandHash' from finance_results where kind='category')),'shared category is confirmed');


reset role;
insert into public.finance_categories(id,household_id,owner_user_id,created_by,visibility,name,kind)
values ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','private','Categoria privada','expense');
insert into public.finance_budgets(household_id,owner_user_id,created_by,visibility,category_id,month,amount_minor,currency_code)
values
 ('92000000-0000-4000-8000-000000000001',null,'91000000-0000-4000-8000-000000000001','household',(select id from public.finance_categories where name='Mercado'),'2026-09-01',1000,'BRL'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','private','94000000-0000-4000-8000-000000000001','2026-09-01',2000,'BRL');
insert into public.finance_recurrences(household_id,owner_user_id,created_by,visibility,account_id,category_id,direction,amount_minor,currency_code,description,frequency,next_due_on)
values
 ('92000000-0000-4000-8000-000000000001',null,'91000000-0000-4000-8000-000000000001','household',(select id from public.financial_accounts where name='Conta Casa'),(select id from public.finance_categories where name='Mercado'),'expense',100,'BRL','Recorrência comum','monthly','2026-10-01'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','private',(select id from public.financial_accounts where name='Conta Privada'),'94000000-0000-4000-8000-000000000001','expense',200,'BRL','Recorrência privada','monthly','2026-10-01');
insert into public.installment_plans(household_id,owner_user_id,created_by,visibility,account_id,category_id,description,total_amount_minor,installment_count,currency_code,first_due_on)
values
 ('92000000-0000-4000-8000-000000000001',null,'91000000-0000-4000-8000-000000000001','household',(select id from public.financial_accounts where name='Conta Casa'),(select id from public.finance_categories where name='Mercado'),'Plano comum',300,3,'BRL','2026-10-01'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','private',(select id from public.financial_accounts where name='Conta Privada'),'94000000-0000-4000-8000-000000000001','Plano privado',400,4,'BRL','2026-10-01');

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.finance_categories)::bigint,2::bigint,'owner reads shared and own private categories');
select is((select count(*) from public.finance_budgets)::bigint,2::bigint,'owner reads shared and own private budgets');
select is((select count(*) from public.finance_recurrences)::bigint,2::bigint,'owner reads shared and own private recurrences');
select is((select count(*) from public.installment_plans)::bigint,2::bigint,'owner reads shared and own private installment plans');
select throws_ok('insert into public.finance_categories(household_id,created_by,name) values (''92000000-0000-4000-8000-000000000001'',auth.uid(),''Direta'')','42501',null,'direct category insert is forbidden');
select throws_ok('insert into public.finance_budgets(household_id,created_by,category_id,month,amount_minor) values (''92000000-0000-4000-8000-000000000001'',auth.uid(),''94000000-0000-4000-8000-000000000001'',''2027-01-01'',1)','42501',null,'direct budget insert is forbidden');
select throws_ok('insert into public.finance_recurrences(household_id,created_by,account_id,direction,amount_minor,description,frequency,next_due_on) values (''92000000-0000-4000-8000-000000000001'',auth.uid(),''00000000-0000-4000-8000-000000000001'',''expense'',1,''Direta'',''monthly'',''2027-01-01'')','42501',null,'direct recurrence insert is forbidden');
select throws_ok('insert into public.installment_plans(household_id,created_by,account_id,description,total_amount_minor,installment_count,first_due_on) values (''92000000-0000-4000-8000-000000000001'',auth.uid(),''00000000-0000-4000-8000-000000000001'',''Direta'',2,2,''2027-01-01'')','42501',null,'direct installment insert is forbidden');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.finance_categories)::bigint,1::bigint,'member reads only shared categories');
select is((select count(*) from public.finance_budgets)::bigint,1::bigint,'member reads only shared budgets');
select is((select count(*) from public.finance_recurrences)::bigint,1::bigint,'member reads only shared recurrences');
select is((select count(*) from public.installment_plans)::bigint,1::bigint,'member reads only shared installment plans');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.finance_categories)::bigint,0::bigint,'outside user reads no categories');
select is((select count(*) from public.finance_budgets)::bigint,0::bigint,'outside user reads no budgets');
select is((select count(*) from public.finance_recurrences)::bigint,0::bigint,'outside user reads no recurrences');
select is((select count(*) from public.installment_plans)::bigint,0::bigint,'outside user reads no installment plans');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok(
 format('select public.prepare_finance_command(%L)',jsonb_build_object(
  'commandId','93000000-0000-4000-8000-000000000091','type','create_recurrence',
  'payload',jsonb_build_object('accountId',(select id from public.financial_accounts where name='Conta Casa'),'categoryId','94000000-0000-4000-8000-000000000001','direction','expense','amountMinor',1,'currencyCode','BRL','description','Inválida','frequency','monthly','nextDueOn','2026-10-01','visibility','household')
 )),
 '40001',null,'shared recurrence cannot reference private category');
select throws_ok(
 format('select public.prepare_finance_command(%L)',jsonb_build_object(
  'commandId','93000000-0000-4000-8000-000000000092','type','create_installment_plan',
  'payload',jsonb_build_object('accountId',(select id from public.financial_accounts where name='Conta Casa'),'categoryId','94000000-0000-4000-8000-000000000001','description','Inválido','totalAmountMinor',2,'installmentCount',2,'currencyCode','BRL','firstDueOn','2026-10-01','visibility','household')
 )),
 '40001',null,'shared installment cannot reference private category');
insert into finance_results(kind,command_id,proposal)
select 'transaction','93000000-0000-4000-8000-000000000004',
 public.prepare_finance_command(jsonb_build_object(
  'commandId','93000000-0000-4000-8000-000000000004','type','create_transaction',
  'payload',jsonb_build_object(
   'accountId',(select id from public.financial_accounts where name='Conta Casa'),
   'categoryId',(select id from public.finance_categories where name='Mercado'),
   'direction','expense','amountMinor',12345,'currencyCode','BRL',
   'description','Compra sintética','occurredOn','2026-09-24','visibility','household'
  )));
select lives_ok(format('select public.confirm_finance_command(%L,%L,%L)',
 (select command_id from finance_results where kind='transaction'),
 (select (proposal->>'proposalId')::uuid from finance_results where kind='transaction'),
 (select proposal->>'commandHash' from finance_results where kind='transaction')),'shared transaction is confirmed');

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.transactions)::bigint,1::bigint,'member reads shared ledger entry');
select throws_ok(
 $$select public.prepare_finance_command(jsonb_build_object(
  'commandId','93000000-0000-4000-8000-000000000090','type','create_transaction',
  'payload',jsonb_build_object(
   'accountId',(select id from public.financial_accounts where name='Conta Privada'),
   'categoryId',null,'direction','expense','amountMinor',1,'currencyCode','BRL',
   'description','Tentativa','occurredOn','2026-09-24','visibility','private'
  )))$$,
 '40001',null,'hidden account id cannot be used'
);

select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into finance_results(kind,command_id,proposal)
select 'reversal','93000000-0000-4000-8000-000000000005',
 public.prepare_finance_command(jsonb_build_object(
  'commandId','93000000-0000-4000-8000-000000000005','type','reverse_transaction',
  'payload',jsonb_build_object('transactionId',(select id from public.transactions where description='Compra sintética'),'reason','Correção sintética')
 ));
select is((select proposal#>>'{review,targetName}' from finance_results where kind='reversal'),'Compra sintética','reversal review identifies original transaction');
select lives_ok(format('select public.confirm_finance_command(%L,%L,%L)',
 (select command_id from finance_results where kind='reversal'),
 (select (proposal->>'proposalId')::uuid from finance_results where kind='reversal'),
 (select proposal->>'commandHash' from finance_results where kind='reversal')),'reversal is confirmed');
select is((select count(*) from public.transactions where reversal_of_id is not null)::bigint,1::bigint,'reversal appends one inverse entry');
select throws_ok(
 $$select public.prepare_finance_command(jsonb_build_object(
  'commandId','93000000-0000-4000-8000-000000000006','type','reverse_transaction',
  'payload',jsonb_build_object('transactionId',(select id from public.transactions where description='Compra sintética'),'reason','Duplicado')
 ))$$,
 '40001',null,'second reversal is rejected'
);

insert into finance_results(kind,command_id,proposal)
select 'installments','93000000-0000-4000-8000-000000000007',
 public.prepare_finance_command(jsonb_build_object(
  'commandId','93000000-0000-4000-8000-000000000007','type','create_installment_plan',
  'payload',jsonb_build_object(
   'accountId',(select id from public.financial_accounts where name='Conta Casa'),
   'categoryId',(select id from public.finance_categories where name='Mercado'),
   'description','Compra parcelada','totalAmountMinor',100,'installmentCount',3,
   'currencyCode','BRL','firstDueOn','2026-01-31','visibility','household'
  )));
select lives_ok(format('select public.confirm_finance_command(%L,%L,%L)',
 (select command_id from finance_results where kind='installments'),
 (select (proposal->>'proposalId')::uuid from finance_results where kind='installments'),
 (select proposal->>'commandHash' from finance_results where kind='installments')),'installment plan is confirmed');
select is((select count(*) from public.transactions where installment_plan_id is not null)::bigint,3::bigint,'installment plan creates exact count');
select is((select sum(amount_minor) from public.transactions where installment_plan_id is not null),100::numeric,'installments preserve exact cents');

insert into finance_results(kind,command_id,proposal) values (
 'expired','93000000-0000-4000-8000-000000000093',
 public.prepare_finance_command('{"commandId":"93000000-0000-4000-8000-000000000093","type":"create_account","payload":{"name":"Conta expirada","accountType":"checking","currencyCode":"BRL","visibility":"household"}}')
);
reset role;
update public.finance_command_proposals
set expires_at=now()-interval '1 second'
where id=(select (proposal->>'proposalId')::uuid from finance_results where kind='expired');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok(
 format('select public.confirm_finance_command(%L,%L,%L)',
  (select command_id from finance_results where kind='expired'),
  (select (proposal->>'proposalId')::uuid from finance_results where kind='expired'),
  (select proposal->>'commandHash' from finance_results where kind='expired')),
 '22023',null,'expired proposal is rejected before first consumption'
);
select ok(not has_function_privilege('anon','public.prepare_finance_command(jsonb)','EXECUTE'),'anonymous role cannot execute prepare');
select ok(not has_function_privilege('anon','public.confirm_finance_command(uuid,uuid,text)','EXECUTE'),'anonymous role cannot execute confirm');
select ok(not has_function_privilege('anon','public.execute_finance_command(uuid,jsonb,text)','EXECUTE'),'anonymous role cannot execute internal finance command');
select ok(not has_function_privilege('authenticated','public.execute_finance_command(uuid,jsonb,text)','EXECUTE'),'authenticated role cannot execute internal finance command');

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok($$update public.transactions set description='Alterada' where true$$,'42501',null,'direct ledger update is forbidden');
select throws_ok($$delete from public.transactions where true$$,'42501',null,'direct ledger delete is forbidden');

reset role;
select is((select count(*) from public.audit_log where action like 'finance.%')::bigint,6::bigint,'successful commands audit exactly once');
select * from finish();
rollback;

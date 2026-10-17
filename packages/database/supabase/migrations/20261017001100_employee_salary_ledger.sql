-- Employee salary ledger, separate from construction labour and GST documents.
begin;
create table private.company_salary_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  employee_name text not null check(length(btrim(employee_name)) between 2 and 160),
  salary_month date not null check(extract(day from salary_month)=1),
  gross numeric(14,2) not null check(gross>0 and gross<=999999999999.99),
  deductions numeric(14,2) not null default 0 check(deductions>=0 and deductions<=gross),
  net numeric(14,2) generated always as (gross-deductions) stored,
  status text not null default 'pending' check(status in ('pending','paid')),
  notes text not null default '' check(length(notes)<=800),
  payment_method text check(payment_method in ('cash','upi','bank_transfer','cheque','other')),
  payment_reference text not null default '' check(length(payment_reference)<=120),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(id),
  constraint salary_paid_consistency check (
    (status='pending' and paid_at is null and payment_method is null) or
    (status='paid' and paid_at is not null and payment_method is not null)
  )
);
create unique index salary_once_per_month on private.company_salary_entries
 (organization_id,lower(btrim(employee_name)),salary_month);
create index salary_by_company_month on private.company_salary_entries
 (organization_id,salary_month desc,id desc);
alter table private.company_salary_entries enable row level security;
revoke all on private.company_salary_entries from public,anon,authenticated;

create function public.company_salary_create(p_org uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid; v_name text;v_month date;v_gross numeric;v_deduction numeric;v_notes text;
begin
  perform private.finance_require(p_org,'payment.record');
  if p_input is null or jsonb_typeof(p_input)<>'object'
    or (p_input-array['employeeName','salaryMonth','gross','deductions','notes'])<>'{}'::jsonb
    then raise exception 'Invalid salary fields' using errcode='22023';end if;
  v_name=btrim(coalesce(p_input->>'employeeName',''));
  v_notes=btrim(coalesce(p_input->>'notes',''));
  if length(v_name) not between 2 and 160 or length(v_notes)>800 or
    coalesce(p_input->>'salaryMonth','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    then raise exception 'Invalid salary details' using errcode='22023';end if;
  v_month=(p_input->>'salaryMonth'||'-01')::date;
  if v_month>date_trunc('month',current_date)::date+interval '1 month'
    then raise exception 'Future salary month invalid' using errcode='22023';end if;
  v_gross=private.finance_decimal(p_input->>'gross');
  v_deduction=private.finance_decimal(coalesce(p_input->>'deductions','0'));
  if v_gross<=0 or v_gross>999999999999.99 or v_deduction>v_gross
    or round(v_gross,2)<>v_gross or round(v_deduction,2)<>v_deduction then
    raise exception 'Invalid salary amounts' using errcode='22023';end if;
  insert into private.company_salary_entries (
    organization_id,employee_name,salary_month,gross,deductions,notes
  ) values (p_org,v_name,v_month,v_gross,v_deduction,v_notes)
  returning id into v_id;
  insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
    values(auth.uid(),p_org,'salary.entry.created','company_salary',v_id::text);
  return v_id;
end $fn$;
create function public.company_salary_mark_paid(
  p_org uuid,p_id uuid,p_method text,p_reference text default ''
) returns void language plpgsql security definer set search_path='' as $fn$
declare v_salary private.company_salary_entries;
begin
  perform private.finance_require(p_org,'payment.record');
  select * into v_salary from private.company_salary_entries
    where organization_id=p_org and id=p_id for update;
  if not found then raise exception 'Salary entry not found' using errcode='22023';end if;
  if v_salary.status<>'pending' then raise exception 'Salary already paid' using errcode='23505';end if;
  if p_method not in ('cash','upi','bank_transfer','cheque','other') or
    length(btrim(coalesce(p_reference,'')))>120 or
    (p_method in ('upi','bank_transfer','cheque') and length(btrim(coalesce(p_reference,'')))<3)
    then raise exception 'Valid salary payment reference required' using errcode='22023';end if;
  update private.company_salary_entries set status='paid',paid_at=now(),
    payment_method=p_method,payment_reference=btrim(coalesce(p_reference,''))
    where organization_id=p_org and id=p_id;
  insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
    values(auth.uid(),p_org,'salary.entry.paid','company_salary',p_id::text);
end $fn$;
create function public.company_salary_list(p_org uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_rows jsonb;
begin
  perform private.finance_require(p_org,'payment.view');
  if p_month is null or extract(day from p_month)<>1 then
    raise exception 'Invalid salary month' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'employeeName',d.employee_name,'salaryMonth',d.salary_month,
    'gross',d.gross,'deductions',d.deductions,'net',d.net,'status',d.status,
    'paymentMethod',d.payment_method,'paymentReference',d.payment_reference,
    'paidAt',d.paid_at,'notes',d.notes
  ) order by d.employee_name,d.id),'[]'::jsonb)
  into v_rows from (select * from private.company_salary_entries
      where organization_id=p_org and salary_month=p_month order by employee_name,id limit 1000)d;
  return v_rows;
end $fn$;
revoke all on function
  public.company_salary_create(uuid,jsonb),
  public.company_salary_mark_paid(uuid,uuid,text,text),
  public.company_salary_list(uuid,date) from public,anon;
grant execute on function
  public.company_salary_create(uuid,jsonb),
  public.company_salary_mark_paid(uuid,uuid,text,text),
  public.company_salary_list(uuid,date) to authenticated;
commit;

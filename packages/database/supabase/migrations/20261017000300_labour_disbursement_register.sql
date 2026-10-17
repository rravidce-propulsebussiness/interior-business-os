-- Project-associated labour disbursements, separate from GST tax invoices and
-- customer receipts. Never include these records in GST ITC calculations.
begin;

create table private.labour_disbursements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid,
  payee_name text not null check (length(btrim(payee_name)) between 2 and 160),
  work_description text not null check (length(btrim(work_description)) between 2 and 300),
  work_from date not null,
  work_to date not null,
  gross_amount numeric(14,2) not null check (gross_amount > 0),
  deductions numeric(14,2) not null default 0 check (deductions >= 0),
  net_amount numeric(14,2) generated always as (gross_amount - deductions) stored,
  status text not null default 'pending' check (status in ('pending','paid')),
  payment_method text check (payment_method in ('cash','upi','bank_transfer','cheque','other')),
  payment_reference text not null default '' check (length(payment_reference) <= 120),
  notes text not null default '' check (length(notes) <= 1000),
  paid_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint labour_project_scope foreign key (organization_id, project_id)
    references public.projects(organization_id,id),
  constraint labour_work_dates check(work_to >= work_from),
  constraint labour_nonnegative_net check(deductions <= gross_amount),
  constraint labour_payment_consistency check (
    (status='pending' and paid_at is null and payment_method is null) or
    (status='paid' and paid_at is not null and payment_method is not null)
  )
);
create index labour_disbursements_org_work_date
  on private.labour_disbursements(organization_id,work_to desc,id desc);
create index labour_disbursements_org_project
  on private.labour_disbursements(organization_id,project_id,work_to desc);
alter table private.labour_disbursements enable row level security;
revoke all on private.labour_disbursements from public,anon,authenticated;
create trigger labour_disbursements_touch
  before update on private.labour_disbursements for each row
  execute function private.touch_updated_at();

create function public.labour_disbursement_create(p_org uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare
  v_id uuid;
  v_project uuid;
  v_name text;
  v_description text;
  v_notes text;
  v_from date;
  v_to date;
  v_gross numeric;
  v_deduction numeric;
begin
  perform private.finance_require(p_org,'payment.record');
  if p_input is null or jsonb_typeof(p_input)<>'object'
    or (p_input-array['projectId','payeeName','workDescription','workFrom','workTo',
       'grossAmount','deductions','notes'])<>'{}'::jsonb
    then raise exception 'Invalid labour payment fields' using errcode='22023';
  end if;
  v_project=nullif(p_input->>'projectId','')::uuid;
  if v_project is not null and not exists(
    select 1 from public.projects
    where id=v_project and organization_id=p_org
  ) then raise exception 'Project not found in this company' using errcode='22023'; end if;
  v_name=btrim(coalesce(p_input->>'payeeName',''));
  v_description=btrim(coalesce(p_input->>'workDescription',''));
  v_notes=btrim(coalesce(p_input->>'notes',''));
  if length(v_name) not between 2 and 160 or length(v_description) not between 2 and 300
    or length(v_notes)>1000 or
       coalesce(p_input->>'workFrom','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or
       coalesce(p_input->>'workTo','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then raise exception 'Invalid labour details' using errcode='22023';
  end if;
  v_from=(p_input->>'workFrom')::date;
  v_to=(p_input->>'workTo')::date;
  if v_to<v_from or v_to>current_date+interval '1 year' or
    v_to-v_from>366 then raise exception 'Invalid work period' using errcode='22023'; end if;
  v_gross=private.finance_decimal(p_input->>'grossAmount');
  v_deduction=private.finance_decimal(coalesce(p_input->>'deductions','0'));
  if v_gross<=0 or v_gross>999999999999.99 or v_deduction>v_gross or
    round(v_gross,2)<>v_gross or round(v_deduction,2)<>v_deduction then
    raise exception 'Invalid gross amount or deductions' using errcode='22023';
  end if;
  insert into private.labour_disbursements (
    organization_id,project_id,payee_name,work_description,work_from,work_to,
    gross_amount,deductions,notes
  ) values (
    p_org,v_project,v_name,v_description,v_from,v_to,v_gross,v_deduction,v_notes
  ) returning id into v_id;
  insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
    values(auth.uid(),p_org,'labour.disbursement.created','labour_disbursement',v_id::text);
  return v_id;
end $fn$;

create function public.labour_disbursement_mark_paid(
  p_org uuid,p_id uuid,p_method text,p_reference text default ''
) returns void language plpgsql security definer set search_path='' as $fn$
declare v_row private.labour_disbursements;
begin
  perform private.finance_require(p_org,'payment.record');
  select * into v_row from private.labour_disbursements
  where id=p_id and organization_id=p_org for update;
  if not found then raise exception 'Labour disbursement not found' using errcode='22023';end if;
  if v_row.status<>'pending' then
    raise exception 'Already recorded as paid' using errcode='23505';end if;
  if p_method not in ('cash','upi','bank_transfer','cheque','other') or
     length(btrim(coalesce(p_reference,'')))>120 or
     (p_method in ('upi','bank_transfer','cheque') and
       length(btrim(coalesce(p_reference,'')))<3) then
    raise exception 'A valid payment method and reference are required' using errcode='22023';
  end if;
  update private.labour_disbursements
    set status='paid',payment_method=p_method,
      payment_reference=btrim(coalesce(p_reference,'')),paid_at=now()
    where id=v_row.id;
  insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
    values(auth.uid(),p_org,'labour.disbursement.paid','labour_disbursement',p_id::text);
end $fn$;

create function public.labour_disbursements_list(
  p_org uuid,p_from date,p_to date
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_rows jsonb;
begin
  perform private.finance_require(p_org,'payment.view');
  if p_from is null or p_to is null or p_from>p_to or
     p_to-p_from>366 then raise exception 'Invalid date range' using errcode='22023'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',d.id,'projectId',d.project_id,'projectName',p.name,
      'payeeName',d.payee_name,'workDescription',d.work_description,
      'workFrom',d.work_from,'workTo',d.work_to,'grossAmount',d.gross_amount,
      'deductions',d.deductions,'netAmount',d.net_amount,'status',d.status,
      'paymentMethod',d.payment_method,'paymentReference',d.payment_reference,
      'notes',d.notes,'paidAt',d.paid_at,'createdAt',d.created_at
    ) order by d.work_to desc,d.created_at desc,d.id desc),'[]'::jsonb)
    into v_rows
  from (select * from private.labour_disbursements
    where organization_id=p_org and work_to between p_from and p_to
    order by work_to desc,id desc limit 2500) d
  left join public.projects p on p.id=d.project_id and p.organization_id=p_org;
  return v_rows;
end $fn$;

revoke all on function
  public.labour_disbursement_create(uuid,jsonb),
  public.labour_disbursement_mark_paid(uuid,uuid,text,text),
  public.labour_disbursements_list(uuid,date,date)
  from public,anon;
grant execute on function
  public.labour_disbursement_create(uuid,jsonb),
  public.labour_disbursement_mark_paid(uuid,uuid,text,text),
  public.labour_disbursements_list(uuid,date,date)
  to authenticated;
commit;

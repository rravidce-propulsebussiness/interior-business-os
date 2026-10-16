-- Quotations are commercial proposals, not confirmed execution projects.
-- Existing quotation tables still require a project_id for cost-line FK
-- integrity. Create a TENANT-PRIVATE SALES PROSPECT reference, never a
-- project visible to execution workers/clients, until a confirmed conversion.
begin;

create or replace function public.quotation_prospect_project_create(
  p_organization_id uuid,
  p_customer_id uuid,
  p_industry_id uuid,
  p_name text,
  p_project_type text,
  p_site_city text,
  p_notes text,
  p_new_customer boolean default false
) returns uuid
language plpgsql
security definer
set search_path=''
as $create$
declare
  v_id uuid;
  v_customer public.customers%rowtype;
begin
  if auth.uid() is null
     or not private.commercial_access(p_organization_id,'quotation.create','quotation')
     or not private.commercial_access(p_organization_id,'customer.view','customers')
  then
    raise exception 'Quotation create permission required' using errcode='42501';
  end if;

  if p_name is null or length(trim(p_name)) not between 2 and 200
     or p_project_type is null or length(p_project_type)>100
     or p_site_city is null or length(p_site_city)>200
     or p_notes is null or length(p_notes)>10000
  then
    raise exception 'Invalid quotation requirements' using errcode='22023';
  end if;

  select * into v_customer
    from public.customers
   where id=p_customer_id and organization_id=p_organization_id and status='active'
   for update;
  if not found then
    raise exception 'Customer unavailable for quotation' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.industries
     where id=p_industry_id and status='active'
  ) then
    raise exception 'Quotation industry unavailable' using errcode='22023';
  end if;

  if p_new_customer then
    -- Only the creator can flag their brand-new customer as a pre-sale
    -- prospect; a pre-existing won customer must never become hidden.
    if v_customer.created_by is distinct from auth.uid()
       or v_customer.created_at < now()-interval '15 minutes'
       or exists(select 1 from public.projects
                  where organization_id=p_organization_id and customer_id=p_customer_id)
    then
      raise exception 'Cannot mark an established customer as prospective'
        using errcode='42501';
    end if;
    update public.customers
       set is_sales_prospect=true
     where id=v_customer.id and organization_id=p_organization_id;
  end if;

  insert into public.projects(
    organization_id, customer_id, name, code, industry_id, branch_id,
    project_type, site_address, status, notes, assigned_user_id, is_sales_prospect
  ) values (
    p_organization_id, p_customer_id, trim(p_name),
    'Q'||upper(replace(gen_random_uuid()::text,'-','')), p_industry_id,null,
    p_project_type,
    jsonb_build_object('line1','','line2','','city',p_site_city,
                       'region','','postal_code','','country_code','IN'),
    'active',p_notes,null,true
  ) returning id into v_id;

  return v_id;
end;
$create$;

revoke all on function public.quotation_prospect_project_create(
  uuid,uuid,uuid,text,text,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.quotation_prospect_project_create(
  uuid,uuid,uuid,text,text,text,text,boolean)
  to authenticated;

-- Safely hide older quote-only planning records left visible by the
-- pre-lead-linked creator. Restrict to generated Q-code rows that are
-- associated with quotations but have no contract and have never converted
-- to an execution project. Do not modify existing real/won projects.
update public.projects p
   set is_sales_prospect=true
 where p.is_sales_prospect=false
   and p.code ~ '^Q[A-Z0-9]{8,}$'
   and exists(select 1 from public.quotations q
               where q.organization_id=p.organization_id and q.project_id=p.id)
   and not exists(select 1 from public.contracts c
                   where c.organization_id=p.organization_id and c.project_id=p.id)
   and not exists(select 1 from public.leads l
                   where l.organization_id=p.organization_id
                     and l.converted_project_id=p.id and l.converted_at is not null);

-- Some businesses quote without an originating lead. An activated accepted
-- contract also converts their quote-only prospect into a visible execution
-- project. Pending/cancelled agreements do not trigger project activation.
create or replace function private.quotation_prospect_activate_on_contract()
returns trigger language plpgsql security definer set search_path=''
as $promote$
begin
  if new.status='active' and old.status is distinct from 'active' then
    update public.projects
      set is_sales_prospect=false
      where organization_id=new.organization_id and id=new.project_id
        and customer_id=new.customer_id and is_sales_prospect;
    update public.customers
      set is_sales_prospect=false
      where organization_id=new.organization_id and id=new.customer_id
        and is_sales_prospect;
  end if;
  return new;
end;
$promote$;
drop trigger if exists quotation_prospect_contract_activated on public.contracts;
create trigger quotation_prospect_contract_activated
  after update of status on public.contracts
  for each row execute function private.quotation_prospect_activate_on_contract();


commit;

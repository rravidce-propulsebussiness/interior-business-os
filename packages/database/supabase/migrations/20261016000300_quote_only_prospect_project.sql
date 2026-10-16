-- Quotations are commercial proposals, not confirmed execution projects.
-- Existing quotation tables still require a project_id for cost-line FK
-- integrity. Create a TENANT-PRIVATE SALES PROSPECT reference, never a
-- project visible to execution workers/clients, until a confirmed conversion.
begin;

-- A zero-write preflight prevents creating orphan sales customers when the
-- backend has deployed before the corresponding database migration.
create or replace function public.quotation_prospect_ready(
  p_organization_id uuid
) returns boolean language plpgsql stable security definer set search_path=''
as $ready$
begin
  return auth.uid() is not null
    and coalesce(private.commercial_access(
      p_organization_id,'quotation.create','quotation'),false);
end;
$ready$;
revoke all on function public.quotation_prospect_ready(uuid)
  from public,anon,authenticated;
grant execute on function public.quotation_prospect_ready(uuid) to authenticated;

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


-- Dashboard/repository project search must not count unconverted prospects.
-- The create-quotation form uses its direct customer lookup, so existing CRM
-- prospect matching remains available while the main Customers list stays clean.
create or replace function public.commercial_search(p_organization_id uuid,p_entity text,p_query text default '',p_page integer default 1,p_status text default '',p_parent_id uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;count_rows bigint;q text;filter_sql text;label_column text;
begin
 if p_entity not in ('customers','projects','quotations','catalog_items','catalog_categories') or p_page not between 1 and 10000 or length(p_query)>100 then raise exception 'Invalid search' using errcode='22023';end if;
 if not private.is_member(p_organization_id) then raise exception 'Forbidden' using errcode='42501';end if;
 label_column=case when p_entity='customers' then 'display_name' when p_entity='quotations' then 'quotation_number' else 'name' end;
 q=replace(replace(replace(lower(p_query),'\','\\'),'%','\%'),'_','\_')||'%';
 if p_entity='quotations' then
  select count(*) into count_rows from public.quotation_revisions r join public.quotations t on t.id=r.quotation_id where r.organization_id=p_organization_id and lower(t.quotation_number) like q and (p_status='' or r.status=p_status);
  select coalesce(jsonb_agg(x),'[]') into result from (select r.id,t.quotation_number,r.revision_number,r.valid_until,r.totals->>'final_amount' amount,r.currency,r.status,r.document_snapshot->'customer'->>'name' customer_name,r.document_snapshot->'project'->>'name' project_name from public.quotation_revisions r join public.quotations t on t.id=r.quotation_id where r.organization_id=p_organization_id and lower(t.quotation_number) like q and (p_status='' or r.status=p_status) order by r.created_at desc,r.id limit 25 offset (p_page-1)*25) x;
  return jsonb_build_object('rows',result,'total',count_rows,'page',p_page,'page_size',25);
 end if;
 filter_sql=format('organization_id=$1 and lower(%I) like $2 and ($3='''' or status=$3)',label_column);
 if p_entity='projects' then filter_sql=filter_sql||' and is_sales_prospect=false and ($4 is null or customer_id=$4)';elsif p_entity='customers' then filter_sql=filter_sql||' and is_sales_prospect=false';elsif p_entity='catalog_items' then filter_sql=filter_sql||' and ($4 is null or category_id=$4)';else filter_sql=filter_sql||' and ($4 is null or $4 is not null)';end if;
 execute format('select count(*) from public.%I where %s',p_entity,filter_sql) into count_rows using p_organization_id,q,p_status,p_parent_id;
 if p_entity='quotations' then
  execute format('select coalesce(jsonb_agg(x),''[]'') from (select t.*,r.revision_number,r.valid_until,r.totals->>''final_amount'' amount,r.currency,r.status revision_status,c.display_name customer_name,p.name project_name from public.quotations t join public.quotation_revisions r on r.id=t.current_revision_id join public.customers c on c.id=t.customer_id join public.projects p on p.id=t.project_id where t.organization_id=$1 and lower(t.quotation_number) like $2 and ($3='''' or t.status=$3) and ($4 is null or $4 is not null) order by t.created_at desc,t.id limit 25 offset $5) x') into result using p_organization_id,q,p_status,p_parent_id,(p_page-1)*25;
 else execute format('select coalesce(jsonb_agg(x),''[]'') from (select * from public.%I where %s order by lower(%I),id limit 25 offset $5) x',p_entity,filter_sql,label_column) into result using p_organization_id,q,p_status,p_parent_id,(p_page-1)*25;end if;
 return jsonb_build_object('rows',result,'total',count_rows,'page',p_page,'page_size',25);
end $$;

commit;

-- Quote-created CRM enquiries are prospective, not yet won clients/jobs.
begin;
alter table public.customers add column if not exists is_sales_prospect boolean not null default false;
alter table public.projects add column if not exists is_sales_prospect boolean not null default false;
create index if not exists customers_sales_prospect_idx
 on public.customers(organization_id,is_sales_prospect,status);
create index if not exists projects_sales_prospect_idx
 on public.projects(organization_id,is_sales_prospect,status);

create or replace function public.lead_quotation_link_provisional(
 p_organization_id uuid,p_lead_id uuid,p_quotation_id uuid,p_project_id uuid,
 p_new_customer boolean,p_new_project boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_customer uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  if p_new_customer and not p_new_project then
    raise exception 'A new customer must have a new project' using errcode='22023';
  end if;
  perform public.lead_quotation_link(p_organization_id,p_lead_id,p_quotation_id,p_project_id);
  select customer_id into v_customer from public.quotations
   where organization_id=p_organization_id and id=p_quotation_id and project_id=p_project_id;
  if v_customer is null then
    raise exception 'Quotation unavailable' using errcode='42501';
  end if;
  if p_new_project then
    update public.projects set is_sales_prospect=true
    where organization_id=p_organization_id and id=p_project_id and customer_id=v_customer
      and code like 'Q%' and created_at > now()-interval '1 hour'
      and (created_by=auth.uid() or created_by is null)
      and not exists (select 1 from public.contracts c where c.organization_id=p_organization_id and c.project_id=p_project_id);
    if not found then
      raise exception 'Unable to mark this quote-created project as prospective' using errcode='42501';
    end if;
  end if;
  if p_new_customer then
    update public.customers set is_sales_prospect=true
    where organization_id=p_organization_id and id=v_customer
      and created_at > now()-interval '1 hour'
      and (created_by=auth.uid() or created_by is null)
      and not exists(select 1 from public.projects p
        where p.organization_id=p_organization_id and p.customer_id=v_customer
          and p.id<>p_project_id);
    if not found then
      raise exception 'Unable to mark this quote-created contact as prospective' using errcode='42501';
    end if;
  end if;
end; $$;

revoke all on function public.lead_quotation_link_provisional(uuid,uuid,uuid,uuid,boolean,boolean)
 from public,anon;
grant execute on function public.lead_quotation_link_provisional(uuid,uuid,uuid,uuid,boolean,boolean)
 to authenticated;

create or replace function private.promote_converted_quotation_prospects()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.converted_at is not null and old.converted_at is null then
    if new.converted_customer_id is not null then
      update public.customers set is_sales_prospect=false
       where organization_id=new.organization_id and id=new.converted_customer_id
         and is_sales_prospect;
    end if;
    if new.converted_project_id is not null then
      update public.projects set is_sales_prospect=false
       where organization_id=new.organization_id and id=new.converted_project_id
         and is_sales_prospect;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists lead_quotation_prospect_promoted on public.leads;
create trigger lead_quotation_prospect_promoted after update of converted_at on public.leads
 for each row execute function private.promote_converted_quotation_prospects();
commit;
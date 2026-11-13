-- Agreement preparation consumes the customer's selected Final quotation.
-- A Final choice is a customer-level pin and can intentionally remain a saved,
-- internal quotation; sharing it externally is not required for project setup.
create or replace function public.contract_create_for_project_quote(
 p_org uuid,p_project uuid,p_revision uuid
) returns uuid language plpgsql security definer set search_path='' as $create$
declare
 r public.quotation_revisions;
 q public.quotations;
 p public.projects;
 old_project public.projects;
 v_target uuid;
 v_lead uuid;
 v_prefix text;
 v_value numeric;
 v_places integer;
 v_snapshot jsonb;
 v_final_quote text;
begin
 perform private.finance_require(p_org,'contract.create');
 if not private.site_owner(p_org) or
   not private.commercial_access(p_org,'project.manage','projects') or
   not private.commercial_access(p_org,'quotation.view','quotation')
 then raise exception 'Only an authorized company owner may prepare an agreement' using errcode='42501';end if;
 select * into p from public.projects
  where organization_id=p_org and id=p_project and status='active'
    and is_sales_prospect=false and removed_from_workspace=false for update;
 select * into r from public.quotation_revisions
  where organization_id=p_org and id=p_revision for update;
 select * into q from public.quotations
  where organization_id=p_org and id=r.quotation_id;
 select * into old_project from public.projects
  where organization_id=p_org and id=r.project_id;

 -- Resolve the same Final selection shown by Quotations. This permits an
 -- owner-selected saved quotation, but never an unselected alternative.
 if q.id is not null then
  select public.quotation_final_choices(p_org,array[q.customer_id])->>q.customer_id::text
   into v_final_quote;
 end if;
 if p.id is null or r.id is null or q.id is null or old_project.id is null
   or r.status not in ('draft','issued') or q.status not in ('draft','issued')
   or q.current_revision_id is distinct from r.id
   or v_final_quote is distinct from q.id::text
   or p.customer_id<>q.customer_id
   or p.industry_id is distinct from old_project.industry_id
 then raise exception 'Choose the correct customer Final quotation before preparing the agreement' using errcode='22023';end if;
 if r.project_id<>p.id then
  select l.id into v_lead from public.leads l
   join private.lead_quotation_links lk
    on lk.organization_id=l.organization_id and lk.lead_id=l.id
   where l.organization_id=p_org and l.converted_project_id=p.id
    and l.converted_at is not null and l.lifecycle='won'
    and lk.quotation_id=q.id
   order by l.converted_at desc limit 1;
  if v_lead is null then raise exception 'Quotation does not belong to this converted lead' using errcode='42501';end if;
 else
  select id into v_lead from public.leads
   where organization_id=p_org and converted_project_id=p.id
   order by converted_at desc limit 1;
 end if;
 select id into v_target from public.contracts
  where organization_id=p_org and revision_id=r.id;
 if v_target is not null then
  if not exists(select 1 from public.contracts
    where id=v_target and organization_id=p_org and project_id=p.id)
  then raise exception 'Quotation belongs to an existing different project contract' using errcode='23505';end if;
  return v_target;
 end if;
 if exists(select 1 from public.contracts
   where organization_id=p_org and project_id=p.id
    and status in ('pending','active','on_hold'))
 then raise exception 'Project already has a current agreement; open it instead' using errcode='23505';end if;
 v_value=private.finance_decimal(r.totals->>'final_amount');
 v_places=greatest(2,scale(trim_scale(v_value)));
 if v_places>6 then raise exception 'Unsupported quotation amount precision' using errcode='22023';end if;
 select contract_prefix into v_prefix from public.organization_billing_settings
  where organization_id=p_org;
 v_snapshot=private.customer_quote_projection(r.id);
 v_snapshot=jsonb_set(v_snapshot,'{header,project,name}',to_jsonb(p.name),true);
 v_snapshot=jsonb_set(v_snapshot,'{header,project,code}',to_jsonb(p.code),true);
 insert into public.contracts(
  organization_id,customer_id,project_id,revision_id,acceptance_id,lead_id,
  branch_id,contract_number,currency,precision,original_contract_value,
  source_snapshot,accepted_at
 ) values (
  p_org,p.customer_id,p.id,r.id,null,v_lead,p.branch_id,
  private.finance_number(p_org,'contract',coalesce(v_prefix,'CT')),
  r.currency,v_places,r.totals->>'final_amount',v_snapshot,null
 ) returning id into v_target;
 perform private.crm_audit(p_org,'contract.prepared_from_owner_final_quote','contracts',v_target);
 return v_target;
end $create$;

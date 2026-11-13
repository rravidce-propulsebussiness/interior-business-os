-- A project may use its current customer Final quotation as the source of its
-- planned milestones before the quotation is externally issued. In that path,
-- the agreement remains a pending owner-prepared milestone and no acceptance,
-- receipt, or payment request is fabricated. Customer-accepted contracts still
-- require an issued quotation and matching recorded customer response.
create or replace function private.contract_source_guard()
returns trigger language plpgsql security definer set search_path='' as $guard$
declare
 q public.quotations;
 r public.quotation_revisions;
 p public.projects;
 source_project public.projects;
 v_expected jsonb;
 v_final_quote text;
begin
 select * into r from public.quotation_revisions
  where organization_id=new.organization_id and id=new.revision_id;
 select * into q from public.quotations
  where organization_id=new.organization_id and id=r.quotation_id;
 select * into p from public.projects
  where organization_id=new.organization_id and id=new.project_id;
 select * into source_project from public.projects
  where organization_id=new.organization_id and id=q.project_id;
 if r.id is null or q.id is null or p.id is null or source_project.id is null
    or q.customer_id<>new.customer_id or p.customer_id<>q.customer_id
    or q.current_revision_id is distinct from r.id
    or r.currency<>new.currency
    or (r.totals->>'final_amount')::numeric is distinct from new.original_contract_value::numeric
 then raise exception 'Contract requires the exact quotation and customer' using errcode='23514';end if;
 if new.acceptance_id is not null then
  if r.status<>'issued' or q.status<>'issued'
    or r.project_id<>new.project_id or not exists(
   select 1 from public.quotation_customer_responses a
    where a.organization_id=new.organization_id and a.id=new.acceptance_id
     and a.revision_id=r.id and a.action='approved'
     and a.accepted_amount::numeric=new.original_contract_value::numeric
     and a.currency=new.currency
     and a.responded_at=new.accepted_at)
  then raise exception 'Digitally accepted contract source mismatch' using errcode='23514';end if;
 else
  if new.status<>'pending' or new.accepted_at is not null
    or new.created_by is distinct from auth.uid()
    or not private.site_owner(new.organization_id)
    or not private.finance_access(new.organization_id,'contract.create')
    or p.is_sales_prospect or p.removed_from_workspace or p.status<>'active'
    or p.industry_id is distinct from source_project.industry_id
    or r.status not in ('draft','issued') or q.status not in ('draft','issued')
    or (public.quotation_final_choices(new.organization_id,array[q.customer_id])->>q.customer_id::text)
       is distinct from q.id::text
    or not (
      r.project_id=new.project_id or exists(
        select 1 from public.leads l
         join private.lead_quotation_links link
           on link.organization_id=l.organization_id and link.lead_id=l.id
         where l.organization_id=new.organization_id
           and l.converted_project_id=new.project_id and l.converted_at is not null
           and link.quotation_id=q.id and l.lifecycle='won'))
  then raise exception 'Company-owned project and matching customer Final quotation required' using errcode='23514';end if;
  v_expected=private.customer_quote_projection(r.id);
  v_expected=jsonb_set(v_expected,'{header,project,name}',to_jsonb(p.name),true);
  v_expected=jsonb_set(v_expected,'{header,project,code}',to_jsonb(p.code),true);
  if new.source_snapshot is distinct from v_expected then
    raise exception 'Contract source snapshot was altered' using errcode='23514';
  end if;
 end if;
 return new;
end
$guard$;

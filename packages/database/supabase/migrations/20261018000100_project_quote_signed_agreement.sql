-- A won lead may have valid immutable issued quotations on retired sales
-- prospect project identities. Keep every quote untouched; use explicit,
-- audited owner agreement sourcing for the actual converted delivery project.
begin;

-- The original composite FK forbids a signed agreement against an old quote
-- even when both are proven to belong to the same converted lead/customer.
-- Replace only that identity coupling, retaining the immutable revision FK.
alter table public.contracts
 drop constraint contracts_organization_id_revision_id_project_id_fkey;
alter table public.contracts
 add constraint contracts_org_revision_source_fk foreign key(organization_id,revision_id)
 references public.quotation_revisions(organization_id,id);
alter table private.project_quote_timeline_sources
 drop constraint project_quote_timeline_source_organization_id_revision_id__fkey;
alter table private.project_quote_timeline_sources
 add constraint project_quote_timeline_org_revision_fk foreign key(organization_id,revision_id)
 references public.quotation_revisions(organization_id,id);

-- An owner-prepared contract is not falsely marked client-accepted.
-- Existing digitally accepted contracts retain acceptance_id/accepted_at.
alter table public.contracts alter column acceptance_id drop not null;
alter table public.contracts alter column accepted_at drop not null;

create or replace function private.contract_source_guard()
returns trigger language plpgsql security definer set search_path='' as $guard$
declare
 q public.quotations;
 r public.quotation_revisions;
 p public.projects;
 source_project public.projects;
 v_expected jsonb;
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
    or r.status<>'issued' or q.status<>'issued'
    or q.current_revision_id is distinct from r.id
    or r.currency<>new.currency
    or (r.totals->>'final_amount')::numeric is distinct from new.original_contract_value::numeric
 then raise exception 'Contract requires the exact issued quotation and customer' using errcode='23514';end if;
 if new.acceptance_id is not null then
  if r.project_id<>new.project_id or not exists(
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
    or not (
      r.project_id=new.project_id or exists(
        select 1 from public.leads l
         join private.lead_quotation_links link
           on link.organization_id=l.organization_id and link.lead_id=l.id
         where l.organization_id=new.organization_id
           and l.converted_project_id=new.project_id and l.converted_at is not null
           and link.quotation_id=q.id and l.lifecycle='won'))
  then raise exception 'Company-owned project and matching lead quotation required' using errcode='23514';end if;
  v_expected=private.customer_quote_projection(r.id);
  v_expected=jsonb_set(v_expected,'{header,project,name}',to_jsonb(p.name),true);
  v_expected=jsonb_set(v_expected,'{header,project,code}',to_jsonb(p.code),true);
  if new.source_snapshot is distinct from v_expected then
    raise exception 'Contract source snapshot was altered' using errcode='23514';end if;
 end if;
 return new;
end
$guard$;

-- Specific owner action for the existing finalized quote (not a second
-- customer-response action). The later signed PDF is the acceptance evidence.
create function public.contract_create_for_project_quote(
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
 if p.id is null or r.id is null or q.id is null or old_project.id is null
   or r.status<>'issued' or q.status<>'issued'
   or q.current_revision_id is distinct from r.id
   or p.customer_id<>q.customer_id
   or p.industry_id is distinct from old_project.industry_id
 then raise exception 'Finalize the correct customer quotation before the agreement' using errcode='22023';end if;
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
revoke all on function public.contract_create_for_project_quote(uuid,uuid,uuid)
 from public,anon;
grant execute on function public.contract_create_for_project_quote(uuid,uuid,uuid)
 to authenticated;

-- The timeline is only a PLANNED draft derived from the frozen quote.
-- Relax the old online-response gate only for contracts already validated
-- by the exact source guard above. Actual execution still requires the
-- signed agreement, activated schedule, advance and design/quality gates.
do $patch$
declare def text;
begin
 select pg_get_functiondef('public.project_quote_timeline_create(uuid,uuid,jsonb)'::regprocedure)
 into def;
 if def is null
  or strpos(def,'where organization_id=p_org and id=c.revision_id and project_id=p.id;')=0
  or strpos(def,'or not exists(select 1 from public.quotation_customer_responses a')=0
 then raise exception 'Timeline function changed; review migration before applying';end if;
 def=replace(def,
  'where organization_id=p_org and id=c.revision_id and project_id=p.id;',
  'where organization_id=p_org and id=c.revision_id;');
 def=replace(def,
  'or not exists(select 1 from public.quotation_customer_responses a',
  'or (c.acceptance_id is not null and not exists(select 1 from public.quotation_customer_responses a');
 def=replace(def,
  'and a.revision_id=rev.id and a.action=''approved'')',
  'and a.revision_id=rev.id and a.action=''approved''))');
 execute def;
end $patch$;
commit;

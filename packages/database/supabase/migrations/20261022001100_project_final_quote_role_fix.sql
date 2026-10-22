-- Correct Final-quotation permissions after project conversion.
-- Assigned project managers only need quotation.view to select Final for their
-- own project. Sales staff can still edit/select a pre-project quote, but
-- cannot replace the choice once the client has an execution project.
create or replace function private.quotation_final_can_select(
 p_org uuid,p_quotation uuid
) returns boolean language plpgsql stable security definer set search_path='' as $f$
declare
 v_quote public.quotations;
 v_project uuid;
 v_converted uuid;
 v_project_count int:=0;
begin
 if not coalesce(private.has_permission(p_org,'quotation.view'),false)
 then return false;end if;
 select * into v_quote from public.quotations q
 where q.organization_id=p_org and q.id=p_quotation
   and q.status in ('draft','issued');
 if v_quote.id is null then return false;end if;

 -- Signed/unsigned active agreement is the most exact project association.
 select c.project_id into v_project from public.contracts c
 join public.quotation_revisions r on r.organization_id=c.organization_id
   and r.id=c.revision_id
 join public.projects p on p.organization_id=c.organization_id
   and p.id=c.project_id and p.status='active'
 where c.organization_id=p_org and r.quotation_id=p_quotation
   and c.status<>'cancelled'
 order by c.created_at desc,c.id desc limit 1;

 -- The original quote may belong to a sales prospect. When the lead becomes Won,
 -- authorize against its actual execution project, not the old quote project.
 if v_project is null then
  select min(l.converted_project_id),count(distinct l.converted_project_id)
   into v_converted,v_project_count
  from private.lead_quotation_links ql
  join public.leads l on l.organization_id=ql.organization_id and l.id=ql.lead_id
  join public.projects p on p.organization_id=l.organization_id
    and p.id=l.converted_project_id and p.status='active'
  where ql.organization_id=p_org and ql.quotation_id=p_quotation;
  if v_project_count>1 then return private.site_owner(p_org);end if;
  v_project=v_converted;
 end if;

 if v_project is null then
  select p.id into v_project from public.projects p
   where p.id=v_quote.project_id and p.organization_id=p_org
     and p.status='active' and p.is_sales_prospect is not true;
 end if;

 -- A new quote may have been created for a customer with an existing project.
 -- Restrict Final if there is only one real project for this company/customer.
 if v_project is null then
  select min(p.id),count(*) into v_converted,v_project_count
   from public.projects p
   where p.organization_id=p_org and p.customer_id=v_quote.customer_id
    and p.status='active' and p.is_sales_prospect is not true
    and p.removed_from_workspace is not true;
  if v_project_count>1 then return private.site_owner(p_org);end if;
  v_project=v_converted;
 end if;

 -- No project yet: retain normal quotations team permissions.
 if v_project is null then
  return coalesce(private.has_permission(p_org,'quotation.edit'),false);
 end if;
 if private.site_owner(p_org) then return true;end if;
 if not private.construction_project_access(p_org,v_project) then return false;end if;
 return private.site_role(p_org,v_project)='manager'
   or exists(select 1 from private.construction_project_roles r
    where r.organization_id=p_org and r.project_id=v_project
      and r.user_id=(select auth.uid()) and r.active
      and r.role in ('project_manager','project_director'));
end
$f$;

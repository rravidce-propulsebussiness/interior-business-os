-- Assigned project managers may select Final with quotation view, without broad quotation-edit access.
create or replace function private.quotation_final_can_select(p_org uuid,p_quotation uuid)
returns boolean language plpgsql stable security definer set search_path='' as $f$
declare v_quote public.quotations;v_project uuid;
begin
 if not coalesce(private.has_permission(p_org,'quotation.view'),false) then return false;end if;
 select * into v_quote from public.quotations q
  where q.id=p_quotation and q.organization_id=p_org
    and q.status in ('draft','issued');
 if v_quote.id is null then return false;end if;

 -- Prefer the actual linked contract project over an earlier lead/project ID.
 select c.project_id into v_project
 from public.contracts c
 join public.quotation_revisions r on r.id=c.revision_id
    and r.organization_id=c.organization_id
 where r.quotation_id=p_quotation and c.organization_id=p_org
   and c.status not in ('cancelled')
 order by c.created_at desc,c.id desc limit 1;
 if v_project is null and exists(
  select 1 from public.projects p where p.organization_id=p_org and
   p.id=v_quote.project_id and p.status='active'
 ) then v_project=v_quote.project_id;end if;

 -- A quote that has not become a project retains existing quote-edit rights.
 if v_project is null then return coalesce(private.has_permission(p_org,'quotation.edit'),false);end if;
 if private.site_owner(p_org) then return true;end if;
 if not private.construction_project_access(p_org,v_project) then return false;end if;
 return private.site_role(p_org,v_project)='manager'
  or exists(
   select 1 from private.construction_project_roles r
   where r.organization_id=p_org and r.project_id=v_project
     and r.user_id=(select auth.uid()) and r.active
     and r.role in ('project_manager','project_director')
  );
end
$f$;


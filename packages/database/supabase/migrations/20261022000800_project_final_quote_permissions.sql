-- Final quote is the latest active quote until deliberately selected.
-- Once its project exists, only the company owner or a project-specific
-- manager/director may change Final. Signed contract revisions never change.
create or replace function private.quotation_final_can_select(p_org uuid,p_quotation uuid)
returns boolean language plpgsql stable security definer set search_path='' as $f$
declare v_quote public.quotations;v_project uuid;
begin
 if not coalesce(private.has_permission(p_org,'quotation.edit'),false) then return false;end if;
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
 if v_project is null then return true;end if;
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

create or replace function public.quotation_final_eligible(
 p_org uuid,p_quotation_ids uuid[]
) returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not private.has_permission(p_org,'quotation.view') then
  raise exception 'Quotation access denied' using errcode='42501';end if;
 if p_quotation_ids is null or coalesce(array_length(p_quotation_ids,1),0)>100 then
  raise exception 'Invalid quotation selection list' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(q.id::text,
   private.quotation_final_can_select(p_org,q.id))
  from public.quotations q
  where q.organization_id=p_org and q.id=any(p_quotation_ids)),'{}'::jsonb);
end
$f$;

create or replace function public.quotation_mark_final(
 p_org uuid,p_quotation uuid
) returns boolean language plpgsql security definer set search_path='' as $f$
declare v_quote public.quotations;
begin
 if not private.quotation_final_can_select(p_org,p_quotation) then
  raise exception 'Only the project owner or assigned project manager can change Final after project creation'
   using errcode='42501';end if;
 select * into v_quote from public.quotations q
 where q.organization_id=p_org and q.id=p_quotation
  and q.status in ('draft','issued') for update;
 if v_quote.id is null then
  raise exception 'Choose an active saved quotation from this company' using errcode='22023';end if;
 insert into private.quotation_final_selections(
   organization_id,customer_id,quotation_id,selected_at,selected_by)
 values(p_org,v_quote.customer_id,v_quote.id,now(),auth.uid())
 on conflict(organization_id,customer_id) do update set
  quotation_id=excluded.quotation_id,selected_at=excluded.selected_at,
  selected_by=excluded.selected_by;
 return true;
end
$f$;

create or replace function public.quotation_final_choices(
 p_org uuid,p_customer_ids uuid[]
) returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not private.has_permission(p_org,'quotation.view') then
  raise exception 'Not authorized to view quotations' using errcode='42501';end if;
 if p_customer_ids is null or coalesce(array_length(p_customer_ids,1),0)>100 then
  raise exception 'Invalid customer selection' using errcode='22023';end if;
 return coalesce((
  select jsonb_object_agg(c.id::text,coalesce(pinned.id,newest.id)::text)
  from public.customers c
  join lateral (
   select q.id from public.quotations q
   where q.organization_id=p_org and q.customer_id=c.id
    and q.status in ('draft','issued')
   order by q.created_at desc,q.id desc limit 1
  ) newest on true
  left join private.quotation_final_selections sel on
   sel.organization_id=p_org and sel.customer_id=c.id
  left join public.quotations pinned on pinned.organization_id=p_org
   and pinned.id=sel.quotation_id and pinned.customer_id=c.id
   and pinned.status in ('draft','issued')
  where c.organization_id=p_org and c.id=any(p_customer_ids)
 ),'{}'::jsonb);
end
$f$;

revoke all on function public.quotation_final_eligible(uuid,uuid[]) from public,anon;
grant execute on function public.quotation_final_eligible(uuid,uuid[]) to authenticated;

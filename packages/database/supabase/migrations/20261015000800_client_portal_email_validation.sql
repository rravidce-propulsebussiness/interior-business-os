-- Correct client email validation: use [.], not an escaped regex period.
begin;
create or replace function public.client_portal_manage(
 p_organization_id uuid,p_customer_id uuid,p_project_id uuid,
 p_email text,p_active boolean default true
) returns void language plpgsql security definer set search_path='' as $$
declare v_email text;
begin
 if (select auth.uid()) is null or
    not private.commercial_access(p_organization_id,'customer.manage','customers')
 then raise exception 'Client access management denied' using errcode='42501'; end if;
 v_email=lower(trim(coalesce(p_email,'')));
 if length(v_email) not between 5 and 254 or
    v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 then raise exception 'Enter a valid client email address' using errcode='22023';end if;
 if not exists (
   select 1 from public.projects p join public.customers c
    on c.organization_id=p.organization_id and c.id=p.customer_id
   where p.organization_id=p_organization_id and p.id=p_project_id
     and p.customer_id=p_customer_id and p.status='active'
     and c.status='active' and not p.is_sales_prospect
     and not c.is_sales_prospect
 ) then raise exception 'Choose an active converted client project' using errcode='42501';end if;
 insert into private.client_project_access
  (organization_id,customer_id,project_id,email,active,added_by)
 values(p_organization_id,p_customer_id,p_project_id,v_email,p_active,auth.uid())
 on conflict(organization_id,project_id,email)
 do update set active=excluded.active,updated_at=now(),added_by=excluded.added_by;
end; $$;
revoke all on function public.client_portal_manage(uuid,uuid,uuid,text,boolean) from public,anon;
grant execute on function public.client_portal_manage(uuid,uuid,uuid,text,boolean) to authenticated;
commit;
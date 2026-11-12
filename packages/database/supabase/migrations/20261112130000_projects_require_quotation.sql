-- A delivery project must originate from the canonical quotation flow.
-- Keep the legacy RPC name as a closed compatibility guard so stale clients
-- cannot create a customer-only project after this migration is installed.
begin;

create or replace function public.customer_project_create(
 p_org uuid,p_customer uuid,p_name text,p_industry_key text,
 p_project_type text,p_site_city text,p_request_id uuid
) returns uuid language plpgsql security definer set search_path='' as $blocked$
begin
 if auth.uid() is null
   or not private.commercial_access(p_org,'project.create','projects')
 then raise exception 'Project creation requires authorized company access' using errcode='42501';end if;
 raise exception 'Start from a quotation for an existing customer. The delivery project is created after the accepted quotation and agreement.'
   using errcode='23514';
end;
$blocked$;

revoke all on function public.customer_project_create(uuid,uuid,text,text,text,text,uuid)
 from public,anon,authenticated;

-- CRM Won conversion is another public project-creation path. Preserve its
-- existing identity and quote-project reuse logic, but reject the fallback
-- that used to insert a delivery project when no quotation was linked.
do $guard$
declare
 def text;
 needle text := 'customer=(p_input->>''customer_id'')::uuid;project=(p_input->>''project_id'')::uuid;';
 replacement text := 'if not exists (' ||
   'select 1 from private.lead_quotation_links link ' ||
   'join public.quotations q on q.organization_id=link.organization_id and q.id=link.quotation_id ' ||
   'where link.organization_id=org and link.lead_id=l.id and q.status<>''cancelled''' ||
   ') then raise exception ''A quotation is required before creating a project'' using errcode=''23514''; end if;' || E'\n ' || needle;
begin
 select pg_get_functiondef('public.crm_convert(uuid,jsonb)'::regprocedure) into def;
 if def is null or position(needle in def)=0 then
  raise exception 'CRM conversion function changed; inspect before requiring its quotation';
 end if;
 execute replace(def,needle,replacement);
end;
$guard$;

commit;

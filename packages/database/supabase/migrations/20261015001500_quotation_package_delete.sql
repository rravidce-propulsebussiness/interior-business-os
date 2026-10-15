-- Remove a company's editable industry package without touching issued quotation snapshots.
begin;
create or replace function public.quotation_package_delete(
  p_org uuid,p_package_id uuid,p_version integer
) returns boolean language plpgsql volatile security definer set search_path='' as $fn$
declare v_deleted uuid;
begin
  perform private.require_permission(p_org,'pricing.manage');
  if not private.has_permission(p_org,'pricing.view')
     or not private.entitled(p_org,'pricing')
  then raise exception 'Pricing access required' using errcode='42501';end if;
  if p_package_id is null or p_version is null or p_version<1
  then raise exception 'Invalid package version' using errcode='22023';end if;
  delete from private.quotation_packages
   where organization_id=p_org and id=p_package_id and version=p_version
   returning id into v_deleted;
  if v_deleted is null then
    raise exception 'Package changed or unavailable' using errcode='40001';
  end if;
  insert into public.audit_logs
    (actor_user_id,organization_id,action,entity_type,entity_id,metadata)
  values (auth.uid(),p_org,'quotation.package.deleted',
    'quotation_package',v_deleted::text,'{}'::jsonb);
  return true;
end $fn$;
revoke all on function public.quotation_package_delete(uuid,uuid,integer) from public,anon;
grant execute on function public.quotation_package_delete(uuid,uuid,integer) to authenticated;
commit;

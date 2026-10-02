begin;
-- Preserve the target of a deleted assignment and the effective entitlement window.
-- Audit only this explicit field allowlist, never complete rows or free-form configuration.
create or replace function private.audit_mutation() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; org uuid;
begin
 row_data=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 org=case when tg_table_name='organizations' then (row_data->>'id')::uuid else (row_data->>'organization_id')::uuid end;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),org,tg_table_name||'.'||lower(tg_op),tg_table_name,
 coalesce(row_data->>'id',row_data->>'user_id',row_data->>'role_id',row_data->>'plan_id','configuration'),
 jsonb_strip_nulls(jsonb_build_object(
  'status',row_data->>'status','enabled',row_data->'enabled',
  'role_id',row_data->>'role_id','permission_id',row_data->>'permission_id',
  'module_id',row_data->>'module_id','membership_id',row_data->>'membership_id',
  'user_id',row_data->>'user_id','branch_id',row_data->>'branch_id',
  'plan_id',row_data->>'plan_id','source',row_data->>'source',
  'valid_from',row_data->>'valid_from','valid_until',row_data->>'valid_until'
 )));
 return coalesce(new,old);
end $$;
revoke all on function private.audit_mutation() from public,anon,authenticated;
commit;

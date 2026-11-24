\set ON_ERROR_STOP on
begin;
-- The Materials register returns each marketplace order's total and status.
do $$
declare definition text := pg_get_functiondef('public.project_material_access_read(uuid,uuid)'::regprocedure);
begin
 if position('''marketplace_total''' in definition) = 0
    or position('''marketplace_status''' in definition) = 0
    or position('o.buyer_organization_id = p_org' in definition) = 0 then
   raise exception 'FAIL: marketplace order total missing from the materials register';
 end if;
 raise notice 'PASS: materials register shows marketplace order totals';
end$$;
rollback;

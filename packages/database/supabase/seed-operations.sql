-- Optional repeatable Interior configuration. No fabricated contract acceptance or stock.
begin;
do $$declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';actor uuid;project uuid;customer uuid;name text;ordinal integer=0;begin
 select created_by into actor from public.organizations where id=org;
 if actor is null then raise exception 'Apply development organization and commercial seeds first';end if;
 select id into customer from public.customers where organization_id=org order by created_at,id limit 1;
 if customer is null then raise exception 'Apply commercial demo seed first';end if;
 project=private.seed_uuid('phase7:demo:residence');
 insert into public.projects(id,organization_id,customer_id,name,code,created_by) values(project,org,customer,'Demo Residence','DEMO-RESIDENCE',actor) on conflict(organization_id,code) do nothing;
 select id into project from public.projects where organization_id=org and code='DEMO-RESIDENCE';
 foreach name in array array['Kitchen','Master Bedroom','Living Room'] loop
  insert into public.project_areas(id,organization_id,project_id,name,sort_order,created_by) values(private.seed_uuid('phase7:area:'||name),org,project,name,ordinal,actor) on conflict(id) do nothing;ordinal=ordinal+1;
 end loop;
 insert into public.inventory_locations(id,organization_id,name,kind,created_by) values(private.seed_uuid('phase7:demo:store'),org,'Demo central store','central_store',actor) on conflict(id) do nothing;
 insert into public.inventory_locations(id,organization_id,name,kind,site_project_id,created_by) values(private.seed_uuid('phase7:demo:site'),org,'Demo Residence site','project_site',project,actor) on conflict(id) do nothing;
 insert into public.inspection_templates(id,organization_id,name,kind,is_final,mandatory,checklist,created_by) values(private.seed_uuid('phase7:demo:inspection'),org,'Interior final inspection','Final quality',true,true,'[{"key":"alignment","label":"Alignment and operation","required":true},{"key":"finish","label":"Surface and edge finish","required":true},{"key":"services","label":"Electrical and plumbing checks","required":true}]',actor) on conflict(id) do nothing;
 insert into public.handover_templates(id,organization_id,name,checklist,created_by) values(private.seed_uuid('phase7:demo:handover'),org,'Residence handover','[{"key":"cleaning","label":"Final cleaning","required":true},{"key":"keys","label":"Keys and access","required":true},{"key":"documents","label":"Drawings, care and warranty documents","required":true},{"key":"acknowledgement","label":"Customer acknowledgement recorded","required":true}]',actor) on conflict(id) do nothing;
end$$;
commit;

-- Development only; no fabricated Auth users. Repeatable and preserves edits.
begin;
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';owner_id uuid='11111111-1111-4111-8111-111111111111';customer uuid=private.seed_uuid('business-os:demo:ravi');project uuid=private.seed_uuid('business-os:demo:3bhk');area_name text;position integer=0;address jsonb='{"line1":"","line2":"","city":"","region":"","postal_code":"","country_code":""}';
begin
 if not exists(select 1 from public.organization_memberships where organization_id=org and user_id=owner_id and status='active') then raise notice 'Commercial seed skipped: confirmed demo Owner is absent';return;end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into public.customers(id,organization_id,display_name) values(customer,org,'Ravi Residence') on conflict(id) do nothing;
 insert into public.projects(id,organization_id,customer_id,name,code) values(project,org,customer,'3BHK Interior - Demo','demo-3bhk') on conflict(id) do nothing;
 foreach area_name in array array['Living Room','Master Bedroom','Kitchen'] loop
  position=position+1;
  insert into public.project_areas(id,organization_id,project_id,name,sort_order) values(private.seed_uuid('business-os:demo:area:'||area_name),org,project,area_name,position) on conflict(id) do nothing;
 end loop;
 insert into public.organization_quotation_settings(id,organization_id,branding,default_terms) values(private.seed_uuid('business-os:demo:quote-settings'),org,jsonb_build_object('name','Demo Interiors','address',address,'phone','','email','','tax_identifier','','accent','#245b55','logo_data_uri',''),'Rates cover the finished work and selected specifications. Optional items are excluded from the payable total.') on conflict(organization_id) do nothing;
end $$;
commit;

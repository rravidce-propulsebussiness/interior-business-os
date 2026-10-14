-- Disposable accepted quotation fixture for Site Delivery agreement-gate tests.
-- Included inside each test transaction BEFORE switching to authenticated.
-- The record is approved through the existing quotation-sharing flow;
-- this fixture never alters deployed tenants or pretends to be a signature.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into private.quotation_signing_keys(singleton,secret_hex)
values(true,repeat('a',64)) on conflict(singleton) do nothing;
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;customer uuid;root uuid=gen_random_uuid();
 revision uuid=gen_random_uuid();share jsonb;snapshot jsonb;
begin
 select id,customer_id into project,customer from public.projects
 where organization_id=org and code='demo-3bhk';
 if project is null then raise exception 'Missing test project';end if;
 snapshot=jsonb_build_object('snapshot_version',1,'name','Site construction work',
   'line_type','manual','quantity','1',
   'unit',jsonb_build_object('key','each','label','Each'),
   'display_rate','1000','effective_amount','1000',
   'final_amount','1000','discount_amount','0',
   'minimum_amount',null,'customer_specifications','[]'::jsonb);
 insert into public.quotations(id,organization_id,customer_id,project_id,quotation_number)
 values(root,org,customer,project,'SITE-AGREEMENT-TEST');
 insert into public.quotation_revisions(
   id,organization_id,quotation_id,project_id,revision_number,currency,
   valid_until,document_snapshot)
 select revision,org,root,project,1,'INR',current_date+30,
 jsonb_build_object('branding',branding,
   'customer',jsonb_build_object('name','Site Fixture Customer','billing_address','{}'::jsonb),
   'project',jsonb_build_object('name','Site Fixture Project','site_address','{}'::jsonb),
   'display',jsonb_build_object('quantity',true,'unit_rate',true,'specifications',true))
 from public.organization_quotation_settings where organization_id=org;
 insert into public.quotation_items(organization_id,revision_id,project_id,snapshot)
 values(org,revision,project,snapshot);
 update public.quotation_revisions set status='issued',issued_at=now(),
   totals=private.quotation_totals(id,discount) where id=revision;
 update public.quotations set status='issued',current_revision_id=revision where id=root;
 share=public.quotation_share_manage(org,'create',jsonb_build_object('revision_id',revision));
 perform public.public_quotation(share->>'token','respond',
   '{"action":"approved","name":"Site Fixture Customer","acknowledged":true}');
end$$;

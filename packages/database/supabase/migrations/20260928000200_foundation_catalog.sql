begin;
-- RFC 4122 UUIDv3 in the DNS namespace, used only for deterministic seed identifiers.
create function private.seed_uuid(seed_key text) returns uuid language sql immutable set search_path='' as $$
 with hash as (select decode(md5(decode('6ba7b8109dad11d180b400c04fd430c8','hex') || convert_to(seed_key,'UTF8')),'hex') as bytes)
 select encode(set_byte(set_byte(bytes,6,(get_byte(bytes,6) & 15) | 48),8,(get_byte(bytes,8) & 63) | 128),'hex')::uuid from hash;
$$;
revoke all on function private.seed_uuid(text) from public,anon,authenticated;
insert into public.permissions(id,key,scope,description) values
(private.seed_uuid('business-os:organization.view'),'organization.view','organization','organization view'),
(private.seed_uuid('business-os:organization.manage'),'organization.manage','organization','organization manage'),
(private.seed_uuid('business-os:organization.audit'),'organization.audit','organization','organization audit'),
(private.seed_uuid('business-os:branch.view'),'branch.view','organization','branch view'),
(private.seed_uuid('business-os:branch.manage'),'branch.manage','organization','branch manage'),
(private.seed_uuid('business-os:team.view'),'team.view','organization','team view'),
(private.seed_uuid('business-os:team.invite'),'team.invite','organization','team invite'),
(private.seed_uuid('business-os:team.manage'),'team.manage','organization','team manage'),
(private.seed_uuid('business-os:team.remove'),'team.remove','organization','team remove'),
(private.seed_uuid('business-os:role.view'),'role.view','organization','role view'),
(private.seed_uuid('business-os:role.manage'),'role.manage','organization','role manage'),
(private.seed_uuid('business-os:catalog.view'),'catalog.view','organization','catalog view'),
(private.seed_uuid('business-os:catalog.manage'),'catalog.manage','organization','catalog manage'),
(private.seed_uuid('business-os:pricing.view'),'pricing.view','organization','pricing view'),
(private.seed_uuid('business-os:pricing.manage'),'pricing.manage','organization','pricing manage'),
(private.seed_uuid('business-os:crm.view'),'crm.view','organization','crm view'),
(private.seed_uuid('business-os:crm.create'),'crm.create','organization','crm create'),
(private.seed_uuid('business-os:crm.manage'),'crm.manage','organization','crm manage'),
(private.seed_uuid('business-os:quotation.view'),'quotation.view','organization','quotation view'),
(private.seed_uuid('business-os:quotation.create'),'quotation.create','organization','quotation create'),
(private.seed_uuid('business-os:quotation.edit'),'quotation.edit','organization','quotation edit'),
(private.seed_uuid('business-os:quotation.delete'),'quotation.delete','organization','quotation delete'),
(private.seed_uuid('business-os:quotation.approve'),'quotation.approve','organization','quotation approve'),
(private.seed_uuid('business-os:quotation.discount'),'quotation.discount','organization','quotation discount'),
(private.seed_uuid('business-os:quotation.override_rate'),'quotation.override_rate','organization','quotation override_rate'),
(private.seed_uuid('business-os:quotation.view_internal_cost'),'quotation.view_internal_cost','organization','quotation view_internal_cost'),
(private.seed_uuid('business-os:project.view'),'project.view','organization','project view'),
(private.seed_uuid('business-os:project.create'),'project.create','organization','project create'),
(private.seed_uuid('business-os:project.manage'),'project.manage','organization','project manage'),
(private.seed_uuid('business-os:billing.view'),'billing.view','organization','billing view'),
(private.seed_uuid('business-os:billing.create'),'billing.create','organization','billing create'),
(private.seed_uuid('business-os:billing.manage'),'billing.manage','organization','billing manage'),
(private.seed_uuid('business-os:payment.view'),'payment.view','organization','payment view'),
(private.seed_uuid('business-os:payment.record'),'payment.record','organization','payment record'),
(private.seed_uuid('business-os:vendor.view'),'vendor.view','organization','vendor view'),
(private.seed_uuid('business-os:vendor.manage'),'vendor.manage','organization','vendor manage'),
(private.seed_uuid('business-os:purchase.view'),'purchase.view','organization','purchase view'),
(private.seed_uuid('business-os:purchase.manage'),'purchase.manage','organization','purchase manage'),
(private.seed_uuid('business-os:brochure.view'),'brochure.view','organization','brochure view'),
(private.seed_uuid('business-os:brochure.manage'),'brochure.manage','organization','brochure manage'),
(private.seed_uuid('business-os:website.view'),'website.view','organization','website view'),
(private.seed_uuid('business-os:website.manage'),'website.manage','organization','website manage'),
(private.seed_uuid('business-os:website.publish'),'website.publish','organization','website publish'),
(private.seed_uuid('business-os:report.view'),'report.view','organization','report view'),
(private.seed_uuid('business-os:report.financial'),'report.financial','organization','report financial'),
(private.seed_uuid('business-os:settings.view'),'settings.view','organization','settings view'),
(private.seed_uuid('business-os:settings.manage'),'settings.manage','organization','settings manage'),
(private.seed_uuid('business-os:platform.access'),'platform.access','platform','platform access'),
(private.seed_uuid('business-os:platform.organizations.view'),'platform.organizations.view','platform','platform organizations view'),
(private.seed_uuid('business-os:platform.organizations.manage'),'platform.organizations.manage','platform','platform organizations manage'),
(private.seed_uuid('business-os:platform.entitlements.view'),'platform.entitlements.view','platform','platform entitlements view'),
(private.seed_uuid('business-os:platform.entitlements.manage'),'platform.entitlements.manage','platform','platform entitlements manage'),
(private.seed_uuid('business-os:platform.catalog.view'),'platform.catalog.view','platform','platform catalog view'),
(private.seed_uuid('business-os:platform.roles.manage'),'platform.roles.manage','platform','platform roles manage'),
(private.seed_uuid('business-os:platform.audit.view'),'platform.audit.view','platform','platform audit view');
insert into public.modules(id,key,name,description,required_permission) values
(private.seed_uuid('business-os:module:crm'),'crm','CRM','CRM capability; business implementation is deferred.','crm.view'),
(private.seed_uuid('business-os:module:quotation'),'quotation','Quotation','Quotation capability; business implementation is deferred.','quotation.view'),
(private.seed_uuid('business-os:module:billing'),'billing','Billing','Billing capability; business implementation is deferred.','billing.view'),
(private.seed_uuid('business-os:module:projects'),'projects','Projects','Projects capability; business implementation is deferred.','project.view'),
(private.seed_uuid('business-os:module:catalog'),'catalog','Catalog','Catalog capability; business implementation is deferred.','catalog.view'),
(private.seed_uuid('business-os:module:pricing'),'pricing','Pricing','Pricing capability; business implementation is deferred.','pricing.view'),
(private.seed_uuid('business-os:module:vendors'),'vendors','Vendors','Vendors capability; business implementation is deferred.','vendor.view'),
(private.seed_uuid('business-os:module:purchasing'),'purchasing','Purchasing','Purchasing capability; business implementation is deferred.','purchase.view'),
(private.seed_uuid('business-os:module:brochure'),'brochure','Brochure','Brochure capability; business implementation is deferred.','brochure.view'),
(private.seed_uuid('business-os:module:website'),'website','Website','Website capability; business implementation is deferred.','website.view'),
(private.seed_uuid('business-os:module:client_portal'),'client_portal','Client Portal','Client Portal capability; business implementation is deferred.','organization.view'),
(private.seed_uuid('business-os:module:reports'),'reports','Reports','Reports capability; business implementation is deferred.','report.view');
insert into public.industries(id,key,name,status) values (private.seed_uuid('business-os:industry:interior'),'interior','Interior Design','active'),(private.seed_uuid('business-os:industry:construction'),'construction','Construction','inactive');
insert into private.role_templates(key,name,is_owner) values('owner','Owner',true);
insert into private.role_template_permissions(role_key,permission_key) values ('owner','organization.view'),('owner','organization.manage'),('owner','organization.audit'),('owner','branch.view'),('owner','branch.manage'),('owner','team.view'),('owner','team.invite'),('owner','team.manage'),('owner','team.remove'),('owner','role.view'),('owner','role.manage'),('owner','catalog.view'),('owner','catalog.manage'),('owner','pricing.view'),('owner','pricing.manage'),('owner','crm.view'),('owner','crm.create'),('owner','crm.manage'),('owner','quotation.view'),('owner','quotation.create'),('owner','quotation.edit'),('owner','quotation.delete'),('owner','quotation.approve'),('owner','quotation.discount'),('owner','quotation.override_rate'),('owner','quotation.view_internal_cost'),('owner','project.view'),('owner','project.create'),('owner','project.manage'),('owner','billing.view'),('owner','billing.create'),('owner','billing.manage'),('owner','payment.view'),('owner','payment.record'),('owner','vendor.view'),('owner','vendor.manage'),('owner','purchase.view'),('owner','purchase.manage'),('owner','brochure.view'),('owner','brochure.manage'),('owner','website.view'),('owner','website.manage'),('owner','website.publish'),('owner','report.view'),('owner','report.financial'),('owner','settings.view'),('owner','settings.manage');
insert into private.role_templates(key,name,is_owner) values('admin','Admin',false);
insert into private.role_template_permissions(role_key,permission_key) values ('admin','organization.view'),('admin','organization.manage'),('admin','organization.audit'),('admin','branch.view'),('admin','branch.manage'),('admin','team.view'),('admin','team.invite'),('admin','team.manage'),('admin','team.remove'),('admin','role.view'),('admin','role.manage'),('admin','catalog.view'),('admin','catalog.manage'),('admin','pricing.view'),('admin','pricing.manage'),('admin','crm.view'),('admin','crm.create'),('admin','crm.manage'),('admin','quotation.view'),('admin','quotation.create'),('admin','quotation.edit'),('admin','quotation.delete'),('admin','quotation.approve'),('admin','quotation.discount'),('admin','quotation.override_rate'),('admin','quotation.view_internal_cost'),('admin','project.view'),('admin','project.create'),('admin','project.manage'),('admin','billing.view'),('admin','billing.create'),('admin','billing.manage'),('admin','payment.view'),('admin','payment.record'),('admin','vendor.view'),('admin','vendor.manage'),('admin','purchase.view'),('admin','purchase.manage'),('admin','brochure.view'),('admin','brochure.manage'),('admin','website.view'),('admin','website.manage'),('admin','website.publish'),('admin','report.view'),('admin','report.financial'),('admin','settings.view'),('admin','settings.manage');
insert into private.role_templates(key,name,is_owner) values('branch_manager','Branch Manager',false);
insert into private.role_template_permissions(role_key,permission_key) values ('branch_manager','organization.view'),('branch_manager','branch.view'),('branch_manager','team.view'),('branch_manager','crm.view'),('branch_manager','crm.create'),('branch_manager','crm.manage'),('branch_manager','quotation.view'),('branch_manager','quotation.create'),('branch_manager','quotation.edit'),('branch_manager','project.view'),('branch_manager','report.view');
insert into private.role_templates(key,name,is_owner) values('sales','Sales',false);
insert into private.role_template_permissions(role_key,permission_key) values ('sales','organization.view'),('sales','branch.view'),('sales','crm.view'),('sales','crm.create'),('sales','quotation.view'),('sales','quotation.create'),('sales','quotation.edit'),('sales','brochure.view');
insert into private.role_templates(key,name,is_owner) values('interior_designer','Interior Designer',false);
insert into private.role_template_permissions(role_key,permission_key) values ('interior_designer','organization.view'),('interior_designer','branch.view'),('interior_designer','catalog.view'),('interior_designer','quotation.view'),('interior_designer','project.view');
insert into private.role_templates(key,name,is_owner) values('estimator','Estimator',false);
insert into private.role_template_permissions(role_key,permission_key) values ('estimator','organization.view'),('estimator','branch.view'),('estimator','catalog.view'),('estimator','pricing.view'),('estimator','quotation.view'),('estimator','quotation.create'),('estimator','quotation.view_internal_cost');
insert into private.role_templates(key,name,is_owner) values('accountant','Accountant',false);
insert into private.role_template_permissions(role_key,permission_key) values ('accountant','organization.view'),('accountant','branch.view'),('accountant','billing.view'),('accountant','billing.create'),('accountant','payment.view'),('accountant','payment.record'),('accountant','report.financial');
insert into private.role_templates(key,name,is_owner) values('purchase_manager','Purchase Manager',false);
insert into private.role_template_permissions(role_key,permission_key) values ('purchase_manager','organization.view'),('purchase_manager','branch.view'),('purchase_manager','vendor.view'),('purchase_manager','vendor.manage'),('purchase_manager','purchase.view'),('purchase_manager','purchase.manage');
insert into private.role_templates(key,name,is_owner) values('project_manager','Project Manager',false);
insert into private.role_template_permissions(role_key,permission_key) values ('project_manager','organization.view'),('project_manager','branch.view'),('project_manager','project.view'),('project_manager','project.create'),('project_manager','project.manage');
insert into private.role_templates(key,name,is_owner) values('site_supervisor','Site Supervisor',false);
insert into private.role_template_permissions(role_key,permission_key) values ('site_supervisor','organization.view'),('site_supervisor','branch.view'),('site_supervisor','project.view');
insert into public.platform_roles(id,key,name) values(private.seed_uuid('business-os:platform_super_admin'),'platform_super_admin','platform super admin');
insert into public.platform_role_permissions(role_id,permission_id) values (private.seed_uuid('business-os:platform_super_admin'),private.seed_uuid('business-os:platform.access')),(private.seed_uuid('business-os:platform_super_admin'),private.seed_uuid('business-os:platform.organizations.view')),(private.seed_uuid('business-os:platform_super_admin'),private.seed_uuid('business-os:platform.organizations.manage')),(private.seed_uuid('business-os:platform_super_admin'),private.seed_uuid('business-os:platform.entitlements.view')),(private.seed_uuid('business-os:platform_super_admin'),private.seed_uuid('business-os:platform.entitlements.manage')),(private.seed_uuid('business-os:platform_super_admin'),private.seed_uuid('business-os:platform.catalog.view')),(private.seed_uuid('business-os:platform_super_admin'),private.seed_uuid('business-os:platform.roles.manage')),(private.seed_uuid('business-os:platform_super_admin'),private.seed_uuid('business-os:platform.audit.view'));
insert into public.platform_roles(id,key,name) values(private.seed_uuid('business-os:platform_admin'),'platform_admin','platform admin');
insert into public.platform_role_permissions(role_id,permission_id) values (private.seed_uuid('business-os:platform_admin'),private.seed_uuid('business-os:platform.access')),(private.seed_uuid('business-os:platform_admin'),private.seed_uuid('business-os:platform.organizations.view')),(private.seed_uuid('business-os:platform_admin'),private.seed_uuid('business-os:platform.organizations.manage')),(private.seed_uuid('business-os:platform_admin'),private.seed_uuid('business-os:platform.entitlements.view')),(private.seed_uuid('business-os:platform_admin'),private.seed_uuid('business-os:platform.entitlements.manage')),(private.seed_uuid('business-os:platform_admin'),private.seed_uuid('business-os:platform.catalog.view')),(private.seed_uuid('business-os:platform_admin'),private.seed_uuid('business-os:platform.audit.view'));
insert into public.platform_roles(id,key,name) values(private.seed_uuid('business-os:platform_support'),'platform_support','platform support');
insert into public.platform_role_permissions(role_id,permission_id) values (private.seed_uuid('business-os:platform_support'),private.seed_uuid('business-os:platform.access')),(private.seed_uuid('business-os:platform_support'),private.seed_uuid('business-os:platform.organizations.view')),(private.seed_uuid('business-os:platform_support'),private.seed_uuid('business-os:platform.entitlements.view')),(private.seed_uuid('business-os:platform_support'),private.seed_uuid('business-os:platform.catalog.view'));
commit;

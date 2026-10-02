-- Development packaging only: no prices, passwords or production commercial claims.
begin;
insert into public.plans(id,key,name) values(private.seed_uuid('business-os:plan:starter'),'starter','Starter') on conflict(key) do nothing;
insert into public.plan_modules(plan_id,module_id) select p.id,m.id from public.plans p cross join public.modules m where p.key='starter' and m.key in ('crm','quotation','billing','catalog') on conflict do nothing;
insert into public.plans(id,key,name) values(private.seed_uuid('business-os:plan:professional'),'professional','Professional') on conflict(key) do nothing;
insert into public.plan_modules(plan_id,module_id) select p.id,m.id from public.plans p cross join public.modules m where p.key='professional' and m.key in ('crm','quotation','billing','catalog','pricing','projects','brochure','client_portal') on conflict do nothing;
insert into public.plans(id,key,name) values(private.seed_uuid('business-os:plan:business'),'business','Business') on conflict(key) do nothing;
insert into public.plan_modules(plan_id,module_id) select p.id,m.id from public.plans p cross join public.modules m where p.key='business' and m.key in ('crm','quotation','billing','projects','catalog','pricing','vendors','purchasing','brochure','website','client_portal','reports') on conflict do nothing;
insert into private.provisioning_defaults(singleton,plan_id) select true,id from public.plans where key='starter' on conflict(singleton) do nothing;
commit;
